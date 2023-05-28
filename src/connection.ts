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
import { Manager } from './manager';
import { LogstashTransportSSLOptions } from './types';

enum ConnectionActions {
  Initializing = "Initializing",
  Connecting = "Connecting",
  Closing = "Closing",
  Tranferring = "Transferring",
  HandlingError = "HandlingError"
}

export interface IConnection {
  connect(manager: Manager): void;
  close(): void;
  send(message: string, callback: Function): boolean;
  readyToSend(): boolean;
}

export abstract class Connection implements IConnection {
  protected socket: Socket | undefined;
  protected manager: Manager | undefined;
  protected host: string;
  protected port: number;
  protected action: ConnectionActions;

  constructor(options: WinstonModuleTransportOptions) {
    this.action = ConnectionActions.Initializing;
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 28777;
  }

  private socketOnError(error: Error) {
    this.action = ConnectionActions.HandlingError;
    this.manager?.emit('connection:error', error);
  }

  private socketOnTimeout() {
    this.action = ConnectionActions.HandlingError;
    this.manager?.emit('connection:timeout', this.socket?.readyState);
  }

  protected socketOnConnect() {
    this.socket?.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    this.manager?.emit('connection:connected');
  }

  protected socketOnDrain() {
    this.manager?.emit('connection:drain');
  }

  private socketOnClose(error: Error) {
    if (this.action === ConnectionActions.Closing) {
      this.manager?.emit('connection:closed', error);
    } else {
      this.manager?.emit('connection:closed:by-server', error);
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
    this.socket?.destroy();
    this.manager?.emit('connection:closed');
  }

  send(message: string, writeCallback: (error?: Error) => void): boolean {
    return this.socket?.write(Buffer.from(message), writeCallback) === true;
  }

  readyToSend(): boolean {
    return this.socket?.readyState === 'open';
  }

  connect(manager: Manager) {
    this.action = ConnectionActions.Connecting;
    this.manager = manager;
  }
}

export class PlainConnection extends Connection {
  connect(manager: Manager) {
    super.connect(manager);
    try {
      this.socket = new Socket();
      super.addEventListeners(this.socket);
      this.socket.on('connect', super.socketOnConnect.bind(this));
      this.socket.connect(this.port, this.host);
    } catch (error) {
      this.manager?.emit('connection:error', error);
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

  connect(manager: Manager) {
    super.connect(manager);
    try {
      this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
      super.addEventListeners(this.socket);
      this.socket.on('secureConnect', super.socketOnConnect.bind(this));
    } catch (error) {
      this.manager?.emit('connection:error', error);
    }
  }
}
