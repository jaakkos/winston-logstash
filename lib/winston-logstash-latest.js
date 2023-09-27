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
var winston_transport_1 = __importDefault(require("winston-transport"));
var manager_1 = require("./manager");
var connection_1 = require("./connection");
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
var LogstashTransport = /** @class */ (function (_super) {
    __extends(LogstashTransport, _super);
    function LogstashTransport(options) {
        var _this = _super.call(this, options) || this;
        _this.name = 'logstash';
        _this.connection = options.ssl_enable ? new connection_1.SecureConnection(options) : new connection_1.PlainConnection(options);
        _this.manager = new manager_1.Manager(options, _this.connection);
        _this.manager.on('error', _this.onError.bind(_this));
        _this.manager.start();
        return _this;
    }
    LogstashTransport.prototype.onError = function (error) {
        this.silent = true;
        this.emit('error', error);
    };
    LogstashTransport.prototype.log = function (info, callback) {
        var _this = this;
        setImmediate(function () {
            _this.emit('logged', info);
        });
        // Perform the writing to the remote service
        this.manager.log(JSON.stringify(info), callback);
    };
    LogstashTransport.prototype.close = function () {
        this.manager.close();
    };
    return LogstashTransport;
}(winston_transport_1.default));
;
module.exports = LogstashTransport;
