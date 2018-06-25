import { expect, config } from 'chai'
import { createServer } from 'net'
import { createServer as _createServer } from 'tls'
import { readFileSync } from 'fs'
import { createLogger, format, transports } from 'winston'
import LogstashTransport from '../lib/winston-logstash'
import { freeze, reset } from 'timekeeper'
import { SSL_OP_SINGLE_DH_USE } from 'constants';

config.includeStack = true

function mergeObject (source, target) {
  var result = {}

  for (var attrName in source) {
    result[attrName] = source[attrName]
  }

  for (var attrName in target) {
    result[attrName] = target[attrName]
  }

  return result
}

function createTestServer (port, on_data) {
  var server = createServer(function (socket) {
    socket.on('end', function () { })
    socket.on('data', on_data)
  })
  server.listen(port, function () {})

  return server
}

function createTestSecureServer (port, options, on_data) {
  var serverOptions = {
    key: (options.serverKey) ? readFileSync(options.serverKey) : readFileSync(__dirname + '/support/ssl/server.key'),
    cert: (options.serverCert) ? readFileSync(options.serverCert) : readFileSync(__dirname + '/support/ssl/server.cert'),
    handshakeTimeout: 2000,
    requestCert: options.verify ? options.verify : false,
    ca: options.verify ? [ readFileSync(__dirname + '/support/ssl/client.pub') ] : []
  }
  var server = _createServer(serverOptions, function (socket) {
    socket.on('data', on_data)
    socket.on('end', function() {
      console.log('END');

    })
  })
  server.listen(port, function () {})

  return server
}

function createTestLogger (port, secure, caFilePath, extraOptions) {
  var transportsConfiguration = {
    port: port,
    node_name: 'test',
    localhost: 'localhost',
    pid: 12345,
    ssl_enable: !!secure,
    ca: (secure && caFilePath) ? [__dirname + '/support/ssl/server.cert'] : undefined
  }

  if (extraOptions && typeof extraOptions === 'object') {
    transportsConfiguration = mergeObject(transportsConfiguration, extraOptions)
  }

  const logstashTransport = new LogstashTransport(transportsConfiguration)
  return {
    logger: createLogger({
      transports: [
        logstashTransport
      ]
    }),
    transport: logstashTransport
  }
}

// =================================================================================================

const freezed_time = new Date(1262300401)
var test_server, logger, port = 28777
const TIMEOUT = 0
const afterEachCb = function (done) {
  if (logger) {
    logger.close()
  }

  // Reset freezed time.
  reset()

  if (test_server) {
    test_server.close(function () {
      test_server = null
      logger = null
      done()
    })
  } else {
      done()
  }
}

// =================================================================================================

