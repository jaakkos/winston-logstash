/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import Transport from "winston-transport";
import { Manager } from './manager';
import { LogstashTransportOptions } from "./types";
import { IConnection, PlainConnection, SecureConnection } from "./connection";

/**
 * Safely stringify an object, handling circular references.
 * Circular references are replaced with "[Circular]".
 */
function safeStringify(obj: any): string {
  const seen = new WeakSet();
  return JSON.stringify(obj, (_key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) {
        return '[Circular]';
      }
      seen.add(value);
    }
    return value;
  });
}

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
class LogstashTransport extends Transport {
  private manager: Manager;
  private connection: IConnection;
  public name: string;
  constructor(options: LogstashTransportOptions) {
    super(options);

    this.name = 'logstash';

    this.connection = options.ssl_enable ? new SecureConnection(options) : new PlainConnection(options);
    this.manager = new Manager(options, this.connection);
    this.manager.on('error', this.onError.bind(this));
    this.manager.start();
  }

  onError(error: Error) {
    this.silent = true;
    this.emit('error', error);
  }

  log(info: any, callback: Function) {
    setImmediate(() => {
      this.emit('logged', info);
    });

    // Perform the writing to the remote service
    // Use safeStringify to handle circular references (e.g., Axios errors)
    this.manager.log(safeStringify(info), callback);
  }

  close() {
    this.manager.close();
  }
}

export = LogstashTransport;
