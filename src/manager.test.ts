import { Manager } from './manager';
import { Connection, PlainConnection, SecureConnection } from './connection';

jest.mock('./connection');

// const MockedConnection = Connection as jest.MockedClass<typeof Connection>;
const MockedPlainConnection = PlainConnection as jest.MockedClass<typeof PlainConnection>;
const MockedSecureConnection = SecureConnection as jest.MockedClass<typeof SecureConnection>;

describe('Manager', () => {
  const options = {
    host: 'localhost',
    port: 12345,
    ssl_enable: false,
    max_connect_retries: 4,
    timeout_connect_retries: 100
  };

  beforeEach(() => {
    // MockedConnection.mockClear();
    MockedPlainConnection.mockClear();
    MockedSecureConnection.mockClear();
  });

  test('initializes with provided options', () => {
    const connection = new MockedPlainConnection(options);
    const manager = new Manager(options, connection);
    // @ts-ignore
    expect(manager.options).toBe(options);
    // @ts-ignore
    expect(manager.maxConnectRetries).toBe(options.max_connect_retries);
    // @ts-ignore
    expect(manager.timeoutConnectRetries).toBe(options.timeout_connect_retries);
  });

  test('logs an entry', () => {
    const connection = new MockedPlainConnection(options);
    connection.send = jest.fn().mockReturnValue(true);
    const logEntry = 'test log entry';
    const callback = jest.fn();
    const manager = new Manager(options, connection);
    
    manager.log(logEntry, callback);

    // @ts-ignore
    expect(manager.logQueue).toHaveLength(1);
    // @ts-ignore
    expect(manager.logQueue[0][0]).toBe(logEntry);
  });

  test('flushes log queue', () => {
    const connection = new MockedPlainConnection(options);
    connection.send = jest.fn().mockReturnValue(true);
    connection.readyToSend = jest.fn().mockReturnValue(true);

    const logEntry = 'test log entry';
    const callback = jest.fn();
    const manager = new Manager(options, connection);
    // @ts-ignore
    manager.logQueue.push([logEntry, callback]);
    manager.flush();
    // @ts-ignore
    expect(manager.logQueue).toHaveLength(0);
    // @ts-ignore
    expect(connection.send).toHaveBeenCalledWith(logEntry + '\n', expect.any(Function));
  });
});
