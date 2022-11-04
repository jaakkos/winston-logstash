/* eslint-disable require-jsdoc */
const Connection = require('./connection');

module.exports = class Manager {
  constructor(options, onError) {
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28777;
    this.connectionStarted = false;
    this.logQueue = [];

    if (options.ssl_enable) {
      this.connection = new Connection.SecureConnection(options, onError);
    } else {
      this.connection = new Connection.PlainConnection(options, onError);
    }
  }

  start() {
    if (!this.connectionStarted) {
      this.connection.connect(this.flush.bind(this));
      this.connectionStarted = true;
    }
  }

  log(entry, callback) {
    this.logQueue.push([entry, callback]);
    process.nextTick(this.flush.bind(this));
  }

  close() {
    this.flush();
    this.connection.close();
  }

  flush() {
    while (this.connection.readyToSend() && this.logQueue.length) {
      const [entry, callback] = this.logQueue.shift();
      this.connection.send(entry + '\n');
      callback();
    }
  }
};
