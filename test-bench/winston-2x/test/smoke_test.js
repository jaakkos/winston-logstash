
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const winston = require('winston');
const transports = require('winston-logstash');
const net = require('net');
const crypto = require('crypto');

const assertClient = (port, expectedId) => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout waiting for message with id: ' + expectedId));
    }, 10000);

    client.connect(port, 'localhost', function() {
      // Connected
    });

    client.on('data', function(data) {
      const message = JSON.parse(data);
      // Only resolve if this is the message we're looking for
      if (message.message && message.message.includes(expectedId)) {
        clearTimeout(timeout);
        resolve(message);
        client.destroy();
      }
      // Otherwise keep listening for the right message
    });

    client.on('close', function() {
      // Connection closed
    });

    client.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
      client.destroy();
    });
  });
};

const buildLogger = (ssl) => new (winston.Logger)({
  transports: [
    new transports.Logstash({
      max_connect_retries: 100,
      port: ssl ? 9888 : 9777,
      node_name: 'my node name',
      host: 'localhost',
      ssl_enable: ssl,
      ca: __dirname + '/../../../test/support/ssl/ca.cert',
      ssl_key: __dirname + '/../../../test/support/ssl/client.key',
      ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
    }),
  ],
});

describe('Ensure logstash is working', () => {
  it('should append for lines to file with secure logger', (done) => {
    const uniqueId = crypto.randomUUID();
    const expectMessage = 'secure logger: ' + uniqueId;
    const valueForAssertion = assertClient(9999, uniqueId);
    const logger = buildLogger(true);

    logger.log('info', expectMessage);

    valueForAssertion.then((value) => {
      expect(value.message).toEqual(expectMessage);
      expect(value.level).toEqual('info');

      logger.close();
      done();
    }).catch(done);
  });

  it('should append for lines to file with unsecure logger', (done) => {
    const uniqueId = crypto.randomUUID();
    const expectMessage = 'unsecure logger: ' + uniqueId;
    const valueForAssertion = assertClient(9999, uniqueId);
    const logger = buildLogger(false);

    logger.log('info', expectMessage);

    valueForAssertion.then((value) => {
      expect(value.message).toEqual(expectMessage);
      expect(value.level).toEqual('info');

      logger.close();
      done();
    }).catch(done);
  });
});