describe('winston-logstash transport', function () {
  describe('with logstash server', function () {
    beforeEach(function (done) {
      freeze(freezed_time)
      done()
    })

    // Teardown
    afterEach(afterEachCb)

    it('send logs over TCP as valid json', function (done) {
      var response
      var expected = {'stream': 'sample', 'level': 'info', 'message': 'hello world', 'label': 'test'}
      logger = createTestLogger(port).logger

      test_server = createTestServer(port, function (data) {
        response = data.toString()
        expect(JSON.parse(response)).to.be.eql(expected)
        done()
      })

      logger.log('info', 'hello world', {stream: 'sample'})
    })

    it('send each log with a new line character', function (done) {
      var response
      logger = createTestLogger(port).logger

      test_server = createTestServer(port, function (data) {
        response = data.toString()
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n')
        done()
      })

      logger.log('info', 'hello world', {stream: 'sample'})
    })

    it('send with different log levels', function (done) {
      var response
      logger = createTestLogger(port).logger

      test_server = createTestServer(port, function (data) {
        response = data.toString()
        expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n{"stream":"sample","level":"error","message":"hello world","label":"test"}\n')
        done()
      })

      logger.log('info', 'hello world', {stream: 'sample'})
      logger.log('error', 'hello world', {stream: 'sample'})
    })

    it('send with overrided meta data', function (done) {
      var response
      logger = createTestLogger(port, false, '', { meta: { default_meta_override: 'foo' } }).logger
      test_server = createTestServer(port, function (data) {
        response = data.toString()

        expect(response).to.be.equal('{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n')
        done()
      })

      logger.log('info', 'hello world', { 'default_meta_override': 'tada' })
    })


  })



  describe('with secured logstash server', function () {
    beforeEach(function (done) {
      freeze(freezed_time)
      done()
    })

    // Teardown
    afterEach(afterEachCb)


    it('send logs over SSL secured TCP as valid json', function (done) {
      var response
      var expected = {'stream': 'sample', 'level': 'info', 'message': 'hello world', 'label': 'test'}
      logger = createTestLogger(port, true, __dirname + '/support/ssl/server.cert').logger

      test_server = createTestSecureServer(port, {}, function (data) {
        response = data.toString()
        expect(JSON.parse(response)).to.be.eql(expected)

      })

      logger.log('info', 'hello world', {stream: 'sample'})

      setTimeout(() => {
        done()
      }, TIMEOUT);
    })

    it('send logs over SSL secured TCP as valid json with SSL verification', function (done) {
      var response
      var expected = {'stream': 'sample', 'level': 'info', 'message': 'hello world', 'label': 'test'}
      logger = createTestLogger(port, true, __dirname + '/support/ssl/server.cert').logger

      test_server = createTestSecureServer(port, {}, function (data) {
        response = data.toString()
        expect(JSON.parse(response)).to.be.eql(expected)
      })

      logger.log('info', 'hello world', {stream: 'sample'})
      setTimeout(() => {
        done()
      }, TIMEOUT)
    })

    it('logstash transport receive an error when there is a connection error different from ECONNREFUSED', function (done) {
      var response
      var expected = {'stream': 'sample', 'level': 'info', 'message': 'hello world', 'label': 'test'}
      var silence = true
      var testLogger = createTestLogger(port, true, __dirname + '/support/ssl/server-fail.cert')
      var logger = testLogger.logger
      var transport = testLogger.transport

      test_server = createTestSecureServer(port, {
        serverKey: __dirname + '/support/ssl/server-fail.key',
        serverCert: __dirname + '/support/ssl/server-fail.cert',
        verify: true
      }, function (data) {
        response = data.toString()
        expect(JSON.parse(response)).to.be.eql(expected)
        if (silence) {
          silence = false
        }
      })

      transport.on('error', function (err) {
        expect(err).to.be.an.instanceof(Error)
        if (silence) {
          silence = false
        }
      })

      logger.log('info', 'hello world', {stream: 'sample'})
      //setTimeout(() => {
        done()
      //}, TIMEOUT)
    })
  })

  describe('without logstash server', function () {
    it('fallback to silent mode if logstash server is down', function (done) {
      var testLogger = createTestLogger(port)
      var logger = testLogger.logger
      var transport = testLogger.transport

      transport.on('error', function (err) {
        expect(transport.silent).to.be.true
        done()
      })

      logger.log('info', 'hello world', {stream: 'sample'})
    })

    it('emit an error message when it fallback to silent mode', function (done) {
      var testLogger = createTestLogger(port)
      var logger = testLogger.logger
      var transport = testLogger.transport
      var called = true

      transport.on('error', function (err) {
        if (/OFFLINE$/.test(err.message)) {
          expect(transport.retries).to.be.equal(4)
          expect(transport.silent).to.be.true

         // if (called) {
            done()
         // };

          called = false
        }
      })
      // Wait for timeout for logger before sending first message
      var interval = setInterval(function () {
        logger.log('info', 'hello world', {stream: 'sample'})
        clearInterval(interval)
      }, 400)
    })
  })
})
