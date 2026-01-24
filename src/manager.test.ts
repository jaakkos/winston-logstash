import { Manager } from './manager';
import { Connection, ConnectionEvents, PlainConnection, SecureConnection } from './connection';

jest.mock('./connection');

const MockedPlainConnection = PlainConnection as jest.MockedClass<typeof PlainConnection>;
const MockedSecureConnection = SecureConnection as jest.MockedClass<typeof SecureConnection>;

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

  test('initializes with provided options', () => {
    expect(manager['options']).toBe(options);
    expect(manager['maxConnectRetries']).toBe(options.max_connect_retries);
    expect(manager['timeoutConnectRetries']).toBe(options.timeout_connect_retries);
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
    manager['retries'] = manager['maxConnectRetries'];
  
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
    
    manager['retries'] = manager['maxConnectRetries'] + 1;
    
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
  
});
