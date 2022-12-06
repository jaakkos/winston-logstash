
const winston = require('winston');
const LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');

describe('Ensure error is handled correctly', () => {
  it('add error eventhandler for logger', (done) => {
    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
          max_connect_retries: 2,
          port: 7878,
          node_name: 'my node name',
          host: 'localhost',
          ssl_enable: true,
          ca: __dirname + '/../../../test/support/ssl/ca.cert',
          ssl_key: __dirname + '/../../../test/support/ssl/client.key',
          ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
        }),
      ],
    });

    logger.on('error', (error) => {
      expect(error).toBeInstanceOf(Error);
      expect(error.message)
          .toMatch('Max retries reached, transport in silent mode, OFFLINE');
      done();
    });
    logger.log('info', 'random message');
  });
});
