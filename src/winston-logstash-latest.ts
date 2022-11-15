import Transport from "winston-transport";
import { Manager } from './manager';
import { LogstashTransportOptions } from "./types";

//
// Inherit from `winston-transport` so you can take advantage
// of the base functionality and `.exceptions.handle()`.
//
module.exports = class LogstashTransport extends Transport {
  private manager: Manager;
  public name: string;
  constructor(options: LogstashTransportOptions) {
    super(options);

    this.name = 'logstash';

    this.manager = new Manager(options);
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
    this.manager.log(JSON.stringify(info), () => {
      callback();
    });
  }

  close() {
    this.manager.close();
  }
};
