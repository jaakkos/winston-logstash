/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import {Socket} from 'net'
import {readFileSync} from 'fs'
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

export class Connection {
  protected socket: Socket | undefined;
  protected host: string;
  protected port: number;
  protected manager: any;
  protected action: ConnectionActions;

  constructor(options: WinstonModuleTransportOptions, manager: Manager) {
    this.action = ConnectionActions.Initializing;
    this.manager = manager;
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 28777;
  }

  private socketOnError(error: Error) {
    this.action = ConnectionActions.HandlingError;
    this.manager.emit('connection:error', error);
  }

  private socketOnTimeout() {
    this.action = ConnectionActions.HandlingError;
    this.manager.emit('connection:timeout', this.socket?.readyState);
  }

  protected socketOnConnect() {
    this.socket?.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    this.manager.emit('connection:connected');
  }

  protected socketOnDrain() {
    this.manager.emit('connection:drain');
  }

  private socketOnClose(error: Error) {
    if (this.action === ConnectionActions.Closing) {
      this.manager.emit('connection:closed', error);
    } else {
      this.manager.emit('connection:closed:by-server', error);
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
    this.manager.emit('connection:closed');
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
    this.socket = new Socket();
    this.socket.connect(this.port, this.host);
    super.addEventListeners(this.socket);
    this.socket.on('connect', super.socketOnConnect.bind(this));
  }
}

export class SecureConnection extends Connection {
  private secureContextOptions: tls.ConnectionOptions;
  constructor(options: WinstonModuleTransportOptions, manager: Manager) {
    super(options, manager);
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
      key: sslKey && readFileSync(sslKey) ,
      cert: sslCert && readFileSync(sslCert),
      passphrase: sslPassphrase || undefined,
      rejectUnauthorized: rejectUnauthorized!,
      ca: ca && readFileSync(ca)
    };

    return secureContextOptions;
  }

  connect() {
    super.connect();
    this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
    super.addEventListeners(this.socket);
    this.socket.on('secureConnect', super.socketOnConnect.bind(this));
  }
}
