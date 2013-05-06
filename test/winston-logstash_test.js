process.env.NODE_ENV = 'test';

var chai = require('chai'),
    expect = chai.expect,
    net = require('net'),
    winston = require('winston'),
    timekeeper = require('timekeeper'),
    freezed_time = new Date(1330688329321);

chai.Assertion.includeStack = true;

require('../lib/winston-logstash');

describe('winston-logstash transport', function() {
  var test_server, port = 28777;

  function createTestServer(port, on_data) {
    var server = net.createServer(port, function (socket) {
      socket.on('end', function () { });
      socket.on('data', on_data);
    });
    server.listen(port, function() {});

    return server;
  }

  function createLogger(port) {
    return new (winston.Logger)({
      transports: [
        new (winston.transports.Logstash)( { port: port, node_name: 'test', localhost: 'localhost', pid: 12345 } )
      ]
    });
  }

  describe('with logstash server', function () {
    var test_server, port = 28777;

    beforeEach(function(done) {
      timekeeper.freeze(freezed_time);
      done();
    });

    it('send logs over TCP', function(done) {
      var response;
      var logger = createLogger(port);

      test_server = createTestServer(port, function (data) {
        response = data.toString();
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world"}');
        done();
      });

      logger.log('info', 'hello world', {stream: 'sample'});
    });

    // Teardown
    afterEach(function () {
      if (test_server) {
        test_server.close(function () {});
      }
      timekeeper.reset();
      test_server = null;
    });

  });

  describe('without logstash server', function () {
    var checkSocketStatus = function (retries, logger, done) {
      var interval = setInterval(function() {
        if (logger.transports.logstash.retries == retries) {
          done();
          clearInterval(interval);
        }
      }, 250);
    };

    it('fallback to silent mode if logstash server is down', function(done) {
      var response;
      var logger = createLogger(28747);
      logger.log('info', 'hello world', {stream: 'sample'});

      checkSocketStatus (4, logger, function() {
        expect(logger.transports.logstash.silent).to.be.true;
        done();
      });

    });
  });


});


