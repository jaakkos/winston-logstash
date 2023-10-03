import { Manager} from './manager';
import { ConnectionEvents, PlainConnection } from './connection';
import { LogstashTransportOptions, RetryStrategy } from "./types";

jest.mock('./connection');

const MockedPlainConnection = PlainConnection as jest.MockedClass<typeof PlainConnection>;

describe('Manager', () => {
  let connection: PlainConnection;
  const defaultOptions: LogstashTransportOptions = {
    ssl_enable: false,
    max_connect_retries: 4,
    timeout_connect_retries: 100
  };

  beforeEach(() => {
    jest.useFakeTimers();
    connection = new MockedPlainConnection({ host: 'localhost', port: 12345 });
    connection.send = jest.fn().mockReturnValue(true);
    connection.readyToSend = jest.fn().mockReturnValue(true);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('initializes with provided options', () => {
    const manager = new Manager(defaultOptions, connection);
    expect(manager['options']).toBe(defaultOptions);
    expect(manager["retryStrategy"]).toEqual<RetryStrategy>({
      strategy: "fixedDelay",
      delayBeforeRetryMs: defaultOptions.timeout_connect_retries!,
      maxConnectRetries: defaultOptions.max_connect_retries!,
    });
  });

  test('logs an entry', () => {
    const manager = new Manager(defaultOptions, connection);
    const logEntry = 'test log entry';
    const callback = jest.fn();

    manager.log(logEntry, callback);

    expect(manager['logQueue']).toHaveLength(1);
    expect(manager['logQueue'][0][0]).toBe(logEntry);
  });

  test('flushes log queue', () => {
    const manager = new Manager(defaultOptions, connection);
    const logEntry = 'test log entry';
    const callback = jest.fn();
    manager['logQueue'].push([logEntry, callback]);

    manager.flush();

    expect(manager['logQueue']).toHaveLength(0);
    expect(connection.send).toHaveBeenCalledWith(logEntry + '\n', expect.any(Function));
  });

  test('should emit events when connection methods are called', () => {
    const manager = new Manager(defaultOptions, connection);
    const mockEventEmit = jest.spyOn(manager, 'emit');

    manager['onConnected']();
    expect(mockEventEmit).toHaveBeenCalledWith('flushing');
    mockEventEmit.mockClear();

    manager['onConnectionClosed'](new Error());
    expect(mockEventEmit).toHaveBeenCalledWith('closed');
  });

  test('should stop retrying after max retries are reached', () => {
    const manager = new Manager(defaultOptions, connection);

    // Set the number of retries to the max.
    manager['retries'] = manager['retryStrategy']['maxConnectRetries'];
    // Add connection listeners.
    manager.start();

    // Handle manager errors so no unhandled errors stop the test.
    let receivedError: Error | null = null;
    manager.on('error', (error) => {
      receivedError = error;
    });

    // Trigger an error on the connection.
    const spyOnStart = jest.spyOn(manager, 'start');
    const error = new Error('Test error');
    connection.emit(ConnectionEvents.Error, error);

    jest.runAllTimers();

    // Check that the manager's start method was not called.
    expect(spyOnStart).not.toHaveBeenCalled();
    expect(receivedError).not.toBeNull();
  });

  test('should retry with exponential backoff', () => {
    const manager = new Manager({
      ssl_enable: false,
      retryStrategy: { strategy: 'exponentialBackoff', maxConnectRetries: -1 },
    }, connection);

    // Add connection listeners.
    manager.start();

    // Trigger an error on the connection.
    const spyOnStart = jest.spyOn(manager, 'start');
    const error = new Error('Test error');

    connection.emit(ConnectionEvents.Error, error);
    connection.emit(ConnectionEvents.Closed);
    jest.advanceTimersByTime(100);
    expect(spyOnStart).toHaveBeenCalledTimes(1);

    connection.emit(ConnectionEvents.Error, error);
    connection.emit(ConnectionEvents.Closed);
    jest.advanceTimersByTime(200);
    expect(spyOnStart).toHaveBeenCalledTimes(2);

    connection.emit(ConnectionEvents.Error, error);
    connection.emit(ConnectionEvents.Closed);
    jest.advanceTimersByTime(400);
    expect(spyOnStart).toHaveBeenCalledTimes(3);
  });

  test('should close the manager', () => {
    const manager = new Manager(defaultOptions, connection);
    const spyOnClose = jest.spyOn(connection, 'close');
    const spyOnEmit = jest.spyOn(manager, 'emit');

    manager.close();

    expect(spyOnEmit).toHaveBeenCalledWith('closing');
    expect(spyOnClose).toHaveBeenCalled();
  });
});
