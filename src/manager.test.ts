import { Manager } from './manager';
import { Connection, PlainConnection, SecureConnection } from './connection';

jest.mock('./connection');

const MockedConnection = Connection as jest.MockedClass<typeof Connection>;
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
    const manager = new Manager(options);
    expect(manager.options).toBe(options);
    expect(manager.useSecureConnection).toBe(options.ssl_enable);
    expect(manager.maxConnectRetries).toBe(options.max_connect_retries);
    expect(manager.timeoutConnectRetries).toBe(options.timeout_connect_retries);
  });

  test('creates plain connection', () => {
    const manager = new Manager(options);
    manager.start();
    expect(PlainConnection).toHaveBeenCalledTimes(1);
    expect(SecureConnection).toHaveBeenCalledTimes(0);
  });

  test('creates secure connection', () => {
    const manager = new Manager({ ...options, ssl_enable: true });
    manager.start();
    expect(PlainConnection).toHaveBeenCalledTimes(0);
    expect(SecureConnection).toHaveBeenCalledTimes(1);
  });

  test('logs an entry', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();
    const manager = new Manager(options);
    manager.connection = new PlainConnection(options, manager);
    manager.connection.send = jest.fn().mockReturnValue(true);
    manager.log(logEntry, callback);
    expect(manager.logQueue).toHaveLength(1);
    expect(manager.logQueue[0][0]).toBe(logEntry);
  });

  test('flushes log queue', () => {
    const logEntry = 'test log entry';
    const callback = jest.fn();
    const manager = new Manager(options);
    manager.connection = new PlainConnection(options, manager);
    manager.connection.send = jest.fn().mockReturnValue(true);
    manager.connection.readyToSend = jest.fn().mockReturnValue(true);
    manager.logQueue.push([logEntry, callback]);
    manager.flush();
    expect(manager.logQueue).toHaveLength(0);
    expect(manager.connection.send).toHaveBeenCalledWith(logEntry + '\n', expect.any(Function));
  });
});
