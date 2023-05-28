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
  constructor(options) {
    var _options$host, _options$port;
    _defineProperty(this, "socket", void 0);
    _defineProperty(this, "manager", void 0);
    _defineProperty(this, "host", void 0);
    _defineProperty(this, "port", void 0);
    _defineProperty(this, "action", void 0);
    this.action = ConnectionActions.Initializing;
    this.host = (_options$host = options === null || options === void 0 ? void 0 : options.host) !== null && _options$host !== void 0 ? _options$host : '127.0.0.1';
    this.port = (_options$port = options === null || options === void 0 ? void 0 : options.port) !== null && _options$port !== void 0 ? _options$port : 28777;
  }
  socketOnError(error) {
    var _this$manager;
    this.action = ConnectionActions.HandlingError;
    (_this$manager = this.manager) === null || _this$manager === void 0 ? void 0 : _this$manager.emit('connection:error', error);
  }
  socketOnTimeout() {
    var _this$manager2, _this$socket;
    this.action = ConnectionActions.HandlingError;
    (_this$manager2 = this.manager) === null || _this$manager2 === void 0 ? void 0 : _this$manager2.emit('connection:timeout', (_this$socket = this.socket) === null || _this$socket === void 0 ? void 0 : _this$socket.readyState);
  }
  socketOnConnect() {
    var _this$socket2, _this$manager3;
    (_this$socket2 = this.socket) === null || _this$socket2 === void 0 ? void 0 : _this$socket2.setKeepAlive(true, 60 * 1000);
    this.action = ConnectionActions.Tranferring;
    (_this$manager3 = this.manager) === null || _this$manager3 === void 0 ? void 0 : _this$manager3.emit('connection:connected');
  }
  socketOnDrain() {
    var _this$manager4;
    (_this$manager4 = this.manager) === null || _this$manager4 === void 0 ? void 0 : _this$manager4.emit('connection:drain');
  }
  socketOnClose(error) {
    if (this.action === ConnectionActions.Closing) {
      var _this$manager5;
      (_this$manager5 = this.manager) === null || _this$manager5 === void 0 ? void 0 : _this$manager5.emit('connection:closed', error);
    } else {
      var _this$manager6;
      (_this$manager6 = this.manager) === null || _this$manager6 === void 0 ? void 0 : _this$manager6.emit('connection:closed:by-server', error);
    }
  }
  addEventListeners(socket) {
    socket.on('drain', this.socketOnDrain.bind(this));
    socket.once('error', this.socketOnError.bind(this));
    socket.once('timeout', this.socketOnTimeout.bind(this));
    socket.once('close', this.socketOnClose.bind(this));
  }
  close() {
    var _this$socket3, _this$socket4, _this$manager7;
    this.action = ConnectionActions.Closing;
    (_this$socket3 = this.socket) === null || _this$socket3 === void 0 ? void 0 : _this$socket3.removeAllListeners();
    (_this$socket4 = this.socket) === null || _this$socket4 === void 0 ? void 0 : _this$socket4.destroy();
    (_this$manager7 = this.manager) === null || _this$manager7 === void 0 ? void 0 : _this$manager7.emit('connection:closed');
  }
  send(message, writeCallback) {
    var _this$socket5;
    return ((_this$socket5 = this.socket) === null || _this$socket5 === void 0 ? void 0 : _this$socket5.write(Buffer.from(message), writeCallback)) === true;
  }
  readyToSend() {
    var _this$socket6;
    return ((_this$socket6 = this.socket) === null || _this$socket6 === void 0 ? void 0 : _this$socket6.readyState) === 'open';
  }
  connect(manager) {
    this.action = ConnectionActions.Connecting;
    this.manager = manager;
  }
}
exports.Connection = Connection;
class PlainConnection extends Connection {
  connect(manager) {
    super.connect(manager);
    try {
      this.socket = new _net.Socket();
      super.addEventListeners(this.socket);
      this.socket.on('connect', super.socketOnConnect.bind(this));
      this.socket.connect(this.port, this.host);
    } catch (error) {
      var _this$manager8;
      (_this$manager8 = this.manager) === null || _this$manager8 === void 0 ? void 0 : _this$manager8.emit('connection:error', error);
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
  connect(manager) {
    super.connect(manager);
    try {
      this.socket = _tls.default.connect(this.port, this.host, this.secureContextOptions);
      super.addEventListeners(this.socket);
      this.socket.on('secureConnect', super.socketOnConnect.bind(this));
    } catch (error) {
      var _this$manager9;
      (_this$manager9 = this.manager) === null || _this$manager9 === void 0 ? void 0 : _this$manager9.emit('connection:error', error);
    }
  }
}
exports.SecureConnection = SecureConnection;