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

var ECONNREFUSED_REGEXP = /ECONNREFUSED/;

var Logstash = exports.Logstash = function (options) {
  winston.Transport.call(this, options);
  options = options || {};

  this.name                = 'logstash';
  this.localhost           = options.localhost || os.hostname();
  this.host                = options.host || '127.0.0.1';
  this.port                = options.port || 28777;
  this.node_name           = options.node_name || process.title;
  this.pid                 = options.pid || process.pid;
  this.retries             = -1;

  // Retry logic
  this.max_connect_retries = ('number' === typeof options.max_connect_retries) ? options.max_connect_retries : 4;
  this.retryInterval       = options.retryInterval || 100;
  this.fibonacci_backoff   = options.fibonacci_backoff || false;
  this.flat_retry_interval = options.flat_retry_interval || 10000;
  this.flat_retry_threshold = ('number' === typeof options.flat_retry_threshold) ? options.flat_retry_threshold : -1;

  // prevent the pending queue from getting too long. -1 means no limit.
  this.max_queue_length    = ('number' === typeof options.max_queue_length) ? option.max_queue_length : -1;

  // Support for winston build in logstash format
  // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
  this.logstash            = options.logstash || false;

  // SSL Settings
  this.ssl_enable          = options.ssl_enable || false;
  this.ssl_key             = options.ssl_key || '';
  this.ssl_cert            = options.ssl_cert || '';
  this.ca                  = options.ca || '';
  this.ssl_passphrase      = options.ssl_passphrase || '';

  // Connection state
  this.log_queue           = [];
  this.connected           = false;
  this.socket              = null;

  // Miscellaneous options
  this.strip_colors        = options.strip_colors || false;
  this.label               = options.label || this.node_name;
  this.meta_defaults       = options.meta || {};

  // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
  for (var property in this.meta_defaults) {
    if (typeof this.meta_defaults[property] === 'object') {
      delete this.meta_defaults[property];
    }
  }

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

Logstash.prototype.name = 'logstash';

Logstash.prototype.log = function (level, msg, meta, callback) {
  var self = this,
      meta = winston.clone(meta || {}),
      log_entry;

  for (var property in this.meta_defaults) {
    meta[property] = this.meta_defaults[property];
  }

  if (self.silent) {
    return callback(null, true);
  }

  if (self.strip_colors) {
    msg = msg.stripColors;

    // Let's get rid of colors on our meta properties too.
    if (typeof meta === 'object') {
      for (var property in meta) {
        meta[property] = meta[property].stripColors;
      }
    }
  }

  log_entry = common.log({
    level: level,
    message: msg,
    node_name: this.node_name,
    meta: meta,
    timestamp: self.timestamp,
    json: true,
    label: this.label
  });

  if (!self.connected) {
    if ( self.max_queue_length < 0 || self.log_queue.length < self.max_queue_length ) {
      self.log_queue.push({
        message: log_entry,
        callback: function () {
          self.emit('logged');
          callback(null, true);
        }
      });
    }

  } else {
    self.sendLog(log_entry, function () {
      self.emit('logged');
      callback(null, true);
    });
  }
};

Logstash.prototype.connect = function () {

  if ( this.connecting ) {
    return;
  }
  if ( this.connected ) {
    return;
  }

  var tryReconnect = true;    // todo: this is never checked/user
  var options = {};
  var self = this;
  this.retries++;
  this.connecting = true;
  if (this.ssl_enable) {
    options = {
      key: this.ssl_key ? fs.readFileSync(this.ssl_key) : null,
      cert: this.ssl_cert ? fs.readFileSync(this.ssl_cert) : null,
      passphrase: this.ssl_passphrase ? this.ssl_passphrase : null,
      ca: this.ca ? (function (caList) {
        var caFilesList = [];

        caList.forEach(function (filePath) {
          caFilesList.push(fs.readFileSync(filePath));
        });

        return caFilesList;
      }(this.ca)) : null
    };
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

    if (typeof(self.socket) !== 'undefined' && self.socket != null) {
      self.socket.destroy();
    }

    self.socket = null;

    if (!ECONNREFUSED_REGEXP.test(err.message)) {
      tryReconnect = false;
      self.emit('error', err);
    }
  });

  this.socket.on('timeout', function() {
    if (self.socket.readyState !== 'open') {
      self.socket.destroy();
    }
  });

  this.socket.on('connect', function () {
    self.retries = 0;
  });

  this.socket.on('close', function (had_error) {
    self.connected = false;

    if (self.max_connect_retries < 0 || self.retries < self.max_connect_retries) {
      if (!self.connecting) {

        var delay = self.reconnectInterval();

        setTimeout(function () {
          self.connect();
        }, delay );
      }
    } else {
      self.log_queue = [];
      self.silent = true;
      self.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
    }
  });

  if (!this.ssl_enable) {
    this.socket.connect(self.port, self.host, function () {
      self.announce();
      self.connecting = false;
    });
  }

};

// Returns how long to wait before retrying again.
Logstash.prototype.reconnectInterval = function () {

  if ( this.flat_retry_threshold >= 0 && this.retries >= this.flat_retry_threshold ) {
    return this.flat_retry_interval;
  }

  if ( this.fibonacci_backoff ) {
    return fib(this.retries) * this.retryInterval;
  }
  return this.retryInterval;
}

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

/**
Helper functions.
*/

// simple fibonacci function. zero-indexed.
var fib = function(numMax){
    for(i=0,j=1,k=0; k<numMax;i=j,j=x,k++ ){
        x=i+j;
        if ( k == numMax-1 ) {
          return x;
        }
    }
    return 1;
}
