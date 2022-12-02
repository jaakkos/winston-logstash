
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const net = require('net');
const winston = require('winston');
const LogstashTransport =
  require('winston-logstash/lib/winston-logstash-latest');

const chai = require('chai');
const expect = chai.expect;
const assertClient = (port) => {
  const client = new net.Socket();

  return new Promise((resolve, rejects) => {
    client.connect(port, 'localhost', function() {
      // console.log('Connected');
      // client.write('Hello, server! Love, Client.');
    });

    client.on('data', function(data) {
      resolve(JSON.parse(data));
      // console.log('Received: ' + data);
      client.destroy(); // kill client after server's response
    });

    client.on('close', function() {
      // console.log('Connection closed');
    });

    client.on('error', (error) => {
      rejects(error);
      client.destroy();
    });
  });
};

describe('Ensure logstash is working', () => {
  it('should append for lines to file with secure logger', (done) => {
    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
          max_connect_retries: -1,
          port: 9888,
          node_name: 'my node name',
          host: 'localhost',
          ssl_enable: true,
          ca: __dirname + '/../../../test/support/ssl/ca.cert',
          ssl_key: __dirname + '/../../../test/support/ssl/client.key',
          ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
        }),
      ],
    });

    const valueForAssertion = assertClient(9999);
    const expectMessage = 'secure logger: ' + Date.now();
    logger.log('info', expectMessage);

    valueForAssertion.then((value) => {
      expect(value.message).to.be.eql(expectMessage);
      expect(value.level).to.be.eql('info');
      logger.close();
      done();
    });
  });

  it('should append for lines to file with unsecure logger', (done) => {
    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
          max_connect_retries: -1,
          port: 9777,
          node_name: 'my node name',
          host: 'localhost',
          ssl_enable: false,
          ca: __dirname + '/../../../test/support/ssl/ca.cert',
          ssl_key: __dirname + '/../../../test/support/ssl/client.key',
          ssl_cert: __dirname + '/../../../test/support/ssl/client.cert',
        }),
      ],
    });

    const valueForAssertion = assertClient(9999);
    const expectMessage = 'unsecure logger: ' + Date.now();
    logger.log('info', expectMessage);

    valueForAssertion.then((value) => {
      expect(value.message).to.be.eql(expectMessage);
      expect(value.level).to.be.eql('info');

      logger.close();
      done();
    });
  });
});
