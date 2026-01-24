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
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
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
    var _options$host, _options$port;
    super();
    _defineProperty(this, "socket", void 0);
    _defineProperty(this, "host", void 0);
    _defineProperty(this, "port", void 0);
    _defineProperty(this, "action", void 0);
    this.action = ConnectionActions.Initializing;
    this.host = (_options$host = options === null || options === void 0 ? void 0 : options.host) !== null && _options$host !== void 0 ? _options$host : '127.0.0.1';
    this.port = (_options$port = options === null || options === void 0 ? void 0 : options.port) !== null && _options$port !== void 0 ? _options$port : 28777;
  }
  socketOnError(error) {
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Error, error);
  }
  socketOnTimeout() {
    var _this$socket;
    this.action = ConnectionActions.HandlingError;
    this.emit(ConnectionEvents.Timeout, (_this$socket = this.socket) === null || _this$socket === void 0 ? void 0 : _this$socket.readyState);
  }
  socketOnConnect() {
    var _this$socket2;
    (_this$socket2 = this.socket) === null || _this$socket2 === void 0 || _this$socket2.setKeepAlive(true, 60 * 1000);
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
    var _this$socket3, _this$socket4;
    this.action = ConnectionActions.Closing;
    (_this$socket3 = this.socket) === null || _this$socket3 === void 0 || _this$socket3.removeAllListeners();
    (_this$socket4 = this.socket) === null || _this$socket4 === void 0 || _this$socket4.destroy();
    this.emit(ConnectionEvents.Closed);
  }
  send(message, writeCallback) {
    var _this$socket5;
    return ((_this$socket5 = this.socket) === null || _this$socket5 === void 0 ? void 0 : _this$socket5.write(message, 'utf8', writeCallback)) === true;
  }
  readyToSend() {
    var _this$socket6;
    return ((_this$socket6 = this.socket) === null || _this$socket6 === void 0 ? void 0 : _this$socket6.readyState) === 'open';
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
    _defineProperty(this, "secureContextOptions", void 0);
    this.secureContextOptions = SecureConnection.createSecureContextOptions(options);
  }
  static createSecureContextOptions(options) {
    const sslKey = options.ssl_key;
    const sslCert = options.ssl_cert;
    const ca = options.ca;
    const sslPassphrase = options.ssl_passphrase;
    const rejectUnauthorized = options.rejectUnauthorized;
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