/* eslint-disable require-jsdoc */
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
class Connection {
  constructor(options, onErrorHook) {
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
  }

  socketOnError(error) {
    this.connecting = false;
    this.connected = false;

    if (typeof (this.socket) !== 'undefined' && this.socket != null) {
      this.socket.destroy();
    }

    if (!ECONNREFUSED_REGEXP.test(error.message)) {
      this.tryReconnect = false;
      this.onErrorHook(error);
    }
  }
  socketOnTimeout() {
    if (this.socket.readyState !== 'open') {
      this.socket.destroy();
    }
  }
  socketOnConnect() {
    this.retries = 0;
    this.connecting = false;
    this.connected = true;
    this.socket.setKeepAlive(true, 60 * 1000);
    this.actionOnConnect();
  }

  socketOnClose(error) {
    this.connected = false;

    if (this.terminating) {
      return;
    }

    if (this.max_connect_retries < 0 ||
      this.retries < this.max_connect_retries) {
      if (!this.connecting) {
        setTimeout(function() {
          this.connect();
        }.bind(this), this.timeout_connect_retries);
      }
    } else {
      this.onErrorHook(
          new Error('Max retries reached, transport in silent mode, OFFLINE'));
    }
  }
  bindCommonEventListeners(socket) {
    socket.on('error', this.socketOnError.bind(this));
    socket.on('timeout', this.socketOnTimeout.bind(this));
    socket.on('close', this.socketOnClose.bind(this));
  }

  connect(onConnection) {
    this.retries++;
    this.connecting = true;
    this.terminating = false;
    this.actionOnConnect = onConnection || function() { };
  }

  close() {
    this.terminating = true;
    if (this.socket) {
      this.socket.end();
      this.socket.destroy();
      this.connected = false;
    }
  }

  send(message) {
    this.socket.write(message);
  }

  readyToSend() {
    return this.socket && this.socket.readyState === 'open';
  }
}

class PlainConnection extends Connection {
  connect(onConnection) {
    super.connect(onConnection);
    this.socket = new net.Socket();
    this.socket.connect(this.port, this.host);
    super.bindCommonEventListeners(this.socket);
    this.socket.on('connect', super.socketOnConnect.bind(this));
  }
}

class SecureConnection extends Connection {
  constructor(options, onErrorHook) {
    super(options, onErrorHook);
    // SSL Settings
    this.ssl_enable = options.ssl_enable || false;
    this.secureContextOptions = this.ssl_enable ?
    SecureConnection.createSecureContextOptions(options) : null;
  }

  static createSecureContextOptions(options) {
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
  }

  connect(onConnection) {
    super.connect(onConnection);
    this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
    super.bindCommonEventListeners(this.socket);
    this.socket.on('secureConnect', super.socketOnConnect.bind(this));
  }
}

module.exports = {SecureConnection, PlainConnection};
