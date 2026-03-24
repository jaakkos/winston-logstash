
const winston = require('winston');
const transports = require('../../../lib/winston-logstash');

describe('Ensure error is handled correctly', () => {
  it('add error eventhandler for logger', (done) => {
    const logstashTransport = new transports.Logstash({
      max_connect_retries: 2,
      port: 7878,
      node_name: 'my node name',
      host: '127.0.0.1',
      ssl_enable: true,
      ca: __dirname + '/../../../test/support/ssl/ca.cert',
      ssl_key: __dirname + '/../../../test/support/ssl/client.key',
      ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
    });
    const logger = new (winston.Logger)({
      transports: [
        logstashTransport,
      ],
    });

    logstashTransport.on('error', (error) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message)
          .toMatch('Max retries reached, transport in silent mode, OFFLINE');
      done();
    });
    logger.on('error', () => {
      // Ignore logger errors to prevent unhandled error in tests
    });
    logger.log('info', 'random message');
  });
});
