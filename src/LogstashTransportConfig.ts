import {TransportStreamOptions} from 'winston-transport';

export interface LogstashTransportConfig extends TransportStreamOptions {
    label?: string;
    ca?: string[];
    meta?: {};
    strip_colors?: boolean;
    rejectUnauthorized?: boolean;
    ssl_passphrase?: string;
    ssl_cert?: string;
    ssl_key?: string;
    ssl_enable?: boolean;
    logstash?: boolean;
    timeout_connect_retries?: number | string;
    max_connect_retries?: number | string;
    pid?: number;
    node_name?: string;
    port?: number;
    host?: string;
    localhost?: string;

}
