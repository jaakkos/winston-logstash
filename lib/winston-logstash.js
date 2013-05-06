/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

var net = require('net'),
    util = require('util'),
    os = require('os'),
    winston = require('winston'),
    common = require('winston/lib/winston/common');

var Logstash = exports.Logstash = function (options) {
  winston.Transport.call(this, options);
  options = options || {};

  this.name       = 'logstash';
  this.localhost  = options.localhost || os.hostname();
  this.host       = options.host || '127.0.0.1';
  this.port       = options.port || 28777;
  this.node_name  = options.node_name || process.title;
  this.pid        = options.pid || process.pid;

  // Connection state
  this.log_queue = [];
  this.connected = false;
  this.socket = null;
  this.retries = 0;

  this.connect();
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


Logstash.prototype.log = function (level, msg, meta, callback) {
  var self = this,
      meta = winston.clone(meta || {}),
      log_entry;

  if (self.silent) {
    return callback(null, true);
  }

  log_entry = common.log({
    level: level,
    message: msg,
    meta: meta,
    timestamp: self.timestamp,
    json: true
  });

  if (!self.connected) {
    self.log_queue.push({
      message: log_entry,
      callback: function () {
        self.emit('logged');
        callback(null, true);
      }
    });
  } else {
    self.sendLog(log_entry, function () {
      self.emit('logged');
      callback(null, true);
    });
  }
};

Logstash.prototype.connect = function () {
  this.retries++;
  this.connecting = true;
  this.socket = new net.Socket();
  var self = this;

  this.socket.on('error', function (err) {
    self.connecting = false;
    self.connected = false;
    self.socket.destroy();
    self.socket = null;
  });

  this.socket.on('timeout', function() {
    if (self.socket.readyState !== 'open') {
      self.socket.destroy();
    }
  });

  this.socket.on('close', function (had_error) {
    self.connected = false;

    if (self.retries < 4) {
      if (!self.connecting) {
        setTimeout(function () {
          self.connect();
        }, 100);
      }
    } else {
      self.log_queue = [];
      self.silent = true;
    }
  });


  this.socket.connect(self.port, self.host, function () {
    self.announce();
  });

};

Logstash.prototype.announce = function () {
  var self = this;
  self.connected = true;
  self.flush();
};

Logstash.prototype.flush = function () {
  var self = this;

  for (var i = 0; i < self.log_queue.length; i++) {
    self.sendLog(self.log_queue[i].message, self.log_queue[i].callback);
    self.emit('logged');
  }
  self.log_queue.length = 0;
};

Logstash.prototype.sendLog = function (message, callback) {
  var self = this;
  callback = callback || function () {};

  self.socket.write(message);
  callback();
};



















