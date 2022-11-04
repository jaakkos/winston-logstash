/* eslint-disable require-jsdoc */
/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

const os = require('os');
const winston = require('winston');
const defaultTransform = require('./default-transform');
const Manager = require('./manager');

class Logstash extends winston.Transport {
  constructor(options) {
    super(options);
    options = Object.assign({}, options);

    this.name = 'logstash';
    this.localhost = options.localhost || os.hostname();
    this.host = options.host || '127.0.0.1';
    this.port = options.port || 28777;
    this.node_name = options.node_name || process.title;
    this.pid = options.pid || process.pid;

    // Support for winston build in logstash format
    // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
    this.logstash = options.logstash || false;
    this.json = options.json || true;

    // Miscellaneous options
    this.strip_colors = options.strip_colors || false;
    this.label = options.label || this.node_name;
    this.meta_defaults = Object.assign({}, options.meta);
    this.transform = options.transform || defaultTransform;

    this.manager = new Manager(options, this.onError.bind(this));
    this.manager.start();
  }

  log(level, msg, meta, callback) {
    if (this.silent) {
      return callback(null, true);
    }

    const self = this;
    const logEntry = this.transform(level,
        msg,
        Object.assign({}, meta, this.meta_defaults),
        this);

    this.manager.log(logEntry, () => {
      self.emit('logged');
      callback(null, true);
    });
  }

  onError(error) {
    this.silent = true;
    this.emit('error', error);
  }

  close() {
    this.manager.close();
  }
}

//
// Define a getter so that `winston.transports.Syslog`
// is available and thus backwards compatible.
//
winston.transports.Logstash = Logstash;

Logstash.prototype.name = 'logstash';

exports.Logstash = Logstash;

