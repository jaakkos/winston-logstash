/* eslint-disable require-jsdoc */
const Transport = require('winston-transport');
const Manager = require('./manager');

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class LogstashTransport extends Transport {
  constructor(options) {
    super(options);

    this.name = 'logstash';

    this.manager = new Manager(options, this.onError.bind(this));
    this.manager.start();
  }

  onError(error) {
    this.silent = true;
    this.emit('error', error);
  }

  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Perform the writing to the remote service

    this.manager.log(JSON.stringify(info), () => {
      callback();
    });
  }
};
