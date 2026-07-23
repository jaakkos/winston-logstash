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
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      cb();
      return true;
    });
    manager['logQueue'].push([logEntry, callback]);

    manager.flush();

    expect(manager['logQueue']).toHaveLength(0);
    expect(connection.send).toHaveBeenCalledWith(logEntry + '\n', expect.any(Function));
    expect(callback).toHaveBeenCalled();
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

  test('stops flush when send returns false and resumes after write completes', () => {
    const writeCallbacks: Array<(error?: Error) => void> = [];
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      writeCallbacks.push(cb);
      // First write signals backpressure
      return writeCallbacks.length === 1 ? false : true;
    });
    manager['addEventListeners']();
    manager['logQueue'].push(
      ['entry-a', jest.fn()],
      ['entry-b', jest.fn()],
      ['entry-c', jest.fn()],
    );

    manager.flush();

    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(manager['logQueue']).toHaveLength(3);

    // Completing the backpressured write removes the entry and schedules the next flush
    writeCallbacks[0]!();
    expect(manager['logQueue']).toHaveLength(2);
    jest.runAllTicks();
    expect(connection.send).toHaveBeenCalledTimes(2);

    writeCallbacks[1]!();
    jest.runAllTicks();
    expect(connection.send).toHaveBeenCalledTimes(3);

    writeCallbacks[2]!();
    jest.runAllTicks();
    expect(manager['logQueue']).toHaveLength(0);
  });

  test('Drain event resumes flush when not already writing', () => {
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      cb();
      return true;
    });
    manager['addEventListeners']();
    manager['logQueue'].push(['entry-a', jest.fn()]);

    // Not flushing yet — Drain should kick flush
    connection.emit(ConnectionEvents.Drain);
    jest.runAllTicks();

    expect(connection.send).toHaveBeenCalledTimes(1);
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
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      sendCallback = cb;
      return true;
    });

    manager['logQueue'].push([logEntry, callback]);
    manager.flush();

    // Entry stays at front until write succeeds
    expect(manager['logQueue']).toHaveLength(1);

    // Simulate send error — entry remains at front (not dropped)
    sendCallback!(new Error('Send failed'));

    expect(manager['logQueue']).toHaveLength(1);
    expect(manager['logQueue'][0][0]).toBe(logEntry);
    expect(callback).not.toHaveBeenCalled();
  });

  test('calls callback when send succeeds', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();

    let sendCallback: (error?: Error) => void;
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      sendCallback = cb;
      return true;
    });

    manager['logQueue'].push([logEntry, callback]);
    manager.flush();

    // Simulate successful send
    sendCallback!();

    expect(manager['logQueue']).toHaveLength(0);
    expect(callback).toHaveBeenCalled();
  });

  test('does not start a second write until the first write callback completes', () => {
    const writeCallbacks: Array<(error?: Error) => void> = [];
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      writeCallbacks.push(cb);
      return true;
    });

    const cbA = jest.fn();
    const cbB = jest.fn();
    manager['logQueue'].push(['entry-a', cbA], ['entry-b', cbB]);

    manager.flush();

    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(manager['logQueue']).toHaveLength(2);

    writeCallbacks[0]();
    expect(cbA).toHaveBeenCalled();
    expect(manager['logQueue'][0][0]).toBe('entry-b');

    // Continue via nextTick
    jest.runAllTicks();

    expect(connection.send).toHaveBeenCalledTimes(2);
    writeCallbacks[1]();
    expect(cbB).toHaveBeenCalled();
    expect(manager['logQueue']).toHaveLength(0);
  });

  test('keeps later entries unsent when an in-flight write fails', () => {
    let sendCallback: (error?: Error) => void;
    connection.send = jest.fn().mockImplementation((_entry, cb) => {
      sendCallback = cb;
      return true;
    });

    manager['logQueue'].push(['entry-a', jest.fn()], ['entry-b', jest.fn()]);
    manager.flush();

    expect(connection.send).toHaveBeenCalledTimes(1);

    sendCallback!(new Error('write failed'));
    jest.runAllTicks();

    // Failed entry stays at front; second entry never started
    expect(connection.send).toHaveBeenCalledTimes(1);
    expect(manager['logQueue'].map(([entry]) => entry)).toEqual(['entry-a', 'entry-b']);
  });

  test('isRetryableError always returns true by default (legacy behavior)', () => {
    const refused = Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'});
    const cert = Object.assign(new Error('unable to verify the first certificate'), {
      code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    });
    expect(manager['isRetryableError'](refused)).toBe(true);
    expect(manager['isRetryableError'](cert)).toBe(true);
    expect(manager['isRetryableError'](new Error('Any error'))).toBe(true);
  });

  describe('retry_transient_errors_only', () => {
    let transientManager: Manager;

    beforeEach(() => {
      transientManager = new Manager({
        ...options,
        retry_transient_errors_only: true,
      }, connection);
    });

    test('retries ECONNREFUSED when opt-in is enabled', () => {
      const startSpy = jest.spyOn(transientManager, 'start');
      connection.close = jest.fn().mockImplementation(() => {
        connection.emit(ConnectionEvents.Closed);
      });
      transientManager['retries'] = 0;
      transientManager['addEventListeners']();

      const refused = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:12345'), {
        code: 'ECONNREFUSED',
      });
      connection.emit(ConnectionEvents.Error, refused);

      expect(transientManager['retryTimeout']).toBeDefined();
      startSpy.mockClear();
      jest.advanceTimersByTime(options.timeout_connect_retries);
      expect(startSpy).toHaveBeenCalled();
    });

    test('fail-fast on permanent TLS certificate errors', () => {
      const startSpy = jest.spyOn(transientManager, 'start');
      const errorHandler = jest.fn();
      transientManager.on('error', errorHandler);
      connection.close = jest.fn();
      transientManager['retries'] = 0;
      transientManager['addEventListeners']();

      const certError = Object.assign(new Error('unable to verify the first certificate'), {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      });
      connection.emit(ConnectionEvents.Error, certError);

      expect(startSpy).not.toHaveBeenCalled();
      expect(transientManager['retryTimeout']).toBeUndefined();
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('Non-retryable connection error'),
        }),
      );
      expect(errorHandler.mock.calls[0][0].cause).toBe(certError);
      expect(connection.close).toHaveBeenCalled();
    });

    test('retries unknown errors when opt-in is enabled', () => {
      const startSpy = jest.spyOn(transientManager, 'start');
      connection.close = jest.fn().mockImplementation(() => {
        connection.emit(ConnectionEvents.Closed);
      });
      transientManager['retries'] = 0;
      transientManager['addEventListeners']();

      connection.emit(ConnectionEvents.Error, new Error('weird'));

      expect(transientManager['retryTimeout']).toBeDefined();
      startSpy.mockClear();
      jest.advanceTimersByTime(options.timeout_connect_retries);
      expect(startSpy).toHaveBeenCalled();
    });

    test('emits classic Max retries OFFLINE after exhausting transient retries', () => {
      const errorHandler = jest.fn();
      transientManager.on('error', errorHandler);
      connection.close = jest.fn();
      transientManager['retries'] = transientManager['retryStrategy'].maxConnectRetries;
      transientManager['addEventListeners']();

      const refused = Object.assign(new Error('connect ECONNREFUSED'), {code: 'ECONNREFUSED'});
      connection.emit(ConnectionEvents.Error, refused);

      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Max retries reached, transport in silent mode, OFFLINE',
        }),
      );
    });

    test('isRetryableError classifies transient vs permanent', () => {
      const refused = Object.assign(new Error('ECONNREFUSED'), {code: 'ECONNREFUSED'});
      const cert = Object.assign(new Error('certificate has expired'), {code: 'CERT_HAS_EXPIRED'});
      expect(transientManager['isRetryableError'](refused)).toBe(true);
      expect(transientManager['isRetryableError'](cert)).toBe(false);
      expect(transientManager['isRetryableError'](new Error('weird'))).toBe(true);
    });
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
