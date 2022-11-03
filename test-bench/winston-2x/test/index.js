
//
// Requiring `winston-logstash` will expose
// `winston.transports.Logstash`
//
const winston = require('winston');
const transports = require('winston-logstash');
const chai = require('chai');
const expect = chai.expect;
const fs = require('fs');


const logger = new (winston.Logger)({
  transports: [
    new transports.Logstash({
      port: 28777,
      node_name: 'my node name',
      host: '127.0.0.1',
    }),
  ],
});

const clearFile = (file) => fs.writeFileSync(file, '');
const readLines = (file) => fs.readFileSync(file, 'utf-8');

describe('Ensure logstash is working', () => {
  afterEach(() => {
    clearFile('../logstash/logstash/output/sample.log');
  });

  it('should append for lines to file', () => {
    logger.log('info', 'message');
    logger.close();

    const logFileContent = readLines('../logstash/logstash/output/sample.log');
    const logFileContentAsObject = JSON.parse(logFileContent);

    expect(logFileContentAsObject.message).to.be.eql('message');
    expect(logFileContentAsObject.level).to.be.eql('info');
  });
});
