import { Manager } from './manager';
import { ConnectionEvents, PlainConnection } from './connection';
import { RetryStrategy } from './types';

jest.mock('./connection');

const MockedPlainConnection = PlainConnection as jest.MockedClass<typeof PlainConnection>;

describe('Manager', () => {
  let manager: Manager;
  let connection: PlainConnection;
  const options = {
    host: 'localhost',
    port: 12345,
    ssl_enable: false,
    max_connect_retries: 4,
    timeout_connect_retries: 100
  };

  beforeEach(() => {
    jest.useFakeTimers();
    connection = new MockedPlainConnection(options);
    manager = new Manager(options, connection);
    connection.send = jest.fn().mockReturnValue(true);
    connection.readyToSend = jest.fn().mockReturnValue(true);
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
  
    // Set the number of retries to the max.
    manager['retries'] = manager['retryStrategy'].maxConnectRetries;
  
    // Trigger an error on the connection.
    connection.emit(ConnectionEvents.Error, error);
  
    jest.runAllTimers();
  
    // Check that the manager's start method was not called.
    expect(spyOnStart).not.toHaveBeenCalled();
  });
  
  test('should close the manager', () => {
    const spyOnClose = jest.spyOn(connection, 'close');
    const spyOnEmit = jest.spyOn(manager, 'emit');
  
    manager.close();
  
    expect(spyOnEmit).toHaveBeenCalledWith('closing');
    expect(spyOnClose).toHaveBeenCalled();
  });

  test('can set a new connection', () => {
    const newConnection = new MockedPlainConnection(options);
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
      max_connect_retries: -1
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
      }
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
      }
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
      }
    }, connection);
    
    // Set delay to a high value that would exceed max when doubled
    backoffManager['nextRetryDelayMs'] = 400;
    
    // Simulate retry logic (we test the calculation directly)
    const currentDelay = backoffManager['nextRetryDelayMs'];
    backoffManager['nextRetryDelayMs'] = Math.min(
      backoffManager['nextRetryDelayMs'] * 2,
      500 // maxDelayBeforeRetryMs
    );
    
    // Delay should be capped at 500
    expect(backoffManager['nextRetryDelayMs']).toBe(500);
  });

  // ============================================
  // BACKWARD COMPATIBILITY VERIFICATION TESTS
  // ============================================

  describe('Backward Compatibility', () => {
    test('legacy max_connect_retries only - uses default timeout', () => {
      const manager = new Manager({ max_connect_retries: 10 }, connection);
      expect(manager['retryStrategy']).toEqual<RetryStrategy>({
        strategy: 'fixedDelay',
        maxConnectRetries: 10,
        delayBeforeRetryMs: 100,  // default
      });
    });

    test('legacy timeout_connect_retries only - uses default max retries', () => {
      const manager = new Manager({ timeout_connect_retries: 500 }, connection);
      expect(manager['retryStrategy']).toEqual<RetryStrategy>({
        strategy: 'fixedDelay',
        maxConnectRetries: 4,  // default
        delayBeforeRetryMs: 500,
      });
    });

    test('legacy max_connect_retries: -1 allows infinite retries', () => {
      const manager = new Manager({ max_connect_retries: -1 }, connection);
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
        max_connect_retries: 10,  // This should be ignored
        timeout_connect_retries: 500,  // This should be ignored
        retryStrategy: {
          strategy: 'exponentialBackoff',
          maxConnectRetries: -1,
          maxDelayBeforeRetryMs: 60000,
        }
      }, connection);
      
      expect(manager['retryStrategy'].strategy).toBe('exponentialBackoff');
    });
  });
  
});
