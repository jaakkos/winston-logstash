/* eslint-disable require-jsdoc */
const Connection = require('./connection');
const EventEmitter = require('events');
const ECONNREFUSED_REGEXP = /ECONNREFUSED/;

module.exports = class Manager extends EventEmitter {
  constructor(options) {
    super();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28777;
    this.connection = null;
    this.closing = false;
    this.logQueue = [];
    this.options = options;
    this.ssl_enable = options.ssl_enable;

    // Connection retry attributes
    this.retries = -1;
    this.max_connect_retries =
      ('number' === typeof options.max_connect_retries) ?
        options.max_connect_retries : 4;
    this.timeout_connect_retries =
      ('number' === typeof options.timeout_connect_retries) ?
        options.timeout_connect_retries : 100;
  }

  addEventListeners() {
    this.on('connection:connected', this.onConnected.bind(this));
    this.on('connection:closed', this.onConnectionClosed.bind(this));
    this.on('connection:error', this.onConnectionError.bind(this));
    this.on('connection:timeout', this.onConnectionError.bind(this));
  }

  removeEventListeners() {
    this.off('connection:connected', this.onConnected.bind(this));
    this.off('connection:closed', this.onConnectionClosed.bind(this));
    this.off('connection:error', this.onConnectionError.bind(this));
    this.off('connection:timeout', this.onConnectionError.bind(this));
  }

  createConnection() {
    if (this.ssl_enable) {
      return new Connection.SecureConnection(this.options, this);
    } else {
      return new Connection.PlainConnection(this.options, this);
    }
  }

  onConnected() {
    this.emit('connected');
    this.retries = 0;
    this.flush();
  }

  onConnectionClosed() {
    this.emit('closed');
    this.removeEventListeners();
    this.connection = null;
  }

  isRetryableError(error) {
    // TODO: Due bug in the orginal implementation
    //       all the errors will get retried
    return true; // !ECONNREFUSED_REGEXP.test(error.code);
  }

  shouldTryToReconnect(error) {
    if (this.isRetryableError(error) === true) {
      if (this.max_connect_retries < 0 ||
      this.retries < this.max_connect_retries) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  onConnectionError(error) {
    if (this.shouldTryToReconnect(error)) {
      this.removeEventListeners();
      this.connection.close();
      this.emit('error',
          new Error('Max retries reached, transport in silent mode, OFFLINE'));
    } else {
      this.retry();
    }
  }

  retry() {
    this.emit('retrying');
    this.removeEventListeners();
    const self = this;
    this.once('connection:closed', () => {
      self.connection = null;
      self.removeEventListeners();
      setInterval(() => {
        self.start();
      },
      self.timeout_connect_retries);
    });
    this.connection.close();
  }

  start() {
    if (!this.connection) {
      this.retries++;
      this.connection = this.createConnection();
      this.addEventListeners();
      this.connection.connect();
    }
  }

  log(entry, callback) {
    this.logQueue.push([entry, callback]);
    process.nextTick(this.flush.bind(this));
  }

  close() {
    this.emit('closing');
    this.flush();
    this.removeEventListeners();
    this.connection.close();
  }

  flush() {
    this.emit('flushing');
    while (this.connection &&
            this.connection.readyToSend() &&
            this.logQueue.length) {
      const [entry, callback] = this.logQueue.shift();
      this.connection.send(entry + '\n');
      callback();
    }
  }
};
