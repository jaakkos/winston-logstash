/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import { IConnection, ConnectionEvents } from './connection'
import { EventEmitter } from 'events';
import { LogstashTransportOptions, LogEntry } from './types';

const ECONNREFUSED_REGEXP = /ECONNREFUSED/;

export class Manager extends EventEmitter {
  private connection: IConnection
  private logQueue: Array<[string, Function]>;
  private options: LogstashTransportOptions;
  private retries: number = -1;
  private maxConnectRetries: number;
  private timeoutConnectRetries: number;
  private retryTimeout?: ReturnType<typeof setTimeout> = undefined;

  private connectionCallbacks: Map<ConnectionEvents, (e:Error) => void> = new Map<ConnectionEvents, () => void>

  constructor(options: LogstashTransportOptions, connection: IConnection) {
    super();
    this.options = options;
    this.connection = connection;
    this.logQueue = new Array();

    this.connectionCallbacks.set(ConnectionEvents.Connected, this.onConnected.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Closed, this.onConnectionClosed.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.ClosedByServer, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Error, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Timeout, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Drain, this.flush.bind(this));

    // Connection retry attributes
    this.retries = 0;
    this.maxConnectRetries = options?.max_connect_retries ?? 4;
    this.timeoutConnectRetries = options?.timeout_connect_retries ?? 100;
  }

  private addEventListeners() {
    this.connection.once(ConnectionEvents.Connected, this.connectionCallbacks.get(ConnectionEvents.Connected)!);
    this.connection.once(ConnectionEvents.Closed, this.connectionCallbacks.get(ConnectionEvents.Closed)!);
    this.connection.once(ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(ConnectionEvents.ClosedByServer)!);
    this.connection.once(ConnectionEvents.Error, this.connectionCallbacks.get(ConnectionEvents.Error)!);
    this.connection.once(ConnectionEvents.Timeout, this.connectionCallbacks.get(ConnectionEvents.Timeout)!);
    this.connection.on(ConnectionEvents.Drain, this.connectionCallbacks.get(ConnectionEvents.Drain)!);
  }

  private removeEventListeners() {
    this.connection.off(ConnectionEvents.Connected, this.connectionCallbacks.get(ConnectionEvents.Connected)!);
    this.connection.off(ConnectionEvents.Closed, this.connectionCallbacks.get(ConnectionEvents.Closed)!);
    this.connection.off(ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(ConnectionEvents.ClosedByServer)!);
    this.connection.off(ConnectionEvents.Error, this.connectionCallbacks.get(ConnectionEvents.Error)!);
    this.connection.off(ConnectionEvents.Timeout, this.connectionCallbacks.get(ConnectionEvents.Timeout)!);
    this.connection.off(ConnectionEvents.Drain, this.connectionCallbacks.get(ConnectionEvents.Drain)!);
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
    this.connection.once(ConnectionEvents.Closed, () => {
      self.removeEventListeners();
      self.retryTimeout = setTimeout(() => {
        self.start();
      },
        self.timeoutConnectRetries);
    });
    this.connection.close();
  }

  public setConnection(connection: IConnection): void {
    this.connection = connection;
  }

  start() {
    this.retries++;
    this.addEventListeners();
    this.connection.connect();
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
