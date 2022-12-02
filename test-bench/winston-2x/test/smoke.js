
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const winston = require('winston');
const transports = require('winston-logstash');
const chai = require('chai');
const expect = chai.expect;
const net = require('net');

const assertClient = (port) => {
  return new Promise((resolve, rejects) => {
    const client = new net.Socket();
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
    const valueForAssertion = assertClient(9999);
    const logger = buildLogger(true);

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
    const valueForAssertion = assertClient(9999);
    const logger = buildLogger(false);

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
