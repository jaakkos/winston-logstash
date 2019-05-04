/*
 *
 * (C) 2013 Jaakko Suutarla
 * MIT LICENCE
 *
 */
import * as stringifySafe from 'json-stringify-safe';
import * as net from 'net';
import * as tls from 'tls';
import * as fs from 'fs';
import * as Transport from 'winston-transport';
import {LogstashTransportConfig} from './LogstashTransportConfig';
import {LogMessage} from './LogMessage';
import * as winston from 'winston';

const {format} = winston;
const {uncolorize} = format;
const ECONNREFUSED_REGEXP = /ECONNREFUSED/;
const SOCKET_KEEP_ALIVE = 60 * 1000;

export default class LogstashWinstonTransport extends Transport {

    private static safeToString(json: any) {
        try {
            return JSON.stringify(json);
        } catch (ex) {
            return stringifySafe(json, null, null, () => {
                return;
            });
        }
    }

    private maxConnectRetries: number;
    // private node_name: string;
    // private name: string;
    // private localhost: string;
    private timeoutConnectRetries: number;
    private metaDefaults: any;
    private host: string;
    private port: number;
    // private pid: number;
    private retries: number;
    // private logstash: boolean;
    private rejectUnauthorized?: boolean;
    private sslEnable: boolean;
    private sslKey: string;
    private sslCert: string;
    private ca?: string[];
    private sslPassphrase: string;
    private logQueue: any[];
    private connected: boolean;
    private socket: net.Socket | tls.TLSSocket | null;
    private stripColors: boolean;
    // private label: string;
    private connecting: boolean;
    private terminating: boolean;
    private tryReconnect: boolean;

    constructor(options: LogstashTransportConfig) {
        super(options);
        options = options || {};

        // this.name = 'logstash';
        // this.localhost = options.localhost || os.hostname();
        this.host = options.host || '127.0.0.1';
        this.port = options.port || 28777;
        // this.node_name = options.node_name || process.title;
        // this.pid = options.pid || process.pid;
        this.maxConnectRetries = ('number' === typeof options.max_connect_retries) ? options.max_connect_retries :4;
        this.timeoutConnectRetries = ('number' === typeof options.timeout_connect_retries) ?
                options.timeout_connect_retries :100;
        this.retries = -1;

        // Support for winston build in logstash format
        // https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149
        // this.logstash = options.logstash || false;

        // SSL Settings
        this.sslEnable = options.ssl_enable || false;
        this.sslKey = options.ssl_key || '';
        this.sslCert = options.ssl_cert || '';
        this.ca = options.ca || undefined;
        this.sslPassphrase = options.ssl_passphrase || '';
        this.rejectUnauthorized = options.rejectUnauthorized === true;

        // Connection state
        this.logQueue = [];
        this.connected = false;
        this.socket = null;

        // Miscellaneous options
        this.stripColors = options.strip_colors || false;
        // this.label = options.label || this.node_name;
        this.metaDefaults = options.meta || {};

        // We want to avoid copy-by-reference for meta defaults, so make sure it's a flat object.
        for (const property in this.metaDefaults) {
            if (typeof this.metaDefaults[property] === 'object') {
                delete this.metaDefaults[property];
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
        if (this.sslEnable) {
            options = {
                ca: this.ca ? this._readCa() : null,
                cert: this.sslCert ? fs.readFileSync(this.sslCert) :null,
                key: this.sslKey ? fs.readFileSync(this.sslKey) :null,
                passphrase: this.sslPassphrase ? this.sslPassphrase :null,
                rejectUnauthorized: this.rejectUnauthorized === true
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

            if (this.maxConnectRetries < 0 || this.retries < this.maxConnectRetries) {
                if (!this.connecting) {
                    setTimeout(() => {
                        this.connect();
                    }, this.timeoutConnectRetries);
                }
            } else {
                this.logQueue = [];
                this.silent = true;
                this.emit('error', new Error('Max retries reached, transport in silent mode, OFFLINE'));
            }
        });

        if (!this.sslEnable) {
            this.socket.connect(this.port, this.host, () => {
                this._announce();
                this.connecting = false;

                this.socket!.setKeepAlive(true, SOCKET_KEEP_ALIVE);
            });
        }

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

    public sendLog(message: string, callback: () => void = () => {
        return;
    }) {
        this.socket!.write(message + '\n');
        callback();
    }

    public getQueueLength() {
        return this.logQueue.length;
    }

    public finish() {
        //
        // for (let i = 0; i < this.logQueue.length; i++) {
        //     this.sendLog(this.logQueue[i].message, this.logQueue[i].callback);
        // }
        this.logQueue.forEach((pendingLogData) => {
            this.sendLog(pendingLogData.message, pendingLogData.callback);
        });
        this.logQueue = [];
    }

    public log(info: LogMessage, callback: (err: any, success: boolean) => void) {
        setImmediate(() => {
            this.emit('logged', info);
        });
        const {level, message, ...messageMeta} = info;

        const meta = {...messageMeta, ...this.metaDefaults};

        // for (const property in this.metaDefaults) {
        //     meta[property] = this.metaDefaults[property];
        // }

        if (this.silent) {
            return callback(null, true);
        }

        if (this.stripColors) {
            // message = message.stripColors;

            // Let's get rid of colors on our meta properties too.
            if (typeof meta === 'object') {
                Object.keys(meta).forEach((property: string) => {
                    meta[property] = uncolorize(meta[property]);
                });
            }
        }

        const logEntry = LogstashWinstonTransport.safeToString({...info, ...meta});

        if (!this.connected) {
            this.logQueue.push({
                callback: () => {
                    this.emit('logged');
                    callback(null, true);
                },
                message: logEntry
            });
        } else {
            this.sendLog(logEntry, () => {
                this.emit('logged');
                callback(null, true);
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

    private _announce() {
        this.connected = true;
        this.finish();
        if (this.terminating) {
            this.close();
        }
    }

}
