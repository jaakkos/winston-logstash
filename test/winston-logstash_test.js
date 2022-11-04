/* eslint-disable require-jsdoc */
process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const winston = require('winston');
const timekeeper = require('timekeeper');
const freezedTime = new Date(1330688329321);
const secureServerDebug = require('debug')('test:server:secure');
let port = 28777;

chai.config.includeStack = true;

require('../lib/winston-logstash');

describe('winston-logstash transport', function() {
  function createTestServer(port, onData) {
    const server = net.createServer(function(socket) {
      socket.on('end', function() {});
      socket.on('data', onData);
    });

    server.listen(port);

    return server;
  }

  function createTestSecureServer(port, options, onData) {
    const serverOptions = {
      host: 'localhost',
      enableTrace: false,
      key: (options.serverKey) ?
        fs.readFileSync(options.serverKey) :
        fs.readFileSync(__dirname + '/support/ssl/server.key'),
      cert: (options.serverCert) ?
        fs.readFileSync(options.serverCert) :
        fs.readFileSync(__dirname + '/support/ssl/server.cert'),
      handshakeTimeout: 1000,
      requestCert: options.verify ? options.verify : false,
      ca: [fs.readFileSync(__dirname + '/support/ssl/ca.cert')],
    };

    const server = tls.createServer(serverOptions, function(socket) {
      secureServerDebug('server connected',
        socket.authorized ? 'authorized' : 'unauthorized');
      socket.on('end', function() { });
      socket.on('data', onData);
    });

    server.listen(port, 'localhost', function() {
      secureServerDebug('server started to port', port);
    });

    return server;
  }

  function createLogger(port, secure, extraOptions) {
    let transportsConfiguration = {
      port: port,
      host: 'localhost',
      node_name: 'test',
      pid: 12345,
      ssl_enable: secure ? true : false,
      ca: secure ? [__dirname + '/support/ssl/ca.cert'] : undefined,
      ssl_key: secure ? __dirname + '/support/ssl/client.key' : undefined,
      ssl_cert: secure ? __dirname + '/support/ssl/client.cert' : undefined,
    };


    transportsConfiguration = Object.assign({},
        extraOptions, transportsConfiguration);

    return new (winston.Logger)({
      transports: [
        new (winston.transports.Logstash)(transportsConfiguration),
      ],
    });
  }

  describe('with logstash server', function() {
    let testServer;
    let logger;

    beforeEach(function(done) {
      port++;
      timekeeper.freeze(freezedTime);
      done();
    });

    it('send logs over TCP as valid json', function(done) {
      let response;
      const expected = {'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'};

      testServer = createTestServer(port, function(data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger = createLogger(port);
      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('send each log with a new line character', function(done) {
      let response;

      testServer = createTestServer(port, function(data) {
        response = data.toString();
        // eslint-disable-next-line max-len
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n');
        done();
      });

      logger = createLogger(port);
      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('send with different log levels', function(done) {
      let response;

      testServer = createTestServer(port, function(data) {
        response = data.toString();
        // eslint-disable-next-line max-len
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n{"stream":"sample","level":"error","message":"hello world","label":"test"}\n');
        done();
      });

      logger = createLogger(port);
      logger.log('info', 'hello world', {stream: 'sample'});
      logger.log('error', 'hello world', {stream: 'sample'});
    });

    it('send with overrided meta data', function(done) {
      let response;
      logger = createLogger(port,
          false,
          {meta: {default_meta_override: 'foo'}});
      testServer = createTestServer(port, function(data) {
        response = data.toString();

        // eslint-disable-next-line max-len
        expect(response).to.be.equal('{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n');
        done();
      });

      logger.log('info', 'hello world', {'default_meta_override': 'tada'});
    });

    // Teardown
    afterEach(function(done) {
      if (logger) {
        logger.close();
      }
      timekeeper.reset();
      if (testServer) {
        testServer.close(() => {
          testServer = null;
          logger = null;
          done();
        });
      }
    });
  });

  describe('with secured logstash server', function() {
    let testServer; let logger;

    beforeEach(function(done) {
      port++;
      timekeeper.freeze(freezedTime);
      done();
    });

    it('send logs over SSL secured TCP as valid json', function(done) {
      let response;
      const expected = {'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'};
      testServer = createTestSecureServer(port, {}, function(data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger = createLogger(port, true);
      logger.log('info', 'hello world', {stream: 'sample'});
    });

    // eslint-disable-next-line max-len
    it('send logs over SSL secured TCP as valid json with SSL verification', function(done) {
      let response;
      const expected = {'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test'};

      testServer = createTestSecureServer(port, {verify: true}, function(data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger = createLogger(port, true);
      logger.log('info', 'hello world', {stream: 'sample'});
    });


    // eslint-disable-next-line max-len
    it('logstash transport receive an error when there is a connection error different from ECONNREFUSED', function(done) {
      let response;
      const expected = {
        'stream': 'sample',
        'level': 'info',
        'message': 'hello world',
        'label': 'test',
      };
      let silence = true;

      testServer = createTestSecureServer(port, {
        serverKey: __dirname + '/support/ssl/server-fail.key',
        serverCert: __dirname + '/support/ssl/server-fail.cert',
        verify: true,
      }, function(data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        if (silence) {
          done();
          silence = false;
        }
      });

      logger = createLogger(port, true),
      logger.transports.logstash.on('error', function(err) {
        expect(err).to.be.an.instanceof(Error);
        if (silence) {
          done();
          silence = false;
        }
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    // Teardown
    afterEach(function(done) {
      if (logger) {
        logger.close();
      }
      timekeeper.reset();
      if (testServer) {
        testServer.close(function() {
          testServer = null;
          logger = null;
          done();
        });
      }
    });
  });

  describe('without logstash server', function() {
    it('fallback to silent mode if logstash server is down', function(done) {
      const logger = createLogger(28747);

      logger.transports.logstash.on('error', function(err) {
        expect(logger.transports.logstash.silent).to.be.true;
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('emit an error message when it fallback to silent mode', function(done) {
      const logger = createLogger(28747);
      let called = true;

      logger.transports.logstash.on('error', function(err) {
        if (/OFFLINE$/.test(err.message)) {
          expect(logger.transports.logstash.silent).to.be.true;

          if (called) {
            done();
          };

          called = false;
        }
      });
      // Wait for timeout for logger before sending first message
      const interval = setInterval(function() {
        clearInterval(interval);
      }, 400);
    });
  });
});


