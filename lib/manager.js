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
    _defineProperty(this, "useSecureConnection", void 0);
    _defineProperty(this, "retries", -1);
    _defineProperty(this, "maxConnectRetries", void 0);
    _defineProperty(this, "timeoutConnectRetries", void 0);
    _defineProperty(this, "retryTimeout", undefined);
    this.options = options;
    this.useSecureConnection = (options === null || options === void 0 ? void 0 : options.ssl_enable) === true;
    this.logQueue = new Array();

    // Connection retry attributes
    this.retries = 0;
    this.maxConnectRetries = (_options$max_connect_ = options === null || options === void 0 ? void 0 : options.max_connect_retries) !== null && _options$max_connect_ !== void 0 ? _options$max_connect_ : 4;
    this.timeoutConnectRetries = (_options$timeout_conn = options === null || options === void 0 ? void 0 : options.timeout_connect_retries) !== null && _options$timeout_conn !== void 0 ? _options$timeout_conn : 100;
  }
  addEventListeners() {
    this.once('connection:connected', this.onConnected.bind(this));
    this.once('connection:closed', this.onConnectionClosed.bind(this));
    this.once('connection:closed:by-server', this.onConnectionError.bind(this));
    this.once('connection:error', this.onConnectionError.bind(this));
    this.once('connection:timeout', this.onConnectionError.bind(this));
    this.on('connection:drain', this.flush.bind(this));
  }
  removeEventListeners() {
    this.off('connection:connected', this.onConnected.bind(this));
    this.off('connection:closed', this.onConnectionClosed.bind(this));
    this.off('connection:closed:by-server', this.onConnectionError.bind(this));
    this.off('connection:error', this.onConnectionError.bind(this));
    this.off('connection:timeout', this.onConnectionError.bind(this));
    this.off('connection:drain', this.flush.bind(this));
  }
  createConnection() {
    if (this.useSecureConnection) {
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
      if (this.maxConnectRetries < 0 || this.retries < this.maxConnectRetries) {
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
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    this.emit('retrying');
    this.removeEventListeners();
    const self = this;
    this.once('connection:closed', () => {
      self.removeEventListeners();
      self.retryTimeout = setTimeout(() => {
        self.connection = undefined;
        self.start();
      }, self.timeoutConnectRetries);
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
    let connectionIsDrained = true;
    while (this.logQueue.length && connectionIsDrained && (_this$connection4 = this.connection) !== null && _this$connection4 !== void 0 && _this$connection4.readyToSend()) {
      var _this$connection4;
      const logEntry = this.logQueue.shift();
      if (logEntry) {
        const [entry, callback] = logEntry;
        const self = this;
        connectionIsDrained = this.connection.send(entry + '\n', error => {
          if (error) {
            self.logQueue.unshift(logEntry);
          } else {
            callback();
          }
        });
      }
    }
  }
}
exports.Manager = Manager;
;