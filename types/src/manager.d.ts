/// <reference types="node" />
import { IConnection } from './connection';
import { EventEmitter } from 'events';
import { LogstashTransportOptions } from './types';
export declare class Manager extends EventEmitter {
    private connection;
    private logQueue;
    private options;
    private retries;
    private readonly retryStrategy;
    private nextRetryTimeoutForExponentialBackoff;
    private retryTimeout?;
    private connectionCallbacks;
    constructor(options: LogstashTransportOptions, connection: IConnection);
    private addEventListeners;
    private removeEventListeners;
    private onConnected;
    private onConnectionClosed;
    private isRetryableError;
    private shouldTryToReconnect;
    private onConnectionError;
    private retry;
    setConnection(connection: IConnection): void;
    start(): void;
    log(entry: string, callback: Function): void;
    close(): void;
    flush(): void;
}
