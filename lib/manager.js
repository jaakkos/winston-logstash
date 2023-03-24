"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Manager = void 0;
var _connection = require("./connection");
var _events = require("events");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
const ECONNREFUSED_REGEXP = /ECONNREFUSED/;
class Manager extends _events.EventEmitter {
  constructor(options) {
    var _options$max_connect_, _options$timeout_conn;
    super();
    _defineProperty(this, "connection", void 0);
    _defineProperty(this, "logQueue", void 0);
    _defineProperty(this, "options", void 0);
    _defineProperty(this, "ssl_enable", void 0);
    _defineProperty(this, "retries", -1);
    _defineProperty(this, "max_connect_retries", void 0);
    _defineProperty(this, "timeout_connect_retries", void 0);
    _defineProperty(this, "retry_timeout", undefined);
    this.options = options;
    this.ssl_enable = (options === null || options === void 0 ? void 0 : options.ssl_enable) === true;
    this.logQueue = new Array();

    // Connection retry attributes
    this.retries = 0;
    this.max_connect_retries = (_options$max_connect_ = options === null || options === void 0 ? void 0 : options.max_connect_retries) !== null && _options$max_connect_ !== void 0 ? _options$max_connect_ : 4;
    this.timeout_connect_retries = (_options$timeout_conn = options === null || options === void 0 ? void 0 : options.timeout_connect_retries) !== null && _options$timeout_conn !== void 0 ? _options$timeout_conn : 100;
  }
  addEventListeners() {
    this.once('connection:connected', this.onConnected.bind(this));
    this.once('connection:closed', this.onConnectionClosed.bind(this));
    this.once('connection:closed:by-server', this.onConnectionError.bind(this));
    this.once('connection:error', this.onConnectionError.bind(this));
    this.once('connection:timeout', this.onConnectionError.bind(this));
  }
  removeEventListeners() {
    this.off('connection:connected', this.onConnected.bind(this));
    this.off('connection:closed', this.onConnectionClosed.bind(this));
    this.off('connection:closed:by-server', this.onConnectionError.bind(this));
    this.off('connection:error', this.onConnectionError.bind(this));
    this.off('connection:timeout', this.onConnectionError.bind(this));
  }
  createConnection() {
    if (this.ssl_enable) {
      return new _connection.SecureConnection(this.options, this);
    } else {
      return new _connection.PlainConnection(this.options, this);
    }
  }
  onConnected() {
    this.emit('connected');
    this.retries = 0;
    this.flush();
  }
  onConnectionClosed(error) {
    console.log('connection closed', error);
    this.emit('closed');
    this.removeEventListeners();
  }
  isRetryableError(error) {
    // TODO: Due bug in the orginal implementation
    //       all the errors will get retried
    return true; // !ECONNREFUSED_REGEXP.test(error.message);
  }

  shouldTryToReconnect(error) {
    if (this.isRetryableError(error) === true) {
      if (this.max_connect_retries < 0 || this.retries < this.max_connect_retries) {
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
      this.retry();
    } else {
      var _this$connection;
      this.removeEventListeners();
      (_this$connection = this.connection) === null || _this$connection === void 0 ? void 0 : _this$connection.close();
      this.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
    }
  }
  retry() {
    var _this$connection2;
    if (this.retry_timeout) {
      clearTimeout(this.retry_timeout);
    }
    this.emit('retrying');
    this.removeEventListeners();
    const self = this;
    this.once('connection:closed', () => {
      self.removeEventListeners();
      self.retry_timeout = setTimeout(() => {
        self.connection = undefined;
        self.start();
      }, self.timeout_connect_retries);
    });
    (_this$connection2 = this.connection) === null || _this$connection2 === void 0 ? void 0 : _this$connection2.close();
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
    var _this$connection3;
    this.emit('closing');
    this.flush();
    this.removeEventListeners();
    (_this$connection3 = this.connection) === null || _this$connection3 === void 0 ? void 0 : _this$connection3.close();
  }
  flush() {
    this.emit('flushing');
    while (this.connection && this.connection.readyToSend() && this.logQueue.length) {
      const logEntry = this.logQueue.shift();
      if (logEntry) {
        const [entry, callback] = logEntry;
        this.connection.send(entry + '\n');
        callback();
      }
    }
  }
}
exports.Manager = Manager;
;