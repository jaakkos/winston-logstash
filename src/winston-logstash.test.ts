
import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { sslFilePath, createTestServer, createTestSecureServer, setup, tearDown, createTestServerWithRestart } from '../test/test_helper';
import net from 'net'
import tls from 'tls';
import winston, { LoggerInstance } from 'winston';
import timekeeper from 'timekeeper';
const freezedTime = new Date(1330688329321);
const port = 28777;

import { Logstash } from './winston-logstash';
import { Socket } from 'net';

const portSeed = port;
const nextFreePort = () => portSeed;

describe('winston-logstash transport', function () {
  function createLogger(port: number, secure: boolean = false, extraOptions: Object = {}): LoggerInstance {
    let transportsConfiguration = {
      port: port,
      host: 'localhost',
      node_name: 'test',
      pid: 12345,
      ssl_enable: secure ? true : false,
      ca: secure ? sslFilePath('ca.cert') : undefined,
      ssl_key: secure ? sslFilePath('client.key') : undefined,
      ssl_cert: secure ? sslFilePath('client.cert') : undefined,
    };

    transportsConfiguration = Object.assign({},
      extraOptions, transportsConfiguration);

    return new (winston.Logger)({
      transports: [
        new Logstash(transportsConfiguration),
      ],
    });
  }

  describe('with logstash server', function () {
    let testServer: net.Server;
    let logger: LoggerInstance;

    beforeEach(() => setup(timekeeper));

    test('send logs over TCP as valid json', function (done) {
      let nextFree = nextFreePort();
      let response;
      const expected = {
        'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'
      };

      testServer = createTestServer(nextFree, function (data: Buffer) {
        response = data.toString();
        expect(JSON.parse(response)).toEqual(expected);
        done();
      });

      logger = createLogger(nextFree);
      logger.log('info', 'hello world', { stream: 'sample' });
    });

    test('send each log with a new line character', function (done) {
      let response;
      let nextFree = nextFreePort();

      testServer = createTestServer(nextFree, function (data: Buffer) {
        response = data.toString();
        // eslint-disable-next-line max-len
        expect(response).toBe(
          '{"stream":"sample","level":"info","message":"hello world","label":"test"}\n'
        );
        done();
      });

      logger = createLogger(nextFree);
      logger.log('info', 'hello world', { stream: 'sample' });
    });

    test('send with different log levels', function (done) {
      let response;
      let nextFree = nextFreePort();

      testServer = createTestServer(nextFree, function (data: Buffer) {
        response = data.toString();
        // eslint-disable-next-line max-len
        expect(response).toBe(
          '{"stream":"sample","level":"info","message":"hello world","label":"test"}\n{"stream":"sample","level":"error","message":"hello world","label":"test"}\n'
        );
        done();
      });

      logger = createLogger(nextFree);
      logger.log('info', 'hello world', { stream: 'sample' });
      logger.log('error', 'hello world', { stream: 'sample' });
    });

    test('send with overrided meta data', function (done) {
      let response;
      let nextFree = nextFreePort();
      logger = createLogger(nextFree,
        false,
        { meta: { default_meta_override: 'foo' } });
      testServer = createTestServer(nextFree, function (data: Buffer) {
        response = data.toString();

        // eslint-disable-next-line max-len
        expect(response).toBe(
          '{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n'
        );
        done();
      });

      logger.log('info', 'hello world', { 'default_meta_override': 'tada' });
    });

    test('reconnect after server closes the connection', function (done) {
      let response,
        socketOnDataIterations = 0;
      const nextPort = nextFreePort();
      logger = createLogger(nextPort),
        testServer = createTestServerWithRestart(nextPort, (data: Buffer, socket: Socket) => {
          response = JSON.parse(data.toString())

          switch (++socketOnDataIterations) {
            case 1:
              expect(response.message).toEqual('Log row before reconnect');
              socket.destroy()
              setTimeout(() => {
                logger.log('info', 'Log row after reconnect', { stream: 'sample' });
              }, 10);
              break;

            case 2:
              expect(response.message).toEqual('Log row after reconnect');
              done();
              break;

          }
        });

      logger.log('info', 'Log row before reconnect', { stream: 'sample' });
    });

    // Teardown
    afterEach(() => {
      tearDown(logger, timekeeper, testServer);
    });
  });

  describe('with secured logstash server', function () {
    let testServer: tls.Server;
    let logger: LoggerInstance;

    beforeEach(() => setup(timekeeper));

    test('send logs over SSL secured TCP as valid json', function (done) {
      let response;
      let nextFree = nextFreePort();
      const expected = {
        'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'
      };
      testServer = createTestSecureServer(nextFree, {}, function (data: Buffer) {
        response = data.toString();
        expect(JSON.parse(response)).toEqual(expected);
        done();
      });

      logger = createLogger(nextFree, true);
      logger.log('info', 'hello world', { stream: 'sample' });
    });

    // eslint-disable-next-line max-len
    test('send logs over SSL secured TCP as valid json with SSL verification', function (done) {
      let response: string;
      let nextFree = nextFreePort();
      const expected = {
        'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'
      };

      testServer = createTestSecureServer(nextFree, { verify: true }, function (data: Buffer) {
        response = data.toString();
        expect(JSON.parse(response)).toEqual(expected);
        done();
      });

      logger = createLogger(nextFree, true);
      logger.log('info', 'hello world', { stream: 'sample' });
    });


    // eslint-disable-next-line max-len
    test('logstash transport receive an error when there is a connection error different from ECONNREFUSED', function (done) {
      let response;
      let nextFree = nextFreePort();
      const expected = {
        'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test',
      };
      let silence = true;

      testServer = createTestSecureServer(nextFree, {
        serverKey: sslFilePath('server-fail.key'),
        serverCert: sslFilePath('server-fail.cert'),
        verify: true,
      }, function (data: Buffer) {
        response = data.toString();
        expect(JSON.parse(response)).toEqual(expected);
        if (silence) {
          done();
          silence = false;
        }
      });

      logger = createLogger(nextFree, true, {
        timeout_connect_retries: 1,
        max_connect_retries: 2
      }),
        logger.transports.logstash.on('error', function (err) {
          expect(err).toBeInstanceOf(Error);
          if (silence) {
            done();
            silence = false;
          }
        });

      logger.log('info', 'hello world', { stream: 'sample' });
    });

    // Teardown
    afterEach(() => {
      tearDown(logger, timekeeper, testServer);
    });
  });

  describe('without logstash server', function () {
    test('fallback to silent mode if logstash server is down', function (done) {
      const logger = createLogger(28747, false, {
        timeout_connect_retries: 4,
        max_connect_retries: 3
      });

      logger.transports.logstash.on('error', function (err) {
        expect(logger.transports.logstash.silent).toBe(true);
        done();
      });

      logger.log('info', 'hello world', { stream: 'sample' });
    });

    test('emit an error message when it fallback to silent mode', function (done) {
      const logger = createLogger(28747, false, {
        timeout_connect_retries: 1,
        max_connect_retries: 5
      });
      let called = true;

      logger.transports.logstash.on('error', function (err) {
        if (/OFFLINE$/.test(err.message)) {
          expect(logger.transports.logstash.silent).toBe(true);

          if (called) {
            done();
          };

          called = false;
        }
      });
      // Wait for timeout for logger before sending first message
      const interval = setInterval(function () {
        clearInterval(interval);
        logger.log('info', 'hello world', { stream: 'sample' });
      }, 400);
    });
  });
});


