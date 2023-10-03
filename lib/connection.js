"use strict";
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureConnection = exports.PlainConnection = exports.Connection = exports.ConnectionEvents = exports.ConnectionActions = void 0;
var net_1 = require("net");
var fs_1 = require("fs");
var tls_1 = __importDefault(require("tls"));
var events_1 = require("events");
var ConnectionActions;
(function (ConnectionActions) {
    ConnectionActions["Initializing"] = "Initializing";
    ConnectionActions["Connecting"] = "Connecting";
    ConnectionActions["Closing"] = "Closing";
    ConnectionActions["Tranferring"] = "Transferring";
    ConnectionActions["HandlingError"] = "HandlingError";
})(ConnectionActions = exports.ConnectionActions || (exports.ConnectionActions = {}));
var ConnectionEvents;
(function (ConnectionEvents) {
    ConnectionEvents["Connected"] = "connection:connected";
    ConnectionEvents["Closed"] = "connection:closed";
    ConnectionEvents["ClosedByServer"] = "connection:closed:by-server";
    ConnectionEvents["Error"] = "connection:error";
    ConnectionEvents["Timeout"] = "connection:timeout";
    ConnectionEvents["Drain"] = "connection:drain";
})(ConnectionEvents = exports.ConnectionEvents || (exports.ConnectionEvents = {}));
var Connection = /** @class */ (function (_super) {
    __extends(Connection, _super);
    function Connection(options) {
        var _this = this;
        var _a, _b;
        _this = _super.call(this) || this;
        _this.action = ConnectionActions.Initializing;
        _this.host = (_a = options === null || options === void 0 ? void 0 : options.host) !== null && _a !== void 0 ? _a : '127.0.0.1';
        _this.port = (_b = options === null || options === void 0 ? void 0 : options.port) !== null && _b !== void 0 ? _b : 28777;
        return _this;
    }
    Connection.prototype.socketOnError = function (error) {
        this.action = ConnectionActions.HandlingError;
        this.emit(ConnectionEvents.Error, error);
    };
    Connection.prototype.socketOnTimeout = function () {
        var _a;
        this.action = ConnectionActions.HandlingError;
        this.emit(ConnectionEvents.Timeout, (_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState);
    };
    Connection.prototype.socketOnConnect = function () {
        var _a;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.setKeepAlive(true, 60 * 1000);
        this.action = ConnectionActions.Tranferring;
        this.emit(ConnectionEvents.Connected);
    };
    Connection.prototype.socketOnDrain = function () {
        this.emit(ConnectionEvents.Drain);
    };
    Connection.prototype.socketOnClose = function (error) {
        if (this.action === ConnectionActions.Closing) {
            this.emit(ConnectionEvents.Closed, error);
        }
        else {
            this.emit(ConnectionEvents.ClosedByServer, error);
        }
    };
    Connection.prototype.addEventListeners = function (socket) {
        socket.on('drain', this.socketOnDrain.bind(this));
        socket.once('error', this.socketOnError.bind(this));
        socket.once('timeout', this.socketOnTimeout.bind(this));
        socket.once('close', this.socketOnClose.bind(this));
    };
    Connection.prototype.close = function () {
        var _a, _b;
        this.action = ConnectionActions.Closing;
        (_a = this.socket) === null || _a === void 0 ? void 0 : _a.removeAllListeners();
        (_b = this.socket) === null || _b === void 0 ? void 0 : _b.destroy();
        this.emit(ConnectionEvents.Closed);
    };
    Connection.prototype.send = function (message, writeCallback) {
        var _a;
        return ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.write(Buffer.from(message), writeCallback)) === true;
    };
    Connection.prototype.readyToSend = function () {
        var _a;
        return ((_a = this.socket) === null || _a === void 0 ? void 0 : _a.readyState) === 'open';
    };
    Connection.prototype.connect = function () {
        this.action = ConnectionActions.Connecting;
    };
    return Connection;
}(events_1.EventEmitter));
exports.Connection = Connection;
var PlainConnection = /** @class */ (function (_super) {
    __extends(PlainConnection, _super);
    function PlainConnection() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    PlainConnection.prototype.connect = function () {
        _super.prototype.connect.call(this);
        try {
            this.socket = new net_1.Socket();
            _super.prototype.addEventListeners.call(this, this.socket);
            this.socket.once('connect', _super.prototype.socketOnConnect.bind(this));
            this.socket.connect(this.port, this.host);
        }
        catch (error) {
            this.emit(ConnectionEvents.Error, error);
        }
    };
    return PlainConnection;
}(Connection));
exports.PlainConnection = PlainConnection;
var SecureConnection = /** @class */ (function (_super) {
    __extends(SecureConnection, _super);
    function SecureConnection(options) {
        var _this = _super.call(this, options) || this;
        _this.secureContextOptions =
            SecureConnection.createSecureContextOptions(options);
        return _this;
    }
    SecureConnection.createSecureContextOptions = function (options) {
        var sslKey = options.ssl_key;
        var sslCert = options.ssl_cert;
        var ca = options.ca;
        var sslPassphrase = options.ssl_passphrase;
        var rejectUnauthorized = options.rejectUnauthorized;
        var secureContextOptions = {
            key: sslKey && (0, fs_1.readFileSync)(sslKey),
            cert: sslCert && (0, fs_1.readFileSync)(sslCert),
            passphrase: sslPassphrase || undefined,
            rejectUnauthorized: rejectUnauthorized,
            ca: ca && (0, fs_1.readFileSync)(ca)
        };
        return secureContextOptions;
    };
    SecureConnection.prototype.connect = function () {
        _super.prototype.connect.call(this);
        try {
            this.socket = tls_1.default.connect(this.port, this.host, this.secureContextOptions);
            _super.prototype.addEventListeners.call(this, this.socket);
            this.socket.once('secureConnect', _super.prototype.socketOnConnect.bind(this));
        }
        catch (error) {
            this.emit(ConnectionEvents.Error, error);
        }
    };
    return SecureConnection;
}(Connection));
exports.SecureConnection = SecureConnection;
