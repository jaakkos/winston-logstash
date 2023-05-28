import { Manager } from './manager';
import { Connection, PlainConnection, SecureConnection } from './connection';

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

  test('should retry to connect after a delay when retry is called', () => {
    const spySetTimeout = jest.spyOn(global, 'setTimeout');
    manager.start = jest.fn();
    
    connection.close = jest.fn().mockImplementationOnce(() => {
      manager.emit('connection:closed')
    })

    // Simulate a retryable error.
    const error = new Error('Test error');
    manager['shouldTryToReconnect'] = jest.fn().mockReturnValue(true);
  
    manager['onConnectionError'](error);
  
    jest.runAllTimers();
  
    expect(spySetTimeout).toHaveBeenCalledTimes(1);
    expect(spySetTimeout).toHaveBeenLastCalledWith(expect.any(Function), manager['timeoutConnectRetries']);
    expect(manager.start).toHaveBeenCalled();
  
    spySetTimeout.mockRestore();
  });

  test('should emit events when connection methods are called', () => {
    const mockEventEmit = jest.spyOn(manager, 'emit');

    // @ts-ignore
    manager['onConnected']();
    expect(mockEventEmit).toHaveBeenCalledWith('connected');

    mockEventEmit.mockClear();
    
    // @ts-ignore
    manager.onConnectionClosed(new Error());
    expect(mockEventEmit).toHaveBeenCalledWith('closed');

  });
});
