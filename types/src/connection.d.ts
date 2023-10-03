/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
import { Socket } from 'net';
import tls from 'tls';
import { WinstonModuleTransportOptions } from 'winston';
import { LogstashTransportSSLOptions } from './types';
import { EventEmitter } from 'events';
export declare enum ConnectionActions {
    Initializing = "Initializing",
    Connecting = "Connecting",
    Closing = "Closing",
    Tranferring = "Transferring",
    HandlingError = "HandlingError"
}
export declare enum ConnectionEvents {
    Connected = "connection:connected",
    Closed = "connection:closed",
    ClosedByServer = "connection:closed:by-server",
    Error = "connection:error",
    Timeout = "connection:timeout",
    Drain = "connection:drain"
}
export interface IConnection extends EventEmitter {
    connect(): void;
    close(): void;
    send(message: string, callback: Function): boolean;
    readyToSend(): boolean;
}
export declare abstract class Connection extends EventEmitter implements IConnection {
    protected socket: Socket | undefined;
    protected host: string;
    protected port: number;
    protected action: ConnectionActions;
    constructor(options: WinstonModuleTransportOptions);
    private socketOnError;
    private socketOnTimeout;
    protected socketOnConnect(): void;
    private socketOnDrain;
    private socketOnClose;
    protected addEventListeners(socket: Socket): void;
    close(): void;
    send(message: string, writeCallback: (error?: Error) => void): boolean;
    readyToSend(): boolean;
    connect(): void;
}
export declare class PlainConnection extends Connection {
    connect(): void;
}
export declare class SecureConnection extends Connection {
    private secureContextOptions;
    constructor(options: WinstonModuleTransportOptions);
    static createSecureContextOptions(options: LogstashTransportSSLOptions): tls.ConnectionOptions;
    connect(): void;
}
