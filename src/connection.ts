/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import { Socket } from 'net'
import { readFileSync } from 'fs'
import tls from 'tls';
import { WinstonModuleTransportOptions } from 'winston';
import { LogstashTransportSSLOptions } from './types';
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

  constructor(options: WinstonModuleTransportOptions) {
    super();
    this.action = ConnectionActions.Initializing;
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 28777;
  }

  private socketOnError(error: Error) {
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Error, error);
  }

  private socketOnTimeout() {
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Timeout, this.socket?.readyState);
  }

  protected socketOnConnect() {
    this.socket?.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    this.emit(ConnectionEvents.Connected);
  }

  private socketOnDrain() {
    this.emit(ConnectionEvents.Drain);
  }

  private socketOnClose(error: Error) {
    if (this.action === ConnectionActions.Closing) {
      this.emit(ConnectionEvents.Closed, error);
    } else {
      this.emit(ConnectionEvents.ClosedByServer, error);
    }
  }

  protected addEventListeners(socket: Socket) {
    socket.on('drain', this.socketOnDrain.bind(this));
    socket.once('error', this.socketOnError.bind(this));
    socket.once('timeout', this.socketOnTimeout.bind(this));
    socket.once('close', this.socketOnClose.bind(this));
  }


  close() {
    this.action = ConnectionActions.Closing;
    this.socket?.removeAllListeners();
    // Try to close the socket gracefully before destroying.
    this.socket?.end();
    this.socket?.destroy();
    this.socket = undefined;
    this.emit(ConnectionEvents.Closed);
  }

  send(message: string, writeCallback: (error?: Error) => void): boolean {
    return this.socket?.write(Buffer.from(message), writeCallback) === true;
  }

  readyToSend(): boolean {
    return this.socket?.readyState === 'open';
  }

  connect() {
    this.action = ConnectionActions.Connecting;
  }
}

export class PlainConnection extends Connection {
  connect() {
    super.connect();
    try {
      this.socket = new Socket();
      super.addEventListeners(this.socket);
      this.socket.once('connect', super.socketOnConnect.bind(this));
      this.socket.connect(this.port, this.host);
    } catch (error) {
      this.emit(ConnectionEvents.Error, error);
    }
  }
}

export class SecureConnection extends Connection {
  private secureContextOptions: tls.ConnectionOptions;
  constructor(options: WinstonModuleTransportOptions) {
    super(options);
    this.secureContextOptions =
      SecureConnection.createSecureContextOptions(options as LogstashTransportSSLOptions);
  }

  static createSecureContextOptions(options: LogstashTransportSSLOptions): tls.ConnectionOptions {
    const sslKey = options.ssl_key;
    const sslCert = options.ssl_cert;
    const ca = options.ca;
    const sslPassphrase = options.ssl_passphrase;
    const rejectUnauthorized = options.rejectUnauthorized;

    const secureContextOptions = {
      key: sslKey && readFileSync(sslKey),
      cert: sslCert && readFileSync(sslCert),
      passphrase: sslPassphrase || undefined,
      rejectUnauthorized: rejectUnauthorized!,
      ca: ca && readFileSync(ca)
    };

    return secureContextOptions;
  }

  connect() {
    super.connect();
    try {
      this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
      super.addEventListeners(this.socket);
      this.socket.once('secureConnect', super.socketOnConnect.bind(this));
    } catch (error) {
      this.emit(ConnectionEvents.Error, error);
    }
  }
}
