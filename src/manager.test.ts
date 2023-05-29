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
  
});
