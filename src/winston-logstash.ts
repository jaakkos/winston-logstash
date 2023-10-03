/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */
import {Transport} from "winston";
const common = require('winston/lib/winston/common');
import { Manager } from './manager';
import { LogstashOptions } from "./types";
import { IConnection, PlainConnection, SecureConnection } from "./connection";

export class Logstash extends Transport {
  private node_name: string
  private json: boolean = true
  private label: string
  private meta_defaults: object
  private manager: Manager
  private connection: IConnection;

  constructor(options: LogstashOptions) {
    super(options);
    this.name = 'logstash';
    this.node_name = options.node_name || process.title;

    // Miscellaneous options
    this.label = options.label || this.node_name;
    this.meta_defaults = Object.assign({}, options.meta);

    this.connection = options.ssl_enable ? new SecureConnection(options) : new PlainConnection(options);
    this.manager = new Manager(options, this.connection);
    this.manager.on('error', this.onError.bind(this));
    this.manager.start();
  }

  log(level: any, msg: string, meta: Object, callback: Function) {
    if (this.silent) {
      return callback(null, true);
    }

    const logEntry = this.defaultTransform(level,
        msg,
        Object.assign({}, meta, this.meta_defaults));

    this.manager.log(logEntry, () => {
      callback(null, true);
    });

    this.emit('logged');
  }

  onError(error: Error) {
    this.silent = true;
    this.emit('error', error);
  }

  close() {
    this.manager.close();
  }

  private defaultTransform(level: any, msg: string, meta: any): string {
    return common.log({
      level: level,
      message: msg,
      meta: meta,
      json: this.json,
      label: this.label,
      humanReadableUnhandledException: this.humanReadableUnhandledException,
    });
  };
}
