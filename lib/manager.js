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
  constructor(options, connection) {
    var _options$max_connect_, _options$timeout_conn;
    super();
    _defineProperty(this, "connection", void 0);
    _defineProperty(this, "logQueue", void 0);
    _defineProperty(this, "options", void 0);
    _defineProperty(this, "retries", -1);
    _defineProperty(this, "maxConnectRetries", void 0);
    _defineProperty(this, "timeoutConnectRetries", void 0);
    _defineProperty(this, "retryTimeout", undefined);
    _defineProperty(this, "connectionCallbacks", new Map());
    this.options = options;
    this.connection = connection;
    this.logQueue = new Array();
    this.connectionCallbacks.set(_connection.ConnectionEvents.Connected, this.onConnected.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Closed, this.onConnectionClosed.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.ClosedByServer, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Error, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Timeout, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Drain, this.flush.bind(this));

    // Connection retry attributes
    this.retries = 0;
    this.maxConnectRetries = (_options$max_connect_ = options === null || options === void 0 ? void 0 : options.max_connect_retries) !== null && _options$max_connect_ !== void 0 ? _options$max_connect_ : 4;
    this.timeoutConnectRetries = (_options$timeout_conn = options === null || options === void 0 ? void 0 : options.timeout_connect_retries) !== null && _options$timeout_conn !== void 0 ? _options$timeout_conn : 100;
  }
  addEventListeners() {
    this.connection.once(_connection.ConnectionEvents.Connected, this.connectionCallbacks.get(_connection.ConnectionEvents.Connected));
    this.connection.once(_connection.ConnectionEvents.Closed, this.connectionCallbacks.get(_connection.ConnectionEvents.Closed));
    this.connection.once(_connection.ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(_connection.ConnectionEvents.ClosedByServer));
    this.connection.once(_connection.ConnectionEvents.Error, this.connectionCallbacks.get(_connection.ConnectionEvents.Error));
    this.connection.once(_connection.ConnectionEvents.Timeout, this.connectionCallbacks.get(_connection.ConnectionEvents.Timeout));
    this.connection.on(_connection.ConnectionEvents.Drain, this.connectionCallbacks.get(_connection.ConnectionEvents.Drain));
  }
  removeEventListeners() {
    this.connection.off(_connection.ConnectionEvents.Connected, this.connectionCallbacks.get(_connection.ConnectionEvents.Connected));
    this.connection.off(_connection.ConnectionEvents.Closed, this.connectionCallbacks.get(_connection.ConnectionEvents.Closed));
    this.connection.off(_connection.ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(_connection.ConnectionEvents.ClosedByServer));
    this.connection.off(_connection.ConnectionEvents.Error, this.connectionCallbacks.get(_connection.ConnectionEvents.Error));
    this.connection.off(_connection.ConnectionEvents.Timeout, this.connectionCallbacks.get(_connection.ConnectionEvents.Timeout));
    this.connection.off(_connection.ConnectionEvents.Drain, this.connectionCallbacks.get(_connection.ConnectionEvents.Drain));
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
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }
    this.emit('retrying');
    this.removeEventListeners();
    const self = this;
    this.connection.once(_connection.ConnectionEvents.Closed, () => {
      self.removeEventListeners();
      self.retryTimeout = setTimeout(() => {
        self.start();
      }, self.timeoutConnectRetries);
    });
    this.connection.close();
  }
  setConnection(connection) {
    this.connection = connection;
  }
  start() {
    this.retries++;
    this.addEventListeners();
    this.connection.connect();
  }
  log(entry, callback) {
    this.logQueue.push([entry, callback]);
    process.nextTick(this.flush.bind(this));
  }
  close() {
    var _this$connection2;
    this.emit('closing');
    this.flush();
    this.removeEventListeners();
    (_this$connection2 = this.connection) === null || _this$connection2 === void 0 ? void 0 : _this$connection2.close();
  }
  flush() {
    this.emit('flushing');
    let connectionIsDrained = true;
    while (this.logQueue.length && connectionIsDrained && (_this$connection3 = this.connection) !== null && _this$connection3 !== void 0 && _this$connection3.readyToSend()) {
      var _this$connection3;
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