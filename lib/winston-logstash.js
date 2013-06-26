/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

var net = require('net'),
    util = require('util'),
    os = require('os'),
    tls = require('tls'),
    fs = require('fs'),
    winston = require('winston'),
    common = require('winston/lib/winston/common');

var Logstash = exports.Logstash = function (options) {
  winston.Transport.call(this, options);
  options = options || {};

  this.name                = 'logstash';
  this.localhost           = options.localhost || os.hostname();
  this.host                = options.host || '127.0.0.1';
  this.port                = options.port || 28777;
  this.node_name           = options.node_name || process.title;
  this.pid                 = options.pid || process.pid;
  this.max_connect_retries = options.max_connect_retries || 4;
  this.ssl_enable          = options.ssl_enable || false;
  this.ssl_key             = options.ssl_key || '';
  this.ssl_cert            = options.ssl_cert || '';
  this.ssl_passphrase      = options.ssl_passphrase || '';

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
  var options = {};
  var self = this;
  this.retries++;
  this.connecting = true;
  if (this.ssl_enable) {
    options = {
      key: this.ssl_key ? fs.readFileSync(this.ssl_key) : null,
      cert: this.ssl_cert ? fs.readFileSync(this.ssl_cert) : null,
      passphrase: this.ssl_passphrase ? this.ssl_passphrase : null
    }
    this.socket = new tls.connect(this.port, this.host, options, function() {
      self.socket.setEncoding('UTF-8');
      self.announce();
      self.connecting = false;
    });
  } else {
    this.socket = new net.Socket();
  }

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

    if (self.max_connect_retries === -1 || self.retries < self.max_connect_retries) {
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

  if (!this.ssl_enable) {
    this.socket.connect(self.port, self.host, function () {
      self.announce();
      self.connecting = false;
    });
  }

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

  self.socket.write(message + '\n');
  callback();
};
