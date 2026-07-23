const winston = require('winston');
const LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');

describe('Winston 3 silent after OFFLINE', () => {
  it('does not hang when logging after max retries', (done) => {
    const transport = new LogstashTransport({
      max_connect_retries: 2,
      timeout_connect_retries: 50,
      port: 7878,
      host: 'localhost',
      ssl_enable: false,
    });
    const logger = winston.createLogger({
      transports: [transport],
    });

    logger.on('error', (error) => {
      expect(error.message).toMatch(/OFFLINE/);
      expect(transport.silent).toBe(true);

      let callbackCalls = 0;
      transport.log({level: 'info', message: 'after offline'}, () => {
        callbackCalls += 1;
      });

      setTimeout(() => {
        expect(callbackCalls).toBe(1);
        logger.close();
        done();
      }, 100);
    });

    logger.log('info', 'trigger offline');
  });
});
