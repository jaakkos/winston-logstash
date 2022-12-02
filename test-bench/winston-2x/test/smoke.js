
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const winston = require('winston');
const transports = require('winston-logstash');
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');
const readLines = (file) => fs.readFileSync(file, 'utf-8').toString();

const logstashOutputFile = '../logstash/logstash/output/sample.log';
const clearOutputFile = (done) => fs.writeFile(logstashOutputFile, '', done);
const logFileAsObject = () => {
  const logFileContent = readLines(logstashOutputFile);
  let logFileContentAsObject = {message: '', level: ''};
  try {
    logFileContentAsObject = JSON.parse(logFileContent);
  } catch (e) {

  }
  return logFileContentAsObject;
};
const waitUntilLogfileFlush = (done) => {
  // Logstash file flush is set to 1 sec
  setTimeout(done, 1100);
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
  beforeEach('clear file', (done) => {
    clearOutputFile(done);
  });

  it('should append for lines to file with secure logger', (done) => {
    const logger = buildLogger(true);

    const expectMessage = 'secure logger: ' + Date.now();
    logger.log('info', expectMessage);

    waitUntilLogfileFlush(() => {
      const logFileContentAsObject = logFileAsObject();

      expect(logFileContentAsObject.message).to.be.eql(expectMessage);
      expect(logFileContentAsObject.level).to.be.eql('info');

      logger.close();
      done();
    });
  });

  it('should append for lines to file with unsecure logger', (done) => {
    const logger = buildLogger(false);

    const expectMessage = 'unsecure logger: ' + Date.now();
    logger.log('info', expectMessage);

    waitUntilLogfileFlush(() => {
      const logFileContentAsObject = logFileAsObject();

      expect(logFileContentAsObject.message).to.be.eql(expectMessage);
      expect(logFileContentAsObject.level).to.be.eql('info');

      logger.close();
      done();
    });
  });
});
