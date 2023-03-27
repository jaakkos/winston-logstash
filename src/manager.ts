/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import {Connection, SecureConnection, PlainConnection} from './connection'
import { EventEmitter } from 'events';
import { LogstashTransportOptions, LogEntry } from './types';

const ECONNREFUSED_REGEXP = /ECONNREFUSED/;

export class Manager extends EventEmitter {
  connection: Connection | undefined
  logQueue: [String, Function][];
  options: LogstashTransportOptions;
  useSecureConnection: Boolean;
  retries: number = -1;
  maxConnectRetries: number;
  timeoutConnectRetries: number;
  retryTimeout?: ReturnType<typeof setTimeout> = undefined;

  constructor(options: LogstashTransportOptions) {
    super();
    this.options = options;
    this.useSecureConnection = options?.ssl_enable === true;

    this.logQueue = new Array();

    // Connection retry attributes
    this.retries = 0;
    this.maxConnectRetries = options?.max_connect_retries ?? 4;
    this.timeoutConnectRetries = options?.timeout_connect_retries ?? 100;
  }

  private addEventListeners() {
    this.once('connection:connected', this.onConnected.bind(this));
    this.once('connection:closed', this.onConnectionClosed.bind(this));
    this.once('connection:closed:by-server', this.onConnectionError.bind(this));
    this.once('connection:error', this.onConnectionError.bind(this));
    this.once('connection:timeout', this.onConnectionError.bind(this));
    this.on('connection:drain', this.flush.bind(this));
  }

  private removeEventListeners() {
    this.off('connection:connected', this.onConnected.bind(this));
    this.off('connection:closed', this.onConnectionClosed.bind(this));
    this.off('connection:closed:by-server', this.onConnectionError.bind(this));
    this.off('connection:error', this.onConnectionError.bind(this));
    this.off('connection:timeout', this.onConnectionError.bind(this));
    this.off('connection:drain', this.flush.bind(this));
  }

  private createConnection() {
    if (this.useSecureConnection) {
      return new SecureConnection(this.options, this);
    } else {
      return new PlainConnection(this.options, this);
    }
  }

  private onConnected() {
    this.emit('connected');
    this.retries = 0;
    this.flush();
  }

  private onConnectionClosed(error: Error) {
    this.emit('closed');
    this.removeEventListeners();
  }

  private isRetryableError(error: Error) {
    // TODO: Due bug in the orginal implementation
    //       all the errors will get retried
    return true; // !ECONNREFUSED_REGEXP.test(error.message);
  }

  private shouldTryToReconnect(error: Error) {
    if (this.isRetryableError(error) === true) {
      if (this.maxConnectRetries < 0 ||
      this.retries < this.maxConnectRetries) {
        return true;
      } else {
        return false;
      }
    } else {
      return false;
    }
  }

  private onConnectionError(error: Error) {
    if (this.shouldTryToReconnect(error)) {
      this.retry();
    } else {
      this.removeEventListeners();
      this.connection?.close();
      this.emit('error',
          new Error('Max retries reached, transport in silent mode, OFFLINE'));
    }
  }

  private retry() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    this.emit('retrying');
    this.removeEventListeners();

    const self = this;
    this.once('connection:closed', () => {
      self.removeEventListeners();
      self.retryTimeout = setTimeout(() => {
        self.connection = undefined
        self.start();
      },
      self.timeoutConnectRetries);
    });
    this.connection?.close();
  }

  start() {
    if (!this.connection) {
      this.retries++;
      this.connection = this.createConnection();
      this.addEventListeners();
      this.connection.connect();
    }
  }

  log(entry: string, callback: Function) {
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
        connectionIsDrained = this.connection.send(entry + '\n', (error?: Error) => {
          if (error) {
            self.logQueue.unshift(logEntry)
          } else {
            callback();
          }
        });
      }
    }
  }
};
