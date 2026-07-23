const net = require('net');
const winston = require('winston');
const LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');

function listen(server) {
  return new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(server.address().port);
    });
  });
}

function waitFor(predicate, timeoutMs = 5000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) {
        resolve();
        return;
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error('waitFor timeout'));
        return;
      }
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe('close during reconnect backoff', () => {
  it('does not keep reconnecting after logger.close()', async () => {
    let connects = 0;
    const server = net.createServer((socket) => {
      connects += 1;
      socket.destroy();
    });
    const port = await listen(server);

    const transport = new LogstashTransport({
      host: '127.0.0.1',
      port,
      ssl_enable: false,
      max_connect_retries: -1,
      timeout_connect_retries: 100,
    });
    const logger = winston.createLogger({transports: [transport]});

    logger.log('info', 'force reconnect loop');
    await waitFor(() => connects >= 2);

    const connectsAtClose = connects;
    logger.close();

    await new Promise((resolve) => setTimeout(resolve, 500));
    const connectsAfterWait = connects;

    server.close();
    // At most one in-flight connect may finish after close; no further retries.
    expect(connectsAfterWait).toBeLessThanOrEqual(connectsAtClose + 1);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(connects).toBe(connectsAfterWait);
  });
});
