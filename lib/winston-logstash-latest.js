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
 * ANSI escape code regex pattern.
 * Matches all ANSI escape sequences used for terminal colors and formatting.
 */
const ANSI_REGEX = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

/**
 * Strip ANSI escape codes from a string.
 * This removes color codes added by winston.format.colorize() and similar formatters.
 */
function stripAnsi(str) {
  return str.replace(ANSI_REGEX, '');
}

/**
 * Safely stringify an object, handling circular references.
 * Only true circular references (cycles in the current path) are replaced with "[Circular]".
 * Shared object references (same object at multiple locations) are preserved.
 * Also strips ANSI color codes from all string values.
 */
function safeStringify(obj) {
  const ancestors = [];
  return JSON.stringify(obj, function (_key, value) {
    // Strip ANSI codes from string values
    if (typeof value === 'string') {
      return stripAnsi(value);
    }
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    // `this` is the object containing the property being processed.
    // When we move to a sibling or go back up the tree, we need to
    // remove objects from ancestors that are no longer in our path.
    while (ancestors.length > 0 && ancestors[ancestors.length - 1] !== this) {
      ancestors.pop();
    }

    // Check if value is already an ancestor (true circular reference)
    if (ancestors.includes(value)) {
      return '[Circular]';
    }
    ancestors.push(value);
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