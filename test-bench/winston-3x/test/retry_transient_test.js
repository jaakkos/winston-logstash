const winston = require('winston');
const LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');

/**
 * Connect to live Logstash TLS without a trusted CA so verification fails permanently.
 */
function badTlsOptions(overrides = {}) {
  return {
    host: 'localhost',
    port: 9888,
    ssl_enable: true,
    rejectUnauthorized: true,
    // Intentionally omit ca — Logstash uses a private CA
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
    const transport = new LogstashTransport(badTlsOptions({
      retry_transient_errors_only: true,
      max_connect_retries: 10,
    }));
    const logger = winston.createLogger({transports: [transport]});
    const started = Date.now();

    logger.on('error', (error) => {
      expect(error.message)
          .toMatch('Non-retryable connection error, transport in silent mode, OFFLINE');
      // Should not burn through 10 retries (10 * 50ms)
      expect(Date.now() - started).toBeLessThan(2000);
      logger.close();
      done();
    });

    logger.log('info', 'tls fail-fast');
  });

  it('still uses Max retries OFFLINE by default (backward compatible)', (done) => {
    const transport = new LogstashTransport(badTlsOptions({
      max_connect_retries: 2,
      timeout_connect_retries: 50,
    }));
    const logger = winston.createLogger({transports: [transport]});

    logger.on('error', (error) => {
      expect(error.message)
          .toMatch('Max retries reached, transport in silent mode, OFFLINE');
      logger.close();
      done();
    });

    logger.log('info', 'tls retry all');
  });
});
