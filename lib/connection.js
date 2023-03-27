"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.SecureConnection = exports.PlainConnection = exports.Connection = void 0;
var _net = require("net");
var _fs = require("fs");
var _tls = _interopRequireDefault(require("tls"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
var ConnectionActions;
(function (ConnectionActions) {
  ConnectionActions["Initializing"] = "Initializing";
  ConnectionActions["Connecting"] = "Connecting";
  ConnectionActions["Closing"] = "Closing";
  ConnectionActions["Tranferring"] = "Transferring";
  ConnectionActions["HandlingError"] = "HandlingError";
})(ConnectionActions || (ConnectionActions = {}));
class Connection {
  constructor(options, manager) {
    var _options$host, _options$port;
    _defineProperty(this, "socket", void 0);
    _defineProperty(this, "host", void 0);
    _defineProperty(this, "port", void 0);
    _defineProperty(this, "manager", void 0);
    _defineProperty(this, "action", void 0);
    this.action = ConnectionActions.Initializing;
    this.manager = manager;
    this.host = (_options$host = options === null || options === void 0 ? void 0 : options.host) !== null && _options$host !== void 0 ? _options$host : '127.0.0.1';
    this.port = (_options$port = options === null || options === void 0 ? void 0 : options.port) !== null && _options$port !== void 0 ? _options$port : 28777;
  }
  socketOnError(error) {
    this.action = ConnectionActions.HandlingError;
    this.manager.emit('connection:error', error);
  }
  socketOnTimeout() {
    var _this$socket;
    this.action = ConnectionActions.HandlingError;
    this.manager.emit('connection:timeout', (_this$socket = this.socket) === null || _this$socket === void 0 ? void 0 : _this$socket.readyState);
  }
  socketOnConnect() {
    var _this$socket2;
    (_this$socket2 = this.socket) === null || _this$socket2 === void 0 ? void 0 : _this$socket2.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    this.manager.emit('connection:connected');
  }
  socketOnDrain() {
    this.manager.emit('connection:drain');
  }
  socketOnClose(error) {
    if (this.action === ConnectionActions.Closing) {
      this.manager.emit('connection:closed', error);
    } else {
      this.manager.emit('connection:closed:by-server', error);
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
    (_this$socket3 = this.socket) === null || _this$socket3 === void 0 ? void 0 : _this$socket3.removeAllListeners();
    (_this$socket4 = this.socket) === null || _this$socket4 === void 0 ? void 0 : _this$socket4.destroy();
    this.manager.emit('connection:closed');
  }
  send(message, writeCallback) {
    var _this$socket5;
    return ((_this$socket5 = this.socket) === null || _this$socket5 === void 0 ? void 0 : _this$socket5.write(Buffer.from(message), writeCallback)) === true;
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
    this.socket = new _net.Socket();
    this.socket.connect(this.port, this.host);
    super.addEventListeners(this.socket);
    this.socket.on('connect', super.socketOnConnect.bind(this));
  }
}
exports.PlainConnection = PlainConnection;
class SecureConnection extends Connection {
  constructor(options, manager) {
    super(options, manager);
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
    this.socket = _tls.default.connect(this.port, this.host, this.secureContextOptions);
    super.addEventListeners(this.socket);
    this.socket.on('secureConnect', super.socketOnConnect.bind(this));
  }
}
exports.SecureConnection = SecureConnection;