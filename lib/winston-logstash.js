"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logstash = void 0;
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */
var winston_1 = require("winston");
var common = require('winston/lib/winston/common');
var manager_1 = require("./manager");
var connection_1 = require("./connection");
var Logstash = /** @class */ (function (_super) {
    __extends(Logstash, _super);
    function Logstash(options) {
        var _this = _super.call(this, options) || this;
        _this.json = true;
        _this.name = 'logstash';
        _this.node_name = options.node_name || process.title;
        // Miscellaneous options
        _this.label = options.label || _this.node_name;
        _this.meta_defaults = Object.assign({}, options.meta);
        _this.connection = options.ssl_enable ? new connection_1.SecureConnection(options) : new connection_1.PlainConnection(options);
        _this.manager = new manager_1.Manager(options, _this.connection);
        _this.manager.on('error', _this.onError.bind(_this));
        _this.manager.start();
        return _this;
    }
    Logstash.prototype.log = function (level, msg, meta, callback) {
        if (this.silent) {
            return callback(null, true);
        }
        var logEntry = this.defaultTransform(level, msg, Object.assign({}, meta, this.meta_defaults));
        this.manager.log(logEntry, function () {
            callback(null, true);
        });
        this.emit('logged');
    };
    Logstash.prototype.onError = function (error) {
        this.silent = true;
        this.emit('error', error);
    };
    Logstash.prototype.close = function () {
        this.manager.close();
    };
    Logstash.prototype.defaultTransform = function (level, msg, meta) {
        return common.log({
            level: level,
            message: msg,
            meta: meta,
            json: this.json,
            label: this.label,
            humanReadableUnhandledException: this.humanReadableUnhandledException,
        });
    };
    ;
    return Logstash;
}(winston_1.Transport));
exports.Logstash = Logstash;
