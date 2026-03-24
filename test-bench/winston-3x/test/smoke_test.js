
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const net = require('net');
const crypto = require('crypto');
const winston = require('winston');
const LogstashTransport =
  require('winston-logstash/lib/winston-logstash-latest');

const assertClient = (port, expectedId) => {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    const timeout = setTimeout(() => {
      client.destroy();
      reject(new Error('Timeout waiting for message with id: ' + expectedId));
    }, 10000);

    client.connect(port, '127.0.0.1', function() {
      // Connected
    });

    let buffer = '';
    client.on('data', function(data) {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop(); // Keep the last partial line in the buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const message = JSON.parse(line);
          // Only resolve if this is the message we're looking for
          if (message.message && message.message.includes(expectedId)) {
            clearTimeout(timeout);
            resolve(message);
            client.destroy();
            return;
          }
        } catch (e) {
          // Ignore parse errors for partial/malformed lines
        }
      }
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

describe('Ensure logstash is working', () => {
  it('should append for lines to file with secure logger', (done) => {
    const uniqueId = crypto.randomUUID();
    const expectMessage = 'secure logger: ' + uniqueId;

    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
          max_connect_retries: -1,
          port: 9888,
          node_name: 'my node name',
          host: '127.0.0.1',
          ssl_enable: true,
          ca: __dirname + '/../../../test/support/ssl/ca.cert',
          ssl_key: __dirname + '/../../../test/support/ssl/client.key',
          ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
        }),
      ],
    });

    const valueForAssertion = assertClient(9999, uniqueId);
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

    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
          max_connect_retries: -1,
          port: 9777,
          node_name: 'my node name',
          host: '127.0.0.1',
          ssl_enable: false,
          ca: __dirname + '/../../../test/support/ssl/ca.cert',
          ssl_key: __dirname + '/../../../test/support/ssl/client.key',
          ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
        }),
      ],
    });

    const valueForAssertion = assertClient(9999, uniqueId);
    logger.log('info', expectMessage);

    valueForAssertion.then((value) => {
      expect(value.message).toEqual(expectMessage);
      expect(value.level).toEqual('info');

      logger.close();
      done();
    }).catch(done);
  });
});
