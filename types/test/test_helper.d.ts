/// <reference types="node" />
/// <reference types="node" />
import net from 'net';
import tls from 'tls';
import { LoggerInstance } from 'winston';
export declare const sslFilePath: (filename: string) => string;
export declare function createTestServer(port: number, onData: Function): net.Server;
export declare function createTestServerWithRestart(port: number, onData: Function): net.Server;
export declare function createTestSecureServer(port: number, options: {
    serverKey?: string;
    serverCert?: string;
    verify?: boolean;
}, onData: Function): tls.Server;
export declare function setup(timekeeper: any): Promise<Boolean>;
export declare function tearDown(logger: LoggerInstance, timekeeper: any, testServer: net.Server | tls.Server): Promise<Boolean>;
