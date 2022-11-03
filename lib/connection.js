const net = require('net');
const fs = require('fs');
const tls = require('tls');

const ECONNREFUSED_REGEXP = /ECONNREFUSED/;

/**
 * Represents a connection to Logstash.
 * @constructor
 * @param {object} options
 * @param {function} onErrorHook
 */
function Connection(options, onErrorHook) {
  this.onErrorHook = onErrorHook;
  this.host = options.host || '127.0.0.1';
  this.port = options.port || 28777;

  // Connection state flags
  this.connecting = false;
  this.terminating = false;
  this.connected = false;

  // Connection retry attributes
  this.tryReconnect = true;
  this.retries = -1;
  this.max_connect_retries =
    ('number' === typeof options.max_connect_retries) ?
      options.max_connect_retries : 4;
  this.timeout_connect_retries =
    ('number' === typeof options.timeout_connect_retries) ?
      options.timeout_connect_retries : 100;

  // SSL Settings
  this.ssl_enable = options.ssl_enable || false;
  this.secureContextOptions = this.ssl_enable ?
    Connection.createSecureContextOptions(options) : null;
}

Connection.createSecureContextOptions = function(options) {
  const sslKey = options.ssl_key || '';
  const sslCert = options.ssl_cert || '';
  const ca = options.ca || '';
  const sslPassphrase = options.ssl_passphrase || '';
  const rejectUnauthorized = options.rejectUnauthorized === true;

  const secureContextOptions = {
    key: sslKey ? fs.readFileSync(sslKey) : null,
    cert: sslCert ? fs.readFileSync(sslCert) : null,
    passphrase: sslPassphrase ? sslPassphrase : null,
    rejectUnauthorized: rejectUnauthorized === true,
    ca: ca ? (function(caList) {
      const caFilesList = [];

      caList.forEach(function(filePath) {
        caFilesList.push(fs.readFileSync(filePath));
      });

      return caFilesList;
    }(ca)) : null,
  };

  return secureContextOptions;
};

Connection.prototype.socketOnError = function(error) {
  this.connecting = false;
  this.connected = false;

  if (typeof (this.socket) !== 'undefined' && this.socket != null) {
    this.socket.destroy();
    this.socket = null;
  }

  if (!ECONNREFUSED_REGEXP.test(error.message)) {
    this.tryReconnect = false;
    this.onErrorHook(error);
  }
};

Connection.prototype.socketOnTimeout = function() {
  if (this.socket.readyState !== 'open') {
    this.socket.destroy();
  }
};

Connection.prototype.socketOnSecureConnect = function() {
  //
};

Connection.prototype.socketOnConnect = function() {
  this.retries = 0;
};

Connection.prototype.socketOnClose = function(error) {
  this.connected = false;

  if (this.terminating) {
    return;
  }

  if (this.max_connect_retries < 0 || this.retries < this.max_connect_retries) {
    if (!this.connecting) {
      setTimeout(function() {
        this.connect();
      }.bind(this), this.timeout_connect_retries);
    }
  } else {
    this.silent = true;
    this.onErrorHook(
        new Error('Max retries reached, transport in silent mode, OFFLINE'));
  }
};

Connection.prototype.bindEventListeners = function(socket) {
  socket.on('error', this.socketOnError.bind(this));
  socket.on('timeout', this.socketOnTimeout.bind(this));
  socket.on('connect', this.socketOnConnect.bind(this));
  socket.on('secureConnect', this.socketOnSecureConnect.bind(this));
  socket.on('close', this.socketOnClose.bind(this));
};

Connection.prototype.onConnected = function() {
  this.connecting = false;
  this.connected = true;
  this.socket.setKeepAlive(true, 60 * 1000);
  this.actionOnConnect();
};

Connection.prototype.connect = function(onConnection) {
  this.retries++;
  this.connecting = true;
  this.terminating = false;
  this.actionOnConnect = onConnection || function() { };

  if (this.ssl_enable) {
    this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions,
        this.onConnected.bind(this));
  } else {
    this.socket = new net.Socket();
    this.socket.connect(this.port, this.host, this.onConnected.bind(this));
  }

  this.bindEventListeners(this.socket);
};

Connection.prototype.close = function() {
  this.terminating = true;
  if (this.connected && this.socket) {
    this.socket.end();
    this.socket.destroy();
    this.socket = null;
    this.connected = false;
  }
};

Connection.prototype.send = function(message) {
  this.socket.write(message + '\n');
};

module.exports = Connection;
