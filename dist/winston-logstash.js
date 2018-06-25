'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _typeof = typeof Symbol === "function" && typeof Symbol.iterator === "symbol" ? function (obj) { return typeof obj; } : function (obj) { return obj && typeof Symbol === "function" && obj.constructor === Symbol && obj !== Symbol.prototype ? "symbol" : typeof obj; };

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _net = require('net');

var _os = require('os');

var _tls = require('tls');

var _fs = require('fs');

var _winston = require('winston');

var _winstonTransport = require('winston-transport');

var _winstonTransport2 = _interopRequireDefault(_winstonTransport);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _possibleConstructorReturn(self, call) { if (!self) { throw new ReferenceError("this hasn't been initialised - super() hasn't been called"); } return call && (typeof call === "object" || typeof call === "function") ? call : self; }

function _inherits(subClass, superClass) { if (typeof superClass !== "function" && superClass !== null) { throw new TypeError("Super expression must either be null or a function, not " + typeof superClass); } subClass.prototype = Object.create(superClass && superClass.prototype, { constructor: { value: subClass, enumerable: false, writable: true, configurable: true } }); if (superClass) Object.setPrototypeOf ? Object.setPrototypeOf(subClass, superClass) : subClass.__proto__ = superClass; } /*
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * (C) 2013 Jaakko Suutarla
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                * MIT LICENCE
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                */

var ECONNREFUSED_REGEXP = /ECONNREFUSED/;

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//

var CustomTransport = function (_Transport) {
  _inherits(CustomTransport, _Transport);

  function CustomTransport(options) {
    _classCallCheck(this, CustomTransport);

    var _this = _possibleConstructorReturn(this, (CustomTransport.__proto__ || Object.getPrototypeOf(CustomTransport)).call(this, options));

    _this.localhost = options.localhost || (0, _os.hostname)();
    _this.host = options.host || '127.0.0.1';
    _this.port = options.port || 28777;
    _this.node_name = options.node_name || process.title;
    _this.pid = options.pid || process.pid;
    _this.max_connect_retries = typeof options.max_connect_retries === 'number' ? options.max_connect_retries : 4;
    _this.timeout_connect_retries = typeof options.timeout_connect_retries === 'number' ? options.timeout_connect_retries : 100;
    _this.retries = -1;

    // SSL Settings
    _this.ssl_enable = options.ssl_enable || false;
    _this.ssl_key = options.ssl_key || '';
    _this.ssl_cert = options.ssl_cert || '';
    _this.ca = options.ca || '';
    _this.ssl_passphrase = options.ssl_passphrase || '';
    _this.rejectUnauthorized = options.rejectUnauthorized === true;

    // Connection state
    _this.log_queue = [];
    _this.connected = false;
    _this.socket = null;

    _this.connect();

    // Miscellaneous options
    _this.meta_defaults = Object.assign({ label: options.label || _this.node_name }, options.meta);
    // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
    for (var property in _this.meta_defaults) {
      if (_typeof(_this.meta_defaults[property]) === 'object') {
        delete _this.meta_defaults[property];
      }
    }
    return _this;
  }

  _createClass(CustomTransport, [{
    key: 'connect',
    value: function connect() {
      var _this2 = this;

      var options = {};
      this.retries++;
      this.connecting = true;
      this.terminating = false;
      if (this.ssl_enable) {
        options = {
          key: this.ssl_key ? (0, _fs.readFileSync)(this.ssl_key) : null,
          cert: this.ssl_cert ? (0, _fs.readFileSync)(this.ssl_cert) : null,
          passphrase: this.ssl_passphrase ? this.ssl_passphrase : null,
          rejectUnauthorized: this.rejectUnauthorized === true,
          ca: this.ca ? function (caList) {
            var caFilesList = [];

            caList.forEach(function (filePath) {
              caFilesList.push((0, _fs.readFileSync)(filePath));
            });

            return caFilesList;
          }(this.ca) : null
        };
        this.socket = new _tls.connect(this.port, this.host, options, function () {
          _this2.socket.setEncoding('utf8');
          _this2.announce();
          _this2.connecting = false;
        });
      } else {
        this.socket = new _net.Socket();
        this.socket.connect(this.port, this.host, function () {
          _this2.announce();
          _this2.connecting = false;
          _this2.socket.setKeepAlive(true, 60 * 1000);
        });
      }

      this.socket.setTimeout(3000);

      this.socket.on('error', function (err) {
        _this2.connecting = false;
        _this2.connected = false;

        if (typeof _this2.socket !== 'undefined' && _this2.socket != null) {
          _this2.socket.destroy();
        }

        _this2.socket = null;

        if (!ECONNREFUSED_REGEXP.test(err.message)) {
          _this2.emit('error', err);
        }
      });

      this.socket.on('timeout', function () {
        if (_this2.socket.readyState !== 'open') {
          _this2.socket.destroy();
        }
      });

      this.socket.on('connect', function () {
        _this2.retries = 0;
      });

      this.socket.on('close', function (hadError) {
        _this2.connected = false;

        if (_this2.terminating) {
          return;
        }

        if (_this2.max_connect_retries < 0 || _this2.retries < _this2.max_connect_retries) {
          if (!_this2.connecting) {
            setTimeout(function () {
              _this2.connect();
            }, _this2.timeout_connect_retries);
          }
        } else {
          _this2.log_queue = [];
          _this2.silent = true;
          _this2.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
        }
      });
    }
  }, {
    key: 'close',
    value: function close() {
      this.terminating = true;
      if (this.connected && this.socket) {
        this.connected = false;
        this.socket.end();
        this.socket.destroy();
        this.socket = null;
      }
    }
  }, {
    key: 'log',
    value: function log(info, _callback) {
      var _this3 = this;

      for (var property in this.meta_defaults) {
        info[property] = this.meta_defaults[property];
      }

      // Stringify before writing to socket.
      info = JSON.stringify(info);

      if (!this.connected) {
        this.log_queue.push({
          message: info,
          callback: function callback() {
            _this3.emit('logged', info);
            if (_callback) _callback(null, true);
          }
        });
      } else {
        this.sendLog(info, function () {
          _this3.emit('logged', info);
          if (_callback) _callback(null, true);
        });
      }
    }
  }, {
    key: 'sendLog',
    value: function sendLog(message, callback) {
      var res = this.socket.write(message + '\n');

      if (callback) {
        if (!res) {
          this.socket.once('drain', callback);
        } else {
          process.nextTick(callback);
        }
      }
    }
  }, {
    key: 'announce',
    value: function announce() {
      this.connected = true;
      this.flush();
      if (this.terminating) {
        this.close();
      }
    }
  }, {
    key: 'flush',
    value: function flush() {
      for (var i = 0; i < this.log_queue.length; i++) {
        this.sendLog(this.log_queue[i].message, this.log_queue[i].callback);
      }
      this.log_queue.length = 0;
    }
  }, {
    key: 'getQueueLength',
    value: function getQueueLength() {
      return this.log_queue.length;
    }
  }]);

  return CustomTransport;
}(_winstonTransport2.default);

exports.default = CustomTransport;