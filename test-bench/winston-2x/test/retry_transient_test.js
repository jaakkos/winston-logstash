const winston = require('winston');
const transports = require('winston-logstash');

function badTlsOptions(overrides = {}) {
  return {
    host: 'localhost',
    port: 9888,
    ssl_enable: true,
    rejectUnauthorized: true,
    max_connect_retries: 2,
    timeout_connect_retries: 50,
    ...overrides,
  };
}

describe('retry_transient_errors_only against live TLS', () => {
  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
  });

  it('fail-fast with Non-retryable OFFLINE when opt-in is enabled', (done) => {
    const logstashTransport = new transports.Logstash(badTlsOptions({
      retry_transient_errors_only: true,
      max_connect_retries: 10,
    }));
    const logger = new (winston.Logger)({
      transports: [logstashTransport],
    });
    const started = Date.now();

    logstashTransport.on('error', (error) => {
      expect(error.message)
          .toMatch('Non-retryable connection error, transport in silent mode, OFFLINE');
      expect(Date.now() - started).toBeLessThan(2000);
      logger.close();
      done();
    });

    logger.log('info', 'tls fail-fast');
  });

  it('still uses Max retries OFFLINE by default (backward compatible)', (done) => {
    const logstashTransport = new transports.Logstash(badTlsOptions({
      max_connect_retries: 2,
      timeout_connect_retries: 50,
    }));
    const logger = new (winston.Logger)({
      transports: [logstashTransport],
    });

    logstashTransport.on('error', (error) => {
      expect(error.message)
          .toMatch('Max retries reached, transport in silent mode, OFFLINE');
      logger.close();
      done();
    });

    logger.log('info', 'tls retry all');
  });
});
