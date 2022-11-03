/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

const util = require('util');
const os = require('os');
const winston = require('winston');
const defaultTransform = require('./default-transform');
const Connection = require('./connection');

const Logstash = exports.Logstash = function(options) {
  winston.Transport.call(this, options);
  options = options || {};

  this.name = 'logstash';
  this.localhost = options.localhost || os.hostname();
  this.host = options.host || '127.0.0.1';
  this.port = options.port || 28777;
  this.node_name = options.node_name || process.title;
  this.pid = options.pid || process.pid;

  // Support for winston build in logstash format
  // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
  this.logstash = options.logstash || false;

  // Miscellaneous options
  this.strip_colors = options.strip_colors || false;
  this.label = options.label || this.node_name;
  this.meta_defaults = options.meta || {};
  this.transform = options.transform || defaultTransform;

  // We want to avoid copy-by-reference for meta defaults,
  // so make sure it's a flat object.
  for (const property in this.meta_defaults) {
    if (typeof this.meta_defaults[property] === 'object') {
      delete this.meta_defaults[property];
    }
  }

  // TCP Connection state and buffer
  this.log_queue = [];
  this.silent = false;
  this.connection = new Connection(options, this.clientOnError.bind(this));
  this.connection.connect(this.flush.bind(this));
};

//
// Inherit from `winston.Transport`.
//
util.inherits(Logstash, winston.Transport);

//
// Define a getter so that `winston.transports.Syslog`
// is available and thus backwards compatible.
//
winston.transports.Logstash = Logstash;

Logstash.prototype.name = 'logstash';

Logstash.prototype.log = function(level, msg, orginalMeta, callback) {
  const self = this;
  const meta = winston.clone(orginalMeta || {});

  // eslint-disable-next-line guard-for-in
  for (property in this.meta_defaults) {
    meta[property] = this.meta_defaults[property];
  }

  if (this.silent) {
    return callback(null, true);
  }

  if (this.strip_colors) {
    msg = msg.stripColors;

    // Let's get rid of colors on our meta properties too.
    if (typeof meta === 'object') {
      // eslint-disable-next-line guard-for-in
      for (property in meta) {
        meta[property] = meta[property].stripColors;
      }
    }
  }

  const logEntry = this.transform(level, msg, meta, this);

  if (this.connection.connected) {
    this.sendLog(logEntry, function() {
      self.emit('logged');
      callback(null, true);
    });
  } else {
    this.log_queue.push({
      message: logEntry,
      callback: function() {
        self.emit('logged');
        callback(null, true);
      },
    });
  }
};

Logstash.prototype.close = function() {
  this.flush();
  this.connection.close();
};

Logstash.prototype.flush = function() {
  for (let i = 0; i < this.log_queue.length; i++) {
    this.sendLog(this.log_queue[i].message, this.log_queue[i].callback);
  }
  this.log_queue.length = 0;
};

Logstash.prototype.sendLog = function(message, callback) {
  callback = callback || function() { };

  this.connection.send(message);
  callback();
};

Logstash.prototype.getQueueLength = function() {
  return this.log_queue.length;
};

Logstash.prototype.clientOnError = function(error) {
  this.silent = true;
  this.emit('error', error);
};
