/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import { Socket } from 'net'
import { hostname } from 'os'
import { connect as _connect } from 'tls'
import { readFileSync } from 'fs'
import { format } from 'winston'
import Transport from 'winston-transport'

const ECONNREFUSED_REGEXP = /ECONNREFUSED/

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
export default class CustomTransport extends Transport {
  constructor (options) {
    super(options)

    this.localhost = options.localhost || hostname()
    this.host = options.host || '127.0.0.1'
    this.port = options.port || 28777
    this.node_name = options.node_name || process.title
    this.pid = options.pid || process.pid
    this.max_connect_retries = (typeof options.max_connect_retries === 'number') ? options.max_connect_retries : 4
    this.timeout_connect_retries = (typeof options.timeout_connect_retries === 'number') ? options.timeout_connect_retries : 100
    this.retries = -1

    // SSL Settings
    this.ssl_enable = options.ssl_enable || false
    this.ssl_key = options.ssl_key || ''
    this.ssl_cert = options.ssl_cert || ''
    this.ca = options.ca || ''
    this.ssl_passphrase = options.ssl_passphrase || ''
    this.rejectUnauthorized = options.rejectUnauthorized === true

    // Connection state
    this.log_queue = []
    this.connected = false
    this.socket = null

    this.connect()

    // Miscellaneous options
    this.meta_defaults = Object.assign({label: options.label || this.node_name}, options.meta)
    // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
    for (let property in this.meta_defaults) {
      if (typeof this.meta_defaults[property] === 'object') {
        delete this.meta_defaults[property]
      }
    }
  }

  connect () {
    let options = {}
    this.retries++
    this.connecting = true
    this.terminating = false
    if (this.ssl_enable) {
      options = {
        key: this.ssl_key ? readFileSync(this.ssl_key) : null,
        cert: this.ssl_cert ? readFileSync(this.ssl_cert) : null,
        passphrase: this.ssl_passphrase ? this.ssl_passphrase : null,
        rejectUnauthorized: this.rejectUnauthorized === true,
        ca: this.ca ? (function (caList) {
          const caFilesList = []

          caList.forEach(function (filePath) {
            caFilesList.push(readFileSync(filePath))
          })

          return caFilesList
        }(this.ca)) : null
      }
      this.socket = new _connect(this.port, this.host, options, () => {
        this.socket.setEncoding('utf8')
        this.announce()
        this.connecting = false
      })
    } else {
      this.socket = new Socket()
      this.socket.connect(this.port, this.host, () => {
        this.announce()
        this.connecting = false
        this.socket.setKeepAlive(true, 60 * 1000)
      })
    }

    this.socket.setTimeout(3000)

    this.socket.on('error', (err) => {
      this.connecting = false
      this.connected = false

      if (typeof (this.socket) !== 'undefined' && this.socket != null) {
        this.socket.destroy()
      }

      this.socket = null

      if (!ECONNREFUSED_REGEXP.test(err.message)) {
        this.emit('error', err)
      }
    })

    this.socket.on('timeout', () => {
      if (this.socket.readyState !== 'open') {
        this.socket.destroy()
      }
    })

    this.socket.on('connect', () => {
      this.retries = 0
    })

    this.socket.on('close', (hadError) => {
      this.connected = false

      if (this.terminating) {
        return
      }

      if (this.max_connect_retries < 0 || this.retries < this.max_connect_retries) {
        if (!this.connecting) {
          setTimeout(() => {
            this.connect()
          }, this.timeout_connect_retries)
        }
      } else {
        this.log_queue = []
        this.silent = true
        this.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'))
      }
    })
  }

  close () {
    this.terminating = true
    if (this.connected && this.socket) {
      this.connected = false
      this.socket.end()
      this.socket.destroy()
      this.socket = null
    }
  }

  log (info, callback) {
    for (let property in this.meta_defaults) {
      info[property] = this.meta_defaults[property]
    }

    // Stringify before writing to socket.
    info = JSON.stringify(info)

    if (!this.connected) {
      this.log_queue.push({
        message: info,
        callback: () => {
          this.emit('logged', info)
          if (callback) callback(null, true)
        }
      })
    } else {
      this.sendLog(info, () => {
        this.emit('logged', info)
        if (callback) callback(null, true)
      })
    }
  }

  sendLog (message, callback) {
    const res = this.socket.write(message + '\n')

    if (callback) {
      if (!res) {
        this.socket.once('drain', callback)
      } else {
        process.nextTick(callback)
      }
    }
  }

  announce () {
    this.connected = true
    this.flush()
    if (this.terminating) {
      this.close()
    }
  }

  flush () {
    for (let i = 0; i < this.log_queue.length; i++) {
      this.sendLog(this.log_queue[i].message, this.log_queue[i].callback)
    }
    this.log_queue.length = 0
  }

  getQueueLength () {
    return this.log_queue.length
  }
}
