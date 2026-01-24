"use strict";

var _winstonTransport = _interopRequireDefault(require("winston-transport"));
var _manager = require("./manager");
var _connection = require("./connection");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

/**
 * Safely stringify an object, handling circular references.
 * Circular references are replaced with "[Circular]".
 */
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class LogstashTransport extends _winstonTransport.default {
  constructor(options) {
    super(options);
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
    // Use safeStringify to handle circular references (e.g., Axios errors)
    this.manager.log(safeStringify(info), callback);
  }
  close() {
    this.manager.close();
  }
}
module.exports = LogstashTransport;