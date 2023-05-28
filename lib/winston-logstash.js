"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Logstash = void 0;
var _winston = require("winston");
var _manager = require("./manager");
var _connection = require("./connection");
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
const common = require('winston/lib/winston/common');
class Logstash extends _winston.Transport {
  constructor(options) {
    super(options);
    _defineProperty(this, "node_name", void 0);
    _defineProperty(this, "json", true);
    _defineProperty(this, "label", void 0);
    _defineProperty(this, "meta_defaults", void 0);
    _defineProperty(this, "manager", void 0);
    _defineProperty(this, "connection", void 0);
    this.name = 'logstash';
    this.node_name = options.node_name || process.title;

    // Miscellaneous options
    this.label = options.label || this.node_name;
    this.meta_defaults = Object.assign({}, options.meta);
    this.connection = options.ssl_enable ? new _connection.SecureConnection(options) : new _connection.PlainConnection(options);
    this.manager = new _manager.Manager(options, this.connection);
    this.manager.on('error', this.onError.bind(this));
    this.manager.start();
  }
  log(level, msg, meta, callback) {
    if (this.silent) {
      return callback(null, true);
    }
    const logEntry = this.defaultTransform(level, msg, Object.assign({}, meta, this.meta_defaults));
    this.manager.log(logEntry, () => {
      callback(null, true);
    });
    this.emit('logged');
  }
  onError(error) {
    this.silent = true;
    this.emit('error', error);
  }
  close() {
    this.manager.close();
  }
  defaultTransform(level, msg, meta) {
    return common.log({
      level: level,
      message: msg,
      meta: meta,
      json: this.json,
      label: this.label,
      humanReadableUnhandledException: this.humanReadableUnhandledException
    });
  }
}
exports.Logstash = Logstash;