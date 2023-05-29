"use strict";

var _winstonTransport = _interopRequireDefault(require("winston-transport"));
var _manager = require("./manager");
var _connection = require("./connection");
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
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