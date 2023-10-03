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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Manager = void 0;
var connection_1 = require("./connection");
var events_1 = require("events");
var ECONNREFUSED_REGEXP = /ECONNREFUSED/;
var Manager = /** @class */ (function (_super) {
    __extends(Manager, _super);
    function Manager(options, connection) {
        var _this = this;
        var _a, _b;
        _this = _super.call(this) || this;
        _this.retries = -1;
        _this.retryTimeout = undefined;
        _this.connectionCallbacks = new Map;
        _this.options = options;
        _this.connection = connection;
        _this.logQueue = new Array();
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.Connected, _this.onConnected.bind(_this));
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.Closed, _this.onConnectionClosed.bind(_this));
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.ClosedByServer, _this.onConnectionError.bind(_this));
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.Error, _this.onConnectionError.bind(_this));
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.Timeout, _this.onConnectionError.bind(_this));
        _this.connectionCallbacks.set(connection_1.ConnectionEvents.Drain, _this.flush.bind(_this));
        // Connection retry attributes
        _this.retries = 0;
        _this.maxConnectRetries = (_a = options === null || options === void 0 ? void 0 : options.max_connect_retries) !== null && _a !== void 0 ? _a : 4;
        _this.timeoutConnectRetries = (_b = options === null || options === void 0 ? void 0 : options.timeout_connect_retries) !== null && _b !== void 0 ? _b : 100;
        return _this;
    }
    Manager.prototype.addEventListeners = function () {
        this.connection.once(connection_1.ConnectionEvents.Connected, this.connectionCallbacks.get(connection_1.ConnectionEvents.Connected));
        this.connection.once(connection_1.ConnectionEvents.Closed, this.connectionCallbacks.get(connection_1.ConnectionEvents.Closed));
        this.connection.once(connection_1.ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(connection_1.ConnectionEvents.ClosedByServer));
        this.connection.once(connection_1.ConnectionEvents.Error, this.connectionCallbacks.get(connection_1.ConnectionEvents.Error));
        this.connection.once(connection_1.ConnectionEvents.Timeout, this.connectionCallbacks.get(connection_1.ConnectionEvents.Timeout));
        this.connection.on(connection_1.ConnectionEvents.Drain, this.connectionCallbacks.get(connection_1.ConnectionEvents.Drain));
    };
    Manager.prototype.removeEventListeners = function () {
        this.connection.off(connection_1.ConnectionEvents.Connected, this.connectionCallbacks.get(connection_1.ConnectionEvents.Connected));
        this.connection.off(connection_1.ConnectionEvents.Closed, this.connectionCallbacks.get(connection_1.ConnectionEvents.Closed));
        this.connection.off(connection_1.ConnectionEvents.ClosedByServer, this.connectionCallbacks.get(connection_1.ConnectionEvents.ClosedByServer));
        this.connection.off(connection_1.ConnectionEvents.Error, this.connectionCallbacks.get(connection_1.ConnectionEvents.Error));
        this.connection.off(connection_1.ConnectionEvents.Timeout, this.connectionCallbacks.get(connection_1.ConnectionEvents.Timeout));
        this.connection.off(connection_1.ConnectionEvents.Drain, this.connectionCallbacks.get(connection_1.ConnectionEvents.Drain));
    };
    Manager.prototype.onConnected = function () {
        this.emit('connected');
        this.retries = 0;
        this.flush();
    };
    Manager.prototype.onConnectionClosed = function (error) {
        this.emit('closed');
        this.removeEventListeners();
    };
    Manager.prototype.isRetryableError = function (error) {
        // TODO: Due bug in the orginal implementation
        //       all the errors will get retried
        return true; // !ECONNREFUSED_REGEXP.test(error.message);
    };
    Manager.prototype.shouldTryToReconnect = function (error) {
        if (this.isRetryableError(error) === true) {
            if (this.maxConnectRetries < 0 ||
                this.retries < this.maxConnectRetries) {
                return true;
            }
            else {
                return false;
            }
        }
        else {
            return false;
        }
    };
    Manager.prototype.onConnectionError = function (error) {
        var _a;
        if (this.shouldTryToReconnect(error)) {
            this.retry();
        }
        else {
            this.removeEventListeners();
            (_a = this.connection) === null || _a === void 0 ? void 0 : _a.close();
            this.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
        }
    };
    Manager.prototype.retry = function () {
        if (this.retryTimeout) {
            clearTimeout(this.retryTimeout);
        }
        this.emit('retrying');
        this.removeEventListeners();
        var self = this;
        this.connection.once(connection_1.ConnectionEvents.Closed, function () {
            self.removeEventListeners();
            self.retryTimeout = setTimeout(function () {
                self.start();
            }, self.timeoutConnectRetries);
        });
        this.connection.close();
    };
    Manager.prototype.setConnection = function (connection) {
        this.connection = connection;
    };
    Manager.prototype.start = function () {
        this.retries++;
        this.addEventListeners();
        this.connection.connect();
    };
    Manager.prototype.log = function (entry, callback) {
        this.logQueue.push([entry, callback]);
        process.nextTick(this.flush.bind(this));
    };
    Manager.prototype.close = function () {
        var _a;
        this.emit('closing');
        this.flush();
        this.removeEventListeners();
        (_a = this.connection) === null || _a === void 0 ? void 0 : _a.close();
    };
    Manager.prototype.flush = function () {
        var _a;
        this.emit('flushing');
        var connectionIsDrained = true;
        var _loop_1 = function () {
            var logEntry = this_1.logQueue.shift();
            if (logEntry) {
                var entry = logEntry[0], callback_1 = logEntry[1];
                var self_1 = this_1;
                connectionIsDrained = this_1.connection.send(entry + '\n', function (error) {
                    if (error) {
                        self_1.logQueue.unshift(logEntry);
                    }
                    else {
                        callback_1();
                    }
                });
            }
        };
        var this_1 = this;
        while (this.logQueue.length && connectionIsDrained && ((_a = this.connection) === null || _a === void 0 ? void 0 : _a.readyToSend())) {
            _loop_1();
        }
    };
    return Manager;
}(events_1.EventEmitter));
exports.Manager = Manager;
;
