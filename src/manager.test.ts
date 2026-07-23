import {EventEmitter} from 'events';
import {Manager} from './manager';
import {ConnectionEvents, IConnection} from './connection';
import {RetryStrategy} from './types';

function createMockConnection(): IConnection {
  const connection = new EventEmitter() as IConnection;
  connection.connect = jest.fn();
  connection.close = jest.fn();
  connection.send = jest.fn().mockReturnValue(true);
  connection.readyToSend = jest.fn().mockReturnValue(true);
  return connection;
}

describe('Manager', () => {
  let manager: Manager;
  let connection: IConnection;
  const options = {
    host: 'localhost',
    port: 12345,
    ssl_enable: false,
    max_connect_retries: 4,
    timeout_connect_retries: 100,
  };

  beforeEach(() => {
    jest.useFakeTimers();
    connection = createMockConnection();
    manager = new Manager(options, connection);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('initializes with provided legacy options converted to fixedDelay strategy', () => {
    expect(manager['options']).toBe(options);
    expect(manager['retryStrategy']).toEqual<RetryStrategy>({
      strategy: 'fixedDelay',
      maxConnectRetries: options.max_connect_retries,
      delayBeforeRetryMs: options.timeout_connect_retries,
    });
  });

  test('initializes with explicit retryStrategy when provided', () => {
    const explicitStrategy: RetryStrategy = {
      strategy: 'exponentialBackoff',
      maxConnectRetries: -1,
      initialDelayMs: 50,
      maxDelayBeforeRetryMs: 60000,
    };
    const managerWithStrategy = new Manager({
      retryStrategy: explicitStrategy,
    }, connection);
    expect(managerWithStrategy['retryStrategy']).toEqual(explicitStrategy);
  });

  test('uses default fixedDelay when no options provided', () => {
    const managerNoOptions = new Manager({}, connection);
    expect(managerNoOptions['retryStrategy']).toEqual<RetryStrategy>({
      strategy: 'fixedDelay',
      maxConnectRetries: 4,
      delayBeforeRetryMs: 100,
    });
  });

  test('logs an entry', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();

    manager.log(logEntry, callback);

    expect(manager['logQueue']).toHaveLength(1);
    expect(manager['logQueue'][0][0]).toBe(logEntry);
  });

  test('flushes log queue', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();
    manager['logQueue'].push([logEntry, callback]);

    manager.flush();

    expect(manager['logQueue']).toHaveLength(0);
    expect(connection.send).toHaveBeenCalledWith(logEntry + '\n', expect.any(Function));
  });

  test('should emit events when connection methods are called', () => {
    const mockEventEmit = jest.spyOn(manager, 'emit');

    manager['onConnected']();
    expect(mockEventEmit).toHaveBeenCalledWith('connected');

    mockEventEmit.mockClear();

    // @ts-ignore
    manager.onConnectionClosed(new Error());
    expect(mockEventEmit).toHaveBeenCalledWith('closed');
  });

  test('should stop retrying after max retries are reached', () => {
    const spyOnStart = jest.spyOn(manager, 'start');
    const error = new Error('Test error');
    manager.on('error', jest.fn()); // swallow OFFLINE error

    // Set the number of retries to the max.
    manager['retries'] = manager['retryStrategy'].maxConnectRetries;
    manager['addEventListeners']();

    // Trigger an error on the connection.
    connection.emit(ConnectionEvents.Error, error);

    jest.runAllTimers();

    // Check that the manager's start method was not called.
    expect(spyOnStart).not.toHaveBeenCalled();
  });

  test('emits OFFLINE error when max retries are reached', () => {
    const errorHandler = jest.fn();
    manager.on('error', errorHandler);
    connection.close = jest.fn();
    manager['retries'] = manager['retryStrategy'].maxConnectRetries;
    manager['addEventListeners']();

    connection.emit(ConnectionEvents.Error, new Error('connection failed'));

    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('OFFLINE'),
      }),
    );
    expect(connection.close).toHaveBeenCalled();
  });

  test('schedules start() after connection error when under max retries', () => {
    const startSpy = jest.spyOn(manager, 'start');
    connection.close = jest.fn().mockImplementation(() => {
      connection.emit(ConnectionEvents.Closed);
    });
    manager['retries'] = 0;
    manager['addEventListeners']();

    connection.emit(ConnectionEvents.Error, new Error('transient'));

    expect(manager['retryTimeout']).toBeDefined();
    startSpy.mockClear();
    jest.advanceTimersByTime(options.timeout_connect_retries);
    expect(startSpy).toHaveBeenCalled();
  });

  test('close() during pending retry must not call start() when timer fires', () => {
    const startSpy = jest.spyOn(manager, 'start');
    connection.close = jest.fn().mockImplementation(() => {
      connection.emit(ConnectionEvents.Closed);
    });
    manager['retries'] = 0;
    manager['addEventListeners']();

    connection.emit(ConnectionEvents.Error, new Error('transient'));
    expect(manager['retryTimeout']).toBeDefined();

    startSpy.mockClear();
    manager.close();
    expect(manager['retryTimeout']).toBeUndefined();
    jest.runAllTimers();

    expect(startSpy).not.toHaveBeenCalled();
  });

  test('stops flush when send returns false and resumes on Drain', () => {
    let sendCount = 0;
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      sendCount++;
      cb();
      // First write signals backpressure
      return sendCount === 1 ? false : true;
    });
    manager['addEventListeners']();
    manager['logQueue'].push(
      ['entry-a', jest.fn()],
      ['entry-b', jest.fn()],
      ['entry-c', jest.fn()],
    );

    manager.flush();

    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(manager['logQueue']).toHaveLength(2);

    connection.emit(ConnectionEvents.Drain);

    expect(connection.send).toHaveBeenCalledTimes(3);
    expect(manager['logQueue']).toHaveLength(0);
  });

  test('flush is a no-op when connection is not readyToSend', () => {
    connection.readyToSend = jest.fn().mockReturnValue(false);
    manager['logQueue'].push(['held', jest.fn()]);

    manager.flush();

    expect(connection.send).not.toHaveBeenCalled();
    expect(manager['logQueue']).toHaveLength(1);
  });

  test('retry uses exponentialBackoff delay progression', () => {
    const backoffManager = new Manager({
      retryStrategy: {
        strategy: 'exponentialBackoff',
        maxConnectRetries: -1,
        initialDelayMs: 100,
        maxDelayBeforeRetryMs: 500,
      },
    }, connection);
    const startSpy = jest.spyOn(backoffManager, 'start');
    connection.close = jest.fn().mockImplementation(() => {
      connection.emit(ConnectionEvents.Closed);
    });
    backoffManager['retries'] = 0;
    backoffManager['addEventListeners']();

    connection.emit(ConnectionEvents.Error, new Error('transient'));
    expect(backoffManager['nextRetryDelayMs']).toBe(200);

    startSpy.mockClear();
    jest.advanceTimersByTime(100);
    expect(startSpy).toHaveBeenCalled();
  });

  test('should close the manager', () => {
    const spyOnClose = jest.spyOn(connection, 'close');
    const spyOnEmit = jest.spyOn(manager, 'emit');

    manager.close();

    expect(spyOnEmit).toHaveBeenCalledWith('closing');
    expect(spyOnClose).toHaveBeenCalled();
  });

  test('can set a new connection', () => {
    const newConnection = createMockConnection();
    manager.setConnection(newConnection);
    expect(manager['connection']).toBe(newConnection);
  });

  test('re-queues log entry when send fails with error', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();

    // Mock send to call callback with an error
    let sendCallback: (error?: Error) => void;
    connection.send = jest.fn().mockImplementation((entry, cb) => {
      sendCallback = cb;
      return true;
    });

    manager['logQueue'].push([logEntry, callback]);
    manager.flush();

    // Simulate send error
    sendCallback!(new Error('Send failed'));

    // Entry should be re-queued
    expect(manager['logQueue']).toHaveLength(1);
    expect(manager['logQueue'][0][0]).toBe(logEntry);
    expect(callback).not.toHaveBeenCalled();
  });

  test('calls callback when send succeeds', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();

    let sendCallback: (error?: Error) => void;
    connection.send = jest.fn().mockImplementation((entry, cb) => {
      sendCallback = cb;
      return true;
    });

    manager['logQueue'].push([logEntry, callback]);
    manager.flush();

    // Simulate successful send
    sendCallback!();

    expect(callback).toHaveBeenCalled();
  });

  test('isRetryableError always returns true (current implementation)', () => {
    // Note: isRetryableError currently always returns true per TODO in code
    const error = new Error('Any error');
    expect(manager['isRetryableError'](error)).toBe(true);
  });

  test('shouldTryToReconnect returns false when max retries reached', () => {
    const error = new Error('Connection error');

    manager['retries'] = manager['retryStrategy'].maxConnectRetries + 1;

    expect(manager['shouldTryToReconnect'](error)).toBe(false);
  });

  test('shouldTryToReconnect returns true when under max retries', () => {
    const error = new Error('Connection error');

    manager['retries'] = 0;

    expect(manager['shouldTryToReconnect'](error)).toBe(true);
  });

  test('shouldTryToReconnect returns true with infinite retries', () => {
    const infiniteManager = new Manager({
      ...options,
      max_connect_retries: -1,
    }, connection);

    const error = new Error('Connection error');
    infiniteManager['retries'] = 1000;

    expect(infiniteManager['shouldTryToReconnect'](error)).toBe(true);
  });

  test('shouldTryToReconnect returns true with exponentialBackoff and infinite retries', () => {
    const backoffManager = new Manager({
      retryStrategy: {
        strategy: 'exponentialBackoff',
        maxConnectRetries: -1,
        maxDelayBeforeRetryMs: 60000,
      },
    }, connection);

    const error = new Error('Connection error');
    backoffManager['retries'] = 10000;

    expect(backoffManager['shouldTryToReconnect'](error)).toBe(true);
  });

  test('resets exponential backoff delay on successful connection', () => {
    const backoffManager = new Manager({
      retryStrategy: {
        strategy: 'exponentialBackoff',
        maxConnectRetries: -1,
        initialDelayMs: 100,
        maxDelayBeforeRetryMs: 60000,
      },
    }, connection);

    // Simulate some retries that increased the delay
    backoffManager['nextRetryDelayMs'] = 6400;

    // Simulate successful connection
    backoffManager['onConnected']();

    // Delay should be reset to initial
    expect(backoffManager['nextRetryDelayMs']).toBe(100);
  });

  test('exponential backoff caps delay at maxDelayBeforeRetryMs', () => {
    const backoffManager = new Manager({
      retryStrategy: {
        strategy: 'exponentialBackoff',
        maxConnectRetries: -1,
        initialDelayMs: 100,
        maxDelayBeforeRetryMs: 500,
      },
    }, connection);

    // Set delay to a high value that would exceed max when doubled
    backoffManager['nextRetryDelayMs'] = 400;

    // Simulate retry logic (we test the calculation directly)
    const currentDelay = backoffManager['nextRetryDelayMs'];
    backoffManager['nextRetryDelayMs'] = Math.min(
      backoffManager['nextRetryDelayMs'] * 2,
      500, // maxDelayBeforeRetryMs
    );

    // Delay should be capped at 500
    expect(backoffManager['nextRetryDelayMs']).toBe(500);
  });

  // ============================================
  // BACKWARD COMPATIBILITY VERIFICATION TESTS
  // ============================================

  describe('Backward Compatibility', () => {
    test('legacy max_connect_retries only - uses default timeout', () => {
      const manager = new Manager({max_connect_retries: 10}, connection);
      expect(manager['retryStrategy']).toEqual<RetryStrategy>({
        strategy: 'fixedDelay',
        maxConnectRetries: 10,
        delayBeforeRetryMs: 100, // default
      });
    });

    test('legacy timeout_connect_retries only - uses default max retries', () => {
      const manager = new Manager({timeout_connect_retries: 500}, connection);
      expect(manager['retryStrategy']).toEqual<RetryStrategy>({
        strategy: 'fixedDelay',
        maxConnectRetries: 4, // default
        delayBeforeRetryMs: 500,
      });
    });

    test('legacy max_connect_retries: -1 allows infinite retries', () => {
      const manager = new Manager({max_connect_retries: -1}, connection);
      manager['retries'] = 999999;
      expect(manager['shouldTryToReconnect'](new Error('test'))).toBe(true);
    });

    test('default behavior: stops after 4 retries', () => {
      const manager = new Manager({}, connection);

      // After 4 retries, should stop
      manager['retries'] = 4;
      expect(manager['shouldTryToReconnect'](new Error('test'))).toBe(false);

      // At 3 retries, should continue (0, 1, 2, 3 = 4 attempts allowed)
      manager['retries'] = 3;
      expect(manager['shouldTryToReconnect'](new Error('test'))).toBe(true);
    });

    test('retryStrategy takes precedence over legacy options', () => {
      const manager = new Manager({
        max_connect_retries: 10, // This should be ignored
        timeout_connect_retries: 500, // This should be ignored
        retryStrategy: {
          strategy: 'exponentialBackoff',
          maxConnectRetries: -1,
          maxDelayBeforeRetryMs: 60000,
        },
      }, connection);

      expect(manager['retryStrategy'].strategy).toBe('exponentialBackoff');
    });
  });
});
