import { Transport } from "winston";
import { LogstashTransportOptions } from "./types";
export declare class Logstash extends Transport {
    private node_name;
    private json;
    private label;
    private meta_defaults;
    private manager;
    private connection;
    constructor(options: LogstashTransportOptions);
    log(level: any, msg: string, meta: Object, callback: Function): any;
    onError(error: Error): void;
    close(): void;
    private defaultTransform;
}
