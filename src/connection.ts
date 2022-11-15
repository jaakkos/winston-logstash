import {Socket} from 'net'
import {readFileSync} from 'fs'
import tls from 'tls';
import { WinstonModuleTransportOptions } from 'winston';
import { Manager } from './manager';
import { LogstashTransportSSLOptions } from './types';

/**
 * Represents a connection to Logstash.
 * @constructor
 * @param {object} options
 * @param {object} manager
 */
export class Connection {
  protected socket: Socket | undefined;
  protected host: string;
  protected port: number;
  protected manager: any;

  constructor(options: WinstonModuleTransportOptions, manager: Manager) {
    this.manager = manager;
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 28777;
  }

  private socketOnError(error: Error) {
    this.manager.emit('connection:error', error);
  }

  private socketOnTimeout() {
    this.manager.emit('connection:timeout', this.socket?.readyState);
  }

  protected socketOnConnect() {
    this.socket?.setKeepAlive(true, 60 * 1000);
    this.manager.emit('connection:connected');
  }

  private socketOnClose(error: Error) {
    this.manager.emit('connection:closed', error);
  }

  protected addEventListeners(socket: Socket) {
    socket.once('error', this.socketOnError.bind(this));
    socket.once('timeout', this.socketOnTimeout.bind(this));
    socket.once('close', this.socketOnClose.bind(this));
  }

  close() {
    this.socket?.removeAllListeners();
    this.socket?.destroy();
    this.manager.emit('connection:closed');
  }

  send(message: string) {
    this.socket?.write(message);
  }

  readyToSend() {
    return this.socket && this.socket.readyState === 'open';
  }

  connect() {
    // Place Holder
  }
}

export class PlainConnection extends Connection {
  connect() {
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
    this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
    super.addEventListeners(this.socket);
    this.socket.on('secureConnect', super.socketOnConnect.bind(this));
  }
}
