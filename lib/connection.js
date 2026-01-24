"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SecureConnection = exports.PlainConnection = exports.ConnectionEvents = exports.ConnectionActions = exports.Connection = void 0;
var _net = require("net");
var _fs = require("fs");
var _tls = _interopRequireDefault(require("tls"));
var _events = require("events");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */
let ConnectionActions = exports.ConnectionActions = /*#__PURE__*/function (ConnectionActions) {
  ConnectionActions["Initializing"] = "Initializing";
  ConnectionActions["Connecting"] = "Connecting";
  ConnectionActions["Closing"] = "Closing";
  ConnectionActions["Tranferring"] = "Transferring";
  ConnectionActions["HandlingError"] = "HandlingError";
  return ConnectionActions;
}({});
let ConnectionEvents = exports.ConnectionEvents = /*#__PURE__*/function (ConnectionEvents) {
  ConnectionEvents["Connected"] = "connection:connected";
  ConnectionEvents["Closed"] = "connection:closed";
  ConnectionEvents["ClosedByServer"] = "connection:closed:by-server";
  ConnectionEvents["Error"] = "connection:error";
  ConnectionEvents["Timeout"] = "connection:timeout";
  ConnectionEvents["Drain"] = "connection:drain";
  return ConnectionEvents;
}({});
class Connection extends _events.EventEmitter {
  constructor(options) {
    super();
    this.action = ConnectionActions.Initializing;
    this.host = options?.host ?? '127.0.0.1';
    this.port = options?.port ?? 28777;
  }
  socketOnError(error) {
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Error, error);
  }
  socketOnTimeout() {
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Timeout, this.socket?.readyState);
  }
  socketOnConnect() {
    this.socket?.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    this.emit(ConnectionEvents.Connected);
  }
  socketOnDrain() {
    this.emit(ConnectionEvents.Drain);
  }
  socketOnClose(error) {
    if (this.action === ConnectionActions.Closing) {
      this.emit(ConnectionEvents.Closed, error);
    } else {
      this.emit(ConnectionEvents.ClosedByServer, error);
    }
  }
  addEventListeners(socket) {
    socket.on('drain', this.socketOnDrain.bind(this));
    socket.once('error', this.socketOnError.bind(this));
    socket.once('timeout', this.socketOnTimeout.bind(this));
    socket.once('close', this.socketOnClose.bind(this));
  }
  close() {
    this.action = ConnectionActions.Closing;
    this.socket?.removeAllListeners();
    // Try to close the socket gracefully before destroying
    this.socket?.end();
    this.socket?.destroy();
    this.socket = undefined;
    this.emit(ConnectionEvents.Closed);
  }
  send(message, writeCallback) {
    return this.socket?.write(message, 'utf8', writeCallback) === true;
  }
  readyToSend() {
    return this.socket?.readyState === 'open';
  }
  connect() {
    this.action = ConnectionActions.Connecting;
  }
}
exports.Connection = Connection;
class PlainConnection extends Connection {
  connect() {
    super.connect();
    try {
      this.socket = new _net.Socket();
      super.addEventListeners(this.socket);
      this.socket.once('connect', super.socketOnConnect.bind(this));
      this.socket.connect(this.port, this.host);
    } catch (error) {
      this.emit(ConnectionEvents.Error, error);
    }
  }
}
exports.PlainConnection = PlainConnection;
class SecureConnection extends Connection {
  constructor(options) {
    super(options);
    this.secureContextOptions = SecureConnection.createSecureContextOptions(options);
  }
  static createSecureContextOptions(options) {
    const sslKey = options.ssl_key;
    const sslCert = options.ssl_cert;
    const ca = options.ca;
    const sslPassphrase = options.ssl_passphrase;
    // Default to true (secure) - verify server certificate
    const rejectUnauthorized = options.rejectUnauthorized !== false;

    // Warn if SSL verification is enabled but no CA is provided
    // This will likely fail with self-signed certificates
    if (rejectUnauthorized && !ca) {
      console.warn('[winston-logstash] SSL verification is enabled but no CA certificate provided. ' + 'Connection will fail if the server uses a self-signed certificate. ' + 'Either provide a "ca" option with the CA certificate path, ' + 'or set "rejectUnauthorized: false" (not recommended for production).');
    }
    const secureContextOptions = {
      key: sslKey && (0, _fs.readFileSync)(sslKey),
      cert: sslCert && (0, _fs.readFileSync)(sslCert),
      passphrase: sslPassphrase || undefined,
      rejectUnauthorized: rejectUnauthorized,
      ca: ca && (0, _fs.readFileSync)(ca)
    };
    return secureContextOptions;
  }
  connect() {
    super.connect();
    try {
      this.socket = _tls.default.connect(this.port, this.host, this.secureContextOptions);
      super.addEventListeners(this.socket);
      this.socket.once('secureConnect', super.socketOnConnect.bind(this));
    } catch (error) {
      this.emit(ConnectionEvents.Error, error);
    }
  }
}
exports.SecureConnection = SecureConnection;