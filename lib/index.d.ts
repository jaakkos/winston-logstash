/// <reference types="node" />
/// <reference types="node" />
/// <reference types="node" />
declare module "types" {
    import { GenericTextTransportOptions, GenericTransportOptions } from "winston";
    import { TransportStreamOptions } from "winston-transport";
    export type LogEntry = [String, Function];
    export type LogEntries = [LogEntry];
    export interface ConnectionOptions {
        host?: string;
        port?: number;
    }
    export interface ConnectionManagerOptions {
        max_connect_retries?: number;
        timeout_connect_retries?: number;
    }
    export interface SecureConnectionOptions extends ConnectionOptions {
        ssl_key?: string;
        ssl_cert?: string;
        ca?: string;
        ssl_passphrase?: string;
        rejectUnauthorized?: boolean;
    }
    export interface InstanceOptions extends ConnectionManagerOptions, SecureConnectionOptions {
        ssl_enable?: Boolean;
    }
    export interface LogstashOptions extends GenericTransportOptions, GenericTextTransportOptions, InstanceOptions {
        node_name?: string;
        meta?: Object;
    }
    export interface LogstashTransportOptions extends TransportStreamOptions, InstanceOptions {
    }
}
declare module "connection" {
    import { Socket } from 'net';
    import tls from 'tls';
    import { ConnectionOptions, SecureConnectionOptions } from "types";
    import { EventEmitter } from 'events';
    export enum ConnectionActions {
        Initializing = "Initializing",
        Connecting = "Connecting",
        Closing = "Closing",
        Tranferring = "Transferring",
        HandlingError = "HandlingError"
    }
    export enum ConnectionEvents {
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
    export abstract class Connection extends EventEmitter implements IConnection {
        protected socket: Socket | undefined;
        protected host: string;
        protected port: number;
        protected action: ConnectionActions;
        constructor(options: ConnectionOptions);
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
    export class PlainConnection extends Connection {
        connect(): void;
    }
    export class SecureConnection extends Connection {
        private secureContextOptions;
        constructor(options: SecureConnectionOptions);
        static createSecureContextOptions(options: SecureConnectionOptions): tls.ConnectionOptions;
        connect(): void;
    }
}
declare module "manager" {
    import { IConnection } from "connection";
    import { EventEmitter } from 'events';
    import { ConnectionManagerOptions } from "types";
    export class Manager extends EventEmitter {
        private connection;
        private logQueue;
        private options;
        private retries;
        private maxConnectRetries;
        private timeoutConnectRetries;
        private retryTimeout?;
        private connectionCallbacks;
        constructor(options: ConnectionManagerOptions, connection: IConnection);
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
}
declare module "winston-logstash-latest" {
    import Transport from "winston-transport";
    import { LogstashTransportOptions } from "types";
    class LogstashTransport extends Transport {
        private manager;
        private connection;
        name: string;
        constructor(options: LogstashTransportOptions);
        onError(error: Error): void;
        log(info: any, callback: Function): void;
        close(): void;
    }
    export = LogstashTransport;
}
declare module "winston-logstash" {
    import { Transport } from "winston";
    import { LogstashOptions } from "types";
    export class Logstash extends Transport {
        private node_name;
        private json;
        private label;
        private meta_defaults;
        private manager;
        private connection;
        constructor(options: LogstashOptions);
        log(level: any, msg: string, meta: Object, callback: Function): any;
        onError(error: Error): void;
        close(): void;
        private defaultTransform;
    }
}
