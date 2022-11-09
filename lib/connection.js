/* eslint-disable require-jsdoc */
const net = require('net');
const fs = require('fs');
const tls = require('tls');

/**
 * Represents a connection to Logstash.
 * @constructor
 * @param {object} options
 * @param {object} manager
 */
class Connection {
  constructor(options, manager) {
    this.manager = manager;
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28777;
  }

  socketOnError(error) {
    this.manager.emit('connection:error', error);
  }

  socketOnTimeout() {
    this.manager.emit('connection:timeout', this.socket.readyState);
  }

  socketOnConnect() {
    this.socket.setKeepAlive(true, 60 * 1000);
    this.manager.emit('connection:connected');
  }

  socketOnClose(error) {
    this.manager.emit('connection:closed', error);
  }

  addEventListeners(socket) {
    socket.once('error', this.socketOnError.bind(this));
    socket.once('timeout', this.socketOnTimeout.bind(this));
    socket.once('close', this.socketOnClose.bind(this));
  }

  close() {
    this.socket.removeAllListeners();
    this.socket.destroy();
    this.manager.emit('connection:closed');
    this.socket = null;
  }

  send(message) {
    this.socket.write(message);
  }

  readyToSend() {
    return this.socket && this.socket.readyState === 'open';
  }
}

class PlainConnection extends Connection {
  connect() {
    this.socket = new net.Socket();
    this.socket.connect(this.port, this.host);
    super.addEventListeners(this.socket);
    this.socket.on('connect', super.socketOnConnect.bind(this));
  }
}

class SecureConnection extends Connection {
  constructor(options, manager) {
    super(options, manager);
    this.secureContextOptions =
      SecureConnection.createSecureContextOptions(options);
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

  connect() {
    this.socket = tls.connect(this.port,
        this.host,
        this.secureContextOptions);
    super.addEventListeners(this.socket);
    this.socket.on('secureConnect', super.socketOnConnect.bind(this));
  }
}

module.exports = {SecureConnection, PlainConnection};
