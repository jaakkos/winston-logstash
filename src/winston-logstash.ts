/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */
import * as stringifySafe from 'json-stringify-safe';
import * as net from 'net';
import {Socket} from 'net';
// import * as os from 'os';
import * as tls from 'tls';
import {TLSSocket} from 'tls';
import * as fs from 'fs';
import * as Transport from 'winston-transport';
import {LogstashTransportConfig} from './LogstashTransportConfig';
import {LogMessage} from './LogMessage';

const ECONNREFUSED_REGEXP = /ECONNREFUSED/;
const SOCKET_KEEP_ALIVE = 60 * 1000;

export class LogstashWinstonTransport extends Transport {
    private max_connect_retries: number;
    // private node_name: string;
    // private name: string;
    // private localhost: string;
    private timeout_connect_retries: number;
    private meta_defaults: any;
    private host: string;
    private port: number;
    // private pid: number;
    private retries: number;
    // private logstash: boolean;
    private rejectUnauthorized?: boolean;
    private ssl_enable: boolean;
    private ssl_key: string;
    private ssl_cert: string;
    private ca?: string[];
    private ssl_passphrase: string;
    private log_queue: any[];
    private connected: boolean;
    private socket: Socket | TLSSocket | null;
    private strip_colors: boolean;
    // private label: string;
    private connecting: boolean;
    private terminating: boolean;
    private tryReconnect: boolean;

    private static safeToString(json: any) {
        try {
            return JSON.stringify(json);
        } catch (ex) {
            return stringifySafe(json, null, null, () => {
            });
        }
    }

    constructor(options: LogstashTransportConfig) {
        super(options);
        options = options || {};

        // this.name = 'logstash';
        // this.localhost = options.localhost || os.hostname();
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 28777;
        // this.node_name = options.node_name || process.title;
        // this.pid = options.pid || process.pid;
        this.max_connect_retries = ('number' === typeof options.max_connect_retries) ? options.max_connect_retries:4;
        this.timeout_connect_retries = ('number' === typeof options.timeout_connect_retries) ? options.timeout_connect_retries:100;
        this.retries = -1;

        // Support for winston build in logstash format
        // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
        // this.logstash = options.logstash || false;

        // SSL Settings
        this.ssl_enable = options.ssl_enable || false;
        this.ssl_key = options.ssl_key || '';
        this.ssl_cert = options.ssl_cert || '';
        this.ca = options.ca || undefined;
        this.ssl_passphrase = options.ssl_passphrase || '';
        this.rejectUnauthorized = options.rejectUnauthorized === true;

        // Connection state
        this.log_queue = [];
        this.connected = false;
        this.socket = null;

        // Miscellaneous options
        this.strip_colors = options.strip_colors || false;
        // this.label = options.label || this.node_name;
        this.meta_defaults = options.meta || {};

        // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
        for (const property in this.meta_defaults) {
            if (typeof this.meta_defaults[property] === 'object') {
                delete this.meta_defaults[property];
            }
        }

        this.connect();

    }

    public connect() {
        this.tryReconnect = true;
        let options = {};
        this.retries++;
        this.connecting = true;
        this.terminating = false;
        if (this.ssl_enable) {
            options = {
                key: this.ssl_key ? fs.readFileSync(this.ssl_key):null,
                cert: this.ssl_cert ? fs.readFileSync(this.ssl_cert):null,
                passphrase: this.ssl_passphrase ? this.ssl_passphrase:null,
                rejectUnauthorized: this.rejectUnauthorized === true,
                ca: this.ca ? this._readCa():null
            };
            this.socket = tls.connect(this.port, this.host, options, () => {
                this.socket!.setEncoding('UTF-8');
                this._announce();
                this.connecting = false;
            });
        } else {
            this.socket = new net.Socket();
        }

        this.socket.on('error', (err) => {
            this.connecting = false;
            this.connected = false;

            if (typeof (this.socket) !== 'undefined' && this.socket != null) {
                this.socket.destroy();
            }

            this.socket = null;

            if (!ECONNREFUSED_REGEXP.test(err.message)) {
                this.tryReconnect = false;
                this.emit('error', err);
            }
        });

        this.socket.on('timeout', () => {
            if ((<any> this.socket).readyState !== 'open') {
                this.socket!.destroy();
            }
        });

        this.socket.on('connect', () => {
            this.retries = 0;
        });

        this.socket.on('close', () => {
            this.connected = false;

            if (this.terminating) {
                return;
            }

            if (!this.tryReconnect) {
                // todo do not reconnect probably same as max connect retries
            }

            if (this.max_connect_retries < 0 || this.retries < this.max_connect_retries) {
                if (!this.connecting) {
                    setTimeout(() => {
                        this.connect();
                    }, this.timeout_connect_retries);
                }
            } else {
                this.log_queue = [];
                this.silent = true;
                this.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
            }
        });

        if (!this.ssl_enable) {
            this.socket.connect(this.port, this.host, () => {
                this._announce();
                this.connecting = false;

                this.socket!.setKeepAlive(true, SOCKET_KEEP_ALIVE);
            });
        }

    }

    private _readCa() {
        return this.ca!.map((filePath: string) => fs.readFileSync(filePath));
        //
        // (caList) => {
        //     const caFilesList: any[] = [];
        //
        //     this.ca.forEach();
        //
        //     return caFilesList;
        // };
    }

    public close() {
        this.terminating = true;
        if (this.connected && this.socket) {
            this.connected = false;
            this.socket.end();
            this.socket.destroy();
            this.socket = null;
        }
    }

    private _announce() {
        this.connected = true;
        this.finish();
        if (this.terminating) {
            this.close();
        }
    }

    public sendLog(message: string, callback: () => void) {
        callback = callback || function() {
        };

        this.socket!.write(message + '\n');
        callback();
    }

    public getQueueLength() {
        return this.log_queue.length;
    }

    public finish() {

        for (let i = 0; i < this.log_queue.length; i++) {
            this.sendLog(this.log_queue[i].message, this.log_queue[i].callback);
        }
        this.log_queue.length = 0;
    }

    public log(info: LogMessage, callback: (err: any, success: boolean) => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });
        let {level, message, ...messageMeta} = info;

        const meta = {...messageMeta, ...this.meta_defaults};

        for (const property in this.meta_defaults) {
            meta[property] = this.meta_defaults[property];
        }

        if (this.silent) {
            return callback(null, true);
        }

        if (this.strip_colors) {
            // message = message.stripColors;

            // Let's get rid of colors on our meta properties too.
            if (typeof meta === 'object') {
                for (const property in meta) {
                    meta[property] = meta[property].stripColors;
                }
            }
        }

        const log_entry = LogstashWinstonTransport.safeToString({...info, ...meta});// this.transform(level, message, meta);

        if (!this.connected) {
            this.log_queue.push({
                message: log_entry,
                callback: () => {
                    this.emit('logged');
                    callback(null, true);
                }
            });
        } else {
            this.sendLog(log_entry, () => {
                this.emit('logged');
                callback(null, true);
            });
        }
    }

}

module.exports = LogstashWinstonTransport;
