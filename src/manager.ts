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
  ssl_enable: Boolean;
  retries: number = -1;
  max_connect_retries: number;
  timeout_connect_retries: number;
  retry_timeout?: ReturnType<typeof setTimeout> = undefined;

  constructor(options: LogstashTransportOptions) {
    super();
    this.options = options;
    this.ssl_enable = options?.ssl_enable === true;

    this.logQueue = new Array();

    // Connection retry attributes
    this.retries = 0;
    this.max_connect_retries = options?.max_connect_retries ?? 4;
    this.timeout_connect_retries = options?.timeout_connect_retries ?? 100;
  }

  private addEventListeners() {
    this.once('connection:connected', this.onConnected.bind(this));
    this.once('connection:closed', this.onConnectionClosed.bind(this));
    this.once('connection:closed:by-server', this.onConnectionError.bind(this));
    this.once('connection:error', this.onConnectionError.bind(this));
    this.once('connection:timeout', this.onConnectionError.bind(this));
  }

  private removeEventListeners() {
    this.off('connection:connected', this.onConnected.bind(this));
    this.off('connection:closed', this.onConnectionClosed.bind(this));
    this.off('connection:closed:by-server', this.onConnectionError.bind(this));
    this.off('connection:error', this.onConnectionError.bind(this));
    this.off('connection:timeout', this.onConnectionError.bind(this));
  }

  private createConnection() {
    if (this.ssl_enable) {
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
    if (this.retry_timeout) {
      clearTimeout(this.retry_timeout);
    }

    this.emit('retrying');
    this.removeEventListeners();
    const self = this;
      this.once('connection:closed', () => {
        self.removeEventListeners();
        self.retry_timeout = setTimeout(() => {
          self.connection = undefined
          self.start();
        },
        self.timeout_connect_retries);
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
    while (this.connection?.readyToSend() &&
            this.logQueue.length) {
      const logEntry = this.logQueue.shift();
      if (logEntry) {
        const [entry, callback] = logEntry;
        this.connection.send(entry + '\n', (error?: Error) => {
          if (error) {
            this.logQueue.unshift(logEntry)
          } else {
            callback();
          }
        });

      }
    }
  }
};
