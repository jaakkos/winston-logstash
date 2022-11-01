process.env.NODE_ENV = 'test';

var chai = require('chai'),
    expect = chai.expect,
    net = require('net'),
    tls = require('tls'),
    fs = require('fs'),
    winston = require('winston'),
    timekeeper = require('timekeeper'),
    freezed_time = new Date(1330688329321)
    port = 28777;

chai.config.includeStack = true;

require('../lib/winston-logstash');

describe('winston-logstash transport', function() {
  function mergeObject(source, target) {
    var result = {};

    for (var attrName in source) {
      result[attrName] = source[attrName];
    }

    for (var attrName in target) {
      result[attrName] = target[attrName];
    }

    return result;
  }

  function createTestServer(port, on_data) {
    var server = net.createServer(function (socket) {
      socket.on('end', function () { });
      socket.on('data', on_data);
    });
    server.listen(port, function() {});

    return server;
  }

  function createTestSecureServer(port, options, on_data) {
    var serverOptions = {
      key: (options.serverKey) ? fs.readFileSync(options.serverKey) : fs.readFileSync(__dirname + '/support/ssl/server.key'),
      cert: (options.serverCert) ? fs.readFileSync(options.serverCert) : fs.readFileSync(__dirname + '/support/ssl/server.cert'),
      handshakeTimeout: 1000,
      requestCert: options.verify ? options.verify : false,
      ca: [ fs.readFileSync(__dirname + '/support/ssl/ca.cert') ]
    };

    var server = tls.createServer(serverOptions, function(socket) {
      socket.on('end', function () { });
      socket.on('data', on_data);
    });
    server.listen(port, function() {});

    return server
  }

  function createLogger(port, secure, caFilePath, extraOptions) {
    var transportsConfiguration = {
      port: port,
      node_name: 'test',
      localhost: 'localhost',
      pid: 12345 ,
      ssl_enable: secure ? true : false,
      ca: (secure && caFilePath) ? [__dirname + '/support/ssl/ca.cert'] : undefined,
      ssl_key: secure ? __dirname + '/support/ssl/client.key' : undefined,
      ssl_cert: secure ? __dirname + '/support/ssl/client.cert' : undefined
    };

    if (extraOptions && typeof extraOptions === 'object') {
      transportsConfiguration = mergeObject(transportsConfiguration, extraOptions);
    }

    return new (winston.Logger)({
      transports: [
        new (winston.transports.Logstash)(transportsConfiguration)
      ]
    });
  }

  describe('with logstash server', function () {
    var test_server, logger;

    beforeEach(function(done) {
      port++;
      timekeeper.freeze(freezed_time);
      done();
    });

    it('send logs over TCP as valid json', function(done) {
      var response;
      var expected = {"stream":"sample","level":"info","message":"hello world","label":"test"};
      logger = createLogger(port);

      test_server = createTestServer(port, function (data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('send each log with a new line character', function(done) {
      var response;
      logger = createLogger(port);

      test_server = createTestServer(port, function (data) {
        response = data.toString();
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n');
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('send with different log levels', function(done) {

      var response;
      logger = createLogger(port);

      test_server = createTestServer(port, function (data) {
        response = data.toString();
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n{"stream":"sample","level":"error","message":"hello world","label":"test"}\n');
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
      logger.log('error', 'hello world', {stream: 'sample'});

    });

    it('send with overrided meta data', function(done) {
      var response;
      logger = createLogger(port, false, '', { meta: { default_meta_override: 'foo' } });
      test_server = createTestServer(port, function (data) {
        response = data.toString();

        expect(response).to.be.equal('{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n');
        done();
      });

      logger.log('info', 'hello world', { 'default_meta_override': 'tada' });
    });

    // Teardown
    afterEach(function (done) {
      if (logger) {
        logger.close();
      }
      timekeeper.reset();
      if (test_server) {
        test_server.close(function () {
          test_server = null;
          logger = null;
          done();
        });
      }
    });

  });

  describe('with secured logstash server', function() {
    var test_server, logger;

    beforeEach(function(done) {
      port++;
      timekeeper.freeze(freezed_time);
      done();
    });

    it('send logs over SSL secured TCP as valid json', function(done) {
      var response;
      var expected = {"stream":"sample","level":"info","message":"hello world","label":"test"};
      logger = createLogger(port, true, __dirname + '/support/ssl/server.cert');

      test_server = createTestSecureServer(port, {}, function (data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('send logs over SSL secured TCP as valid json with SSL verification', function(done) {
      var response;
      var expected = {"stream":"sample","level":"info","message":"hello world","label":"test"};
      logger = createLogger(port, true, __dirname + '/support/ssl/client.cert');

      test_server = createTestSecureServer(port, { verify: true }, function (data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });


    it('logstash transport receive an error when there is a connection error different from ECONNREFUSED', function(done) {
      var response,
          expected = {"stream":"sample","level":"info","message":"hello world","label":"test"},
          silence = true;
      logger = createLogger(port, true, __dirname + '/support/ssl/server-fail.cert'),

      test_server = createTestSecureServer(port, {
        serverKey: __dirname + '/support/ssl/server-fail.key',
        serverCert: __dirname + '/support/ssl/server-fail.cert',
        verify: true
      }, function (data) {
        response = data.toString();
        expect(JSON.parse(response)).to.be.eql(expected);
        if (silence) {
          done();
          silence = false;
        }
      });

      logger.transports.logstash.on('error', function (err) {
        expect(err).to.be.an.instanceof(Error);
        if (silence) {
          done();
          silence = false;
        }
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    // Teardown
    afterEach(function (done) {
      if (logger) {
        logger.close();
      }
      timekeeper.reset();
      if (test_server) {
        test_server.close(function () {
          test_server = null;
          logger = null;
          done();
        });
      }
    });
  });

  describe('without logstash server', function () {
    var logger, interval;

    it('fallback to silent mode if logstash server is down', function(done) {
      var response;
      var logger = createLogger(28747);

      logger.transports.logstash.on('error', function (err) {
        expect(logger.transports.logstash.silent).to.be.true;
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    it('emit an error message when it fallback to silent mode', function(done) {
      var logger = createLogger(28747),
          called = true;

      logger.transports.logstash.on('error', function (err) {
        if (/OFFLINE$/.test(err.message)) {
          expect(logger.transports.logstash.retries).to.be.equal(4);
          expect(logger.transports.logstash.silent).to.be.true;

          if (called) {
            done();
          };

          called = false;
        }
      });
      // Wait for timeout for logger before sending first message
      var interval = setInterval(function() {
        logger.log('info', 'hello world', {stream: 'sample'});
        clearInterval(interval);
      }, 400);

    });
  });
});


