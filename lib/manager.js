/* eslint-disable require-jsdoc */
const Connection = require('./connection');
const EventEmitter = require('events');
const ECONNREFUSED_REGEXP = /ECONNREFUSED/;

module.exports = class Manager extends EventEmitter {
  constructor(options) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28777;
    this.connectionStarted = false;
    this.closing = false;
    this.logQueue = [];

    // Connection retry attributes
    this.tryReconnect = true;
    this.retries = -1;
    this.max_connect_retries =
      ('number' === typeof options.max_connect_retries) ?
        options.max_connect_retries : 4;
    this.timeout_connect_retries =
      ('number' === typeof options.timeout_connect_retries) ?
        options.timeout_connect_retries : 100;

    this.on('connection:connect', this.onConnection.bind(this));
    this.on('connection:close', this.onConnectionClose.bind(this));
    this.on('connection:error', this.onConnectionError.bind(this));

    if (options.ssl_enable) {
      this.connection = new Connection.SecureConnection(options, this);
    } else {
      this.connection = new Connection.PlainConnection(options, this);
    }
  }

  onConnection() {
    this.retries = 0;
    this.flush();
  }

  onConnectionClose() {
    if (this.tryReconnect === true) {
      this.connection.connect(this.flush.bind(this));
    }
  }

  isRetryableError(error) {
    // TODO: Due bug in the orginal implementation
    //       all the errors will get retried
    return true; // !ECONNREFUSED_REGEXP.test(error.code);
  }

  tryToReconnect(error) {
    if (this.isRetryableError(error) === true &&
      this.closing === false) {
      if (this.max_connect_retries < 0 ||
      this.retries < this.max_connect_retries) {
        return true;
      } else {
        return false;
      }
    }
  }

  onConnectionError(error) {
    this.retries++;
    this.tryReconnect = this.tryToReconnect(error);

    if (this.tryReconnect === false) {
      this.emit('error',
          new Error('Max retries reached, transport in silent mode, OFFLINE'));
      this.closing = true;
      this.connection.close();
    }
  }

  start() {
    if (!this.connectionStarted) {
      this.connection.connect();
      this.connectionStarted = true;
    }
  }

  log(entry, callback) {
    this.logQueue.push([entry, callback]);
    process.nextTick(this.flush.bind(this));
  }

  close() {
    this.flush();
    this.closing = true;
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
