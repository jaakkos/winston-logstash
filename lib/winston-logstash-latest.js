"use strict";

var _winstonTransport = _interopRequireDefault(require("winston-transport"));
var _manager = require("./manager");
var _connection = require("./connection");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */
//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class LogstashTransport extends _winstonTransport.default {
  constructor(options) {
    super(options);
    _defineProperty(this, "manager", void 0);
    _defineProperty(this, "connection", void 0);
    _defineProperty(this, "name", void 0);
    this.name = 'logstash';
    this.connection = options.ssl_enable ? new _connection.SecureConnection(options) : new _connection.PlainConnection(options);
    this.manager = new _manager.Manager(options, this.connection);
    this.manager.on('error', this.onError.bind(this));
    this.manager.start();
  }
  onError(error) {
    this.silent = true;
    this.emit('error', error);
  }
  log(info, callback) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Perform the writing to the remote service
    this.manager.log(JSON.stringify(info), callback);
  }
  close() {
    this.manager.close();
  }
};