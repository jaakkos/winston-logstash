/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import {IConnection, ConnectionEvents} from './connection';
import {EventEmitter} from 'events';
import {ConnectionManagerOptions, RetryStrategy} from './types';
import {isTransientConnectionError} from './retryable-error';

const DEFAULT_INITIAL_DELAY_MS = 100;
const MAX_RETRIES_OFFLINE_MESSAGE =
  'Max retries reached, transport in silent mode, OFFLINE';
const NON_RETRYABLE_OFFLINE_MESSAGE =
  'Non-retryable connection error, transport in silent mode, OFFLINE';

export class Manager extends EventEmitter {
  private connection: IConnection;
  private logQueue: Array<[string, Function]>;
  private options: ConnectionManagerOptions;
  private retries: number = -1;
  private readonly retryStrategy: RetryStrategy;
  private nextRetryDelayMs: number = DEFAULT_INITIAL_DELAY_MS;
  private retryTimeout?: ReturnType<typeof setTimeout> = undefined;
  private isFlushing = false;

  private connectionCallbacks: Map<ConnectionEvents, (e:Error) => void> = new Map<ConnectionEvents, () => void>;

  constructor(options: ConnectionManagerOptions, connection: IConnection) {
    super();
    this.options = options;
    this.connection = connection;
    this.logQueue = [];

    this.connectionCallbacks.set(ConnectionEvents.Connected, this.onConnected.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Closed, this.onConnectionClosed.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.ClosedByServer, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Error, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Timeout, this.onConnectionError.bind(this));
    this.connectionCallbacks.set(ConnectionEvents.Drain, this.flush.bind(this));

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
        delayBeforeRetryMs: options?.timeout_connect_retries ?? 100,
      };
    }
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
    // Reset exponential backoff delay on successful connection
    if (this.retryStrategy.strategy === 'exponentialBackoff') {
      this.nextRetryDelayMs = this.retryStrategy.initialDelayMs ?? DEFAULT_INITIAL_DELAY_MS;
    }
    this.flush();
  }

  private onConnectionClosed(error: Error) {
    this.emit('closed');
    this.removeEventListeners();
  }

  private isRetryableError(error: Error) {
    // Default: retry all errors (historical behavior / original implementation).
    // Opt-in: only retry transient network errors; fail-fast on permanent TLS/cert failures.
    if (!this.options.retry_transient_errors_only) {
      return true;
    }
    return isTransientConnectionError(error);
  }

  private shouldTryToReconnect(error: Error) {
    if (this.isRetryableError(error)) {
      const {maxConnectRetries} = this.retryStrategy;
      return maxConnectRetries < 0 || this.retries < maxConnectRetries;
    }
    return false;
  }

  private onConnectionError(error: Error) {
    if (this.shouldTryToReconnect(error)) {
      this.retry();
    } else {
      this.removeEventListeners();
      this.connection?.close();
      const offlineError = this.isRetryableError(error) ?
        new Error(MAX_RETRIES_OFFLINE_MESSAGE) :
        Object.assign(new Error(NON_RETRYABLE_OFFLINE_MESSAGE), {cause: error});
      this.emit('error', offlineError);
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

      // Calculate retry delay based on strategy
      let retryDelayMs: number;
      if (self.retryStrategy.strategy === 'exponentialBackoff') {
        retryDelayMs = self.nextRetryDelayMs;
        // Double the delay for next time, capped at max
        self.nextRetryDelayMs = Math.min(
          self.nextRetryDelayMs * 2,
          self.retryStrategy.maxDelayBeforeRetryMs,
        );
      } else {
        retryDelayMs = self.retryStrategy.delayBeforeRetryMs;
      }

      self.retryTimeout = setTimeout(() => {
        self.start();
      }, retryDelayMs);
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
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
    this.flush();
    this.removeEventListeners();
    this.connection?.close();
  }

  flush() {
    this.emit('flushing');
    if (this.isFlushing || !this.logQueue.length || !this.connection?.readyToSend()) {
      return;
    }

    const logEntry = this.logQueue[0];
    const [entry, callback] = logEntry;
    this.isFlushing = true;

    const canWriteMore = this.connection.send(entry + '\n', (error?: Error) => {
      this.isFlushing = false;
      if (error) {
        // Leave the entry at the front of the queue for a later flush/retry.
        return;
      }
      this.logQueue.shift();
      callback();
      process.nextTick(() => this.flush());
    });

    // When write returns false, wait for Drain (and/or the write callback) before continuing.
    if (!canWriteMore) {
      return;
    }
  }
};
