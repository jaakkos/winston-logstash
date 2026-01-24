"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Manager = void 0;
var _connection = require("./connection");
var _events = require("events");
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

const ECONNREFUSED_REGEXP = /ECONNREFUSED/;
const DEFAULT_INITIAL_DELAY_MS = 100;
class Manager extends _events.EventEmitter {
  retries = -1;
  nextRetryDelayMs = DEFAULT_INITIAL_DELAY_MS;
  retryTimeout = undefined;
  connectionCallbacks = new Map();
  constructor(options, connection) {
    super();
    this.options = options;
    this.connection = connection;
    this.logQueue = [];
    this.connectionCallbacks.set(_connection.ConnectionEvents.Connected, this.onConnected.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Closed, this.onConnectionClosed.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.ClosedByServer, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Error, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Timeout, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(_connection.ConnectionEvents.Drain, this.flush.bind(this));

    // Connection retry attributes
    this.retries = 0;

    // Initialize retry strategy: explicit retryStrategy takes precedence,
    // otherwise use legacy options converted to fixedDelay (maintains backward compatibility)
    if (options?.retryStrategy) {
      this.retryStrategy = options.retryStrategy;
      // Set initial delay for exponential backoff
      if (this.retryStrategy.strategy === 'exponentialBackoff') {
        this.nextRetryDelayMs = this.retryStrategy.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
      }
    } else {
      // Legacy behavior: fixed delay with provided or default values
      this.retryStrategy = {
        strategy: 'fixedDelay',
        maxConnectRetries: options?.max_connect_retries ?? 4,
        delayBeforeRetryMs: options?.timeout_connect_retries ?? 100
      };
    }
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
    // Reset exponential backoff delay on successful connection
    if (this.retryStrategy.strategy === 'exponentialBackoff') {
      this.nextRetryDelayMs = this.retryStrategy.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    }
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
    if (this.isRetryableError(error)) {
      const {
        maxConnectRetries
      } = this.retryStrategy;
      return maxConnectRetries < 0 || this.retries < maxConnectRetries;
    }
    return false;
  }
  onConnectionError(error) {
    if (this.shouldTryToReconnect(error)) {
      this.retry();
    } else {
      this.removeEventListeners();
      this.connection?.close();
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

      // Calculate retry delay based on strategy
      let retryDelayMs;
      if (self.retryStrategy.strategy === 'exponentialBackoff') {
        retryDelayMs = self.nextRetryDelayMs;
        // Double the delay for next time, capped at max
        self.nextRetryDelayMs = Math.min(self.nextRetryDelayMs * 2, self.retryStrategy.maxDelayBeforeRetryMs);
      } else {
        retryDelayMs = self.retryStrategy.delayBeforeRetryMs;
      }
      self.retryTimeout = setTimeout(() => {
        self.start();
      }, retryDelayMs);
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
    this.emit('closing');
    this.flush();
    this.removeEventListeners();
    this.connection?.close();
  }
  flush() {
    this.emit('flushing');
    let connectionIsDrained = true;
    while (this.logQueue.length && connectionIsDrained && this.connection?.readyToSend()) {
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