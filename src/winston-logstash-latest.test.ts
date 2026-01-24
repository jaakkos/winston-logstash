import {describe, expect, test, beforeEach, jest} from '@jest/globals';

// Test the safeStringify functionality by importing the transport
// and verifying it handles circular references

jest.mock('./connection');
jest.mock('./manager');

describe('winston-logstash-latest transport', () => {
  let LogstashTransport: any;
  let mockManager: any;

  beforeEach(() => {
    jest.resetModules();

    // Setup mock manager
    mockManager = {
      on: jest.fn(),
      start: jest.fn(),
      log: jest.fn(),
      close: jest.fn(),
    };

    // Mock the Manager constructor
    jest.doMock('./manager', () => ({
      Manager: jest.fn().mockImplementation(() => mockManager),
    }));

    // Import after mocking
    LogstashTransport = require('./winston-logstash-latest');
  });

  test('handles circular references without crashing', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // Create an object with circular reference (like Axios errors)
    const circularObj: any = {
      message: 'Test error',
      level: 'error',
    };
    circularObj.self = circularObj; // Create circular reference

    const callback = jest.fn();

    // This should not throw
    expect(() => {
      transport.log(circularObj, callback);
    }).not.toThrow();

    // Verify manager.log was called with a string
    expect(mockManager.log).toHaveBeenCalled();
    const loggedString = mockManager.log.mock.calls[0][0];

    // Verify the logged string is valid JSON
    expect(() => JSON.parse(loggedString)).not.toThrow();

    // Verify circular reference was replaced
    const parsed = JSON.parse(loggedString);
    expect(parsed.message).toBe('Test error');
    expect(parsed.self).toBe('[Circular]');
  });

  test('handles deeply nested circular references', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // Create deeply nested circular reference
    const obj: any = {
      level: 'info',
      message: 'test',
      deep: {
        nested: {
          value: 'hello',
        },
      },
    };
    obj.deep.nested.parent = obj.deep; // Circular in nested object

    const callback = jest.fn();

    expect(() => {
      transport.log(obj, callback);
    }).not.toThrow();

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);
    expect(parsed.deep.nested.parent).toBe('[Circular]');
  });

  test('handles normal objects without modification', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    const normalObj = {
      level: 'info',
      message: 'Hello world',
      meta: {
        userId: 123,
        action: 'login',
      },
    };

    const callback = jest.fn();
    transport.log(normalObj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    expect(parsed).toEqual(normalObj);
  });

  test('handles shared object references without marking as circular', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // Create a shared object (same object referenced in multiple places)
    // This is NOT circular - it's just shared
    const sharedMeta = {requestId: 'abc-123', timestamp: 1234567890};
    const obj = {
      level: 'info',
      message: 'test',
      request: sharedMeta,
      response: sharedMeta, // Same object, different key - NOT circular
    };

    const callback = jest.fn();
    transport.log(obj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    // Both should have the full object, NOT [Circular]
    expect(parsed.request).toEqual(sharedMeta);
    expect(parsed.response).toEqual(sharedMeta);
    expect(parsed.response).not.toBe('[Circular]');
  });

  test('handles shared nested objects correctly', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // More complex shared reference scenario
    const config = {host: 'localhost', port: 8080};
    const obj = {
      level: 'info',
      message: 'test',
      services: {
        api: {name: 'api', config: config},
        worker: {name: 'worker', config: config}, // Same config object
      },
    };

    const callback = jest.fn();
    transport.log(obj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    // Both should have the full config object
    expect(parsed.services.api.config).toEqual(config);
    expect(parsed.services.worker.config).toEqual(config);
    expect(parsed.services.worker.config).not.toBe('[Circular]');
  });

  test('strips ANSI color codes from messages', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // Simulate colorized log message (like from winston.format.colorize())
    const obj = {
      level: '\x1b[32minfo\x1b[39m', // green "info"
      message: '\x1b[33mHello World\x1b[39m', // yellow message
    };

    const callback = jest.fn();
    transport.log(obj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    // ANSI codes should be stripped
    expect(parsed.level).toBe('info');
    expect(parsed.message).toBe('Hello World');
  });

  test('strips ANSI color codes from nested metadata', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    const obj = {
      level: 'info',
      message: 'test',
      meta: {
        status: '\x1b[31merror\x1b[39m', // red "error"
        details: {
          code: '\x1b[34m500\x1b[39m', // blue "500"
        },
      },
    };

    const callback = jest.fn();
    transport.log(obj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    expect(parsed.meta.status).toBe('error');
    expect(parsed.meta.details.code).toBe('500');
  });

  test('handles various ANSI escape sequences', () => {
    const transport = new LogstashTransport({
      host: 'localhost',
      port: 28777,
    });

    // Test various ANSI sequences: bold, underline, colors, background
    const obj = {
      level: 'info',
      bold: '\x1b[1mBold\x1b[22m',
      underline: '\x1b[4mUnderline\x1b[24m',
      bgColor: '\x1b[41mRed Background\x1b[49m',
      combined: '\x1b[1m\x1b[31mBold Red\x1b[39m\x1b[22m',
    };

    const callback = jest.fn();
    transport.log(obj, callback);

    const loggedString = mockManager.log.mock.calls[0][0];
    const parsed = JSON.parse(loggedString);

    expect(parsed.bold).toBe('Bold');
    expect(parsed.underline).toBe('Underline');
    expect(parsed.bgColor).toBe('Red Background');
    expect(parsed.combined).toBe('Bold Red');
  });
});
