import {LogstashTransportConfig} from '../src/LogstashTransportConfig';
import * as winston from 'winston';
import LogstashWinstonTransport from '../src/winston-logstash';
import * as net from 'net';

import * as chai from 'chai';
import * as timekeeper from 'timekeeper';
import * as fs from 'fs';
import * as tls from 'tls';

process.env.NODE_ENV = 'test';
const expect = chai.expect;
const freezedTime = new Date(1330688329321);

chai.config.includeStack = true;
const {createLogger, format} = winston;
const {combine, label, prettyPrint, errors, json} = format;

describe('winston-logstash transport', () => {

    function mergeObject(source: LogstashTransportConfig, target: LogstashTransportConfig) {
        // for (var attrName in source) {
        //     result[attrName] = source[attrName];
        // }
        //
        // for (var attrName in target) {
        //     result[attrName] = target[attrName];
        // }

        return {...source, ...target};
    }

    function createTestServer(port: number, dataCallback: (data: Blob) => void): net.Server {
        const server = net.createServer((socket: net.Socket) => {
            socket.on('end', () => {return;});
            socket.on('data', dataCallback);
        });
        server.listen(port, () => {return;});

        return server;
    }

    function createTestSecureServer(port: number, options: any, dataCallback: (data: Blob) => void) {
        const serverOptions = {
            ca: options.verify ? [fs.readFileSync(__dirname + '/support/ssl/client.pub')] :[],
            cert: (options.serverCert) ? fs.readFileSync(options.serverCert) :
                    fs.readFileSync(__dirname + '/support/ssl/server.cert'),
            handshakeTimeout: 2000,
            key: (options.serverKey) ? fs.readFileSync(options.serverKey) :
                    fs.readFileSync(__dirname + '/support/ssl/server.key'),
            requestCert: options.verify ? options.verify :false
        };
        const server = tls.createServer(serverOptions, (socket: net.Socket) => {
            socket.on('end', () => {return;
            });
            socket.on('data', dataCallback);
        });
        server.listen(port, () => {return;
        });

        return server;
    }

    function createLogstashLogger(port: number, secure?: boolean, caFilePath?: string,
                                  extraOptions?: LogstashTransportConfig):
            { logger: winston.Logger, logstashTransport: LogstashWinstonTransport } {
        let transportsConfiguration: LogstashTransportConfig = {
            ca: (secure && caFilePath) ? [__dirname + '/support/ssl/server.cert'] :undefined,
            localhost: 'localhost',
            node_name: 'test',
            pid: 12345,
            port,
            ssl_enable: !!secure
        };

        if (extraOptions && typeof extraOptions === 'object') {
            transportsConfiguration = mergeObject(transportsConfiguration, extraOptions);
        }
        const logstashTransport = new LogstashWinstonTransport(transportsConfiguration);
        const logger = createLogger({
            format: combine(
                    label({label: 'test'}),
                    errors({stack: true}),
                    prettyPrint(),
                    json()
            ),
            transports: [logstashTransport],
        });

        return {logger, logstashTransport};

    }

    describe('with logstash server', () => {
        let testServer: net.Server | null;
        let logger: winston.Logger | null;
        const port = 28777;

        beforeEach((done) => {
            timekeeper.freeze(freezedTime);
            done();
        });

        it('send logs over TCP as valid json', (done) => {
            let response;
            const expected = {
                label: 'test',
                level: 'info',
                message: 'hello world',
                stream: 'sample'
            };
            const {logger: instance} = createLogstashLogger(port);
            logger = instance;
            testServer = createTestServer(port, (data: Blob) => {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('send each log with a new line character', (done) => {
            let response;
            const {logger: instance} = createLogstashLogger(port);
            logger = instance;
            testServer = createTestServer(port, (data: Blob) => {
                response = data.toString();
                expect(response).to.be.
                equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('send with different log levels', (done) => {

            let response;
            const {logger: instance} = createLogstashLogger(port);
            logger = instance;
            testServer = createTestServer(port, (data: Blob) => {
                response = data.toString();
                expect(response).to.be.
                equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n' +
                        '{"stream":"sample","level":"error","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
            logger.log('error', 'hello world', {stream: 'sample'});

        });

        it('send with overrided meta data', (done) => {
            let response;
            const {logger: instance} = createLogstashLogger(port, false, '', {meta: {default_meta_override: 'foo'}});
            logger = instance;
            testServer = createTestServer(port, (data: Blob) => {
                response = data.toString();

                expect(response).to.be.
                equal('{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {default_meta_override: 'tada'});
        });

        // Teardown
        afterEach((done) => {
            if (logger) {
                logger.close();
            }
            timekeeper.reset();
            if (testServer) {
                testServer.close(() => {
                    testServer = null;
                    logger = null;
                    done();
                });
            }
        });

    });

    describe('with secured logstash server', () => {
        let testServer: net.Server | null;
        let logger: winston.Logger | null;
        const port = 28777;

        beforeEach((done) => {
            timekeeper.freeze(freezedTime);
            done();
        });

        it('send logs over SSL secured TCP as valid json', (done) => {
            let response;
            const expected = {
                label: 'test',
                level: 'info',
                message: 'hello world',
                stream: 'sample'
            };
            const {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server.cert');
            logger = instance;
            testServer = createTestSecureServer(port, {}, (data: Blob) => {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });
        // todo figure why the test not passing on original branch
        xit('send logs over SSL secured TCP as valid json with SSL verification', (done) => {
            let response;
            const expected = {
                label: 'test',
                level: 'info',
                message: 'hello world',
                stream: 'sample'
            };
            const {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server.cert');
            logger = instance;
            testServer = createTestSecureServer(port, {verify: true}, (data: Blob) => {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('logstash transport receive an error when there is a ' +
                'connection error different from ECONNREFUSED', (done) => {
            let response;
            const expected = {
                label: 'test',
                level: 'info',
                message: 'hello world',
                stream: 'sample'
            };
            let silence = true;
            const {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server-fail.cert');
            logger = instance;
            testServer = createTestSecureServer(port, {
                serverCert: __dirname + '/support/ssl/server-fail.cert',
                serverKey: __dirname + '/support/ssl/server-fail.key',
                verify: true
            }, (data: Blob) => {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                if (silence) {
                    done();
                    silence = false;
                }
            });

            logger.on('error', (err) => {
                expect(err).to.be.an.instanceof(Error);
                if (silence) {
                    done();
                    silence = false;
                }
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        // Teardown
        afterEach((done) => {
            if (logger) {
                logger.close();
            }
            timekeeper.reset();
            if (testServer) {
                testServer.close(() => {
                    testServer = null;
                    logger = null;
                    done();
                });
            }
        });
    });

    describe('without logstash server', () => {
        let logger: winston.Logger;

        it('fallback to silent mode if logstash server is down', (done) => {

            const {logger: instance, logstashTransport} = createLogstashLogger(28747);
            logger = instance;
            logger.on('error', () => {
                // tslint:disable-next-line
                expect(logstashTransport.silent).to.be.true;
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('emit an error message when it fallback to silent mode', (done) => {
            const {logger: instance, logstashTransport} = createLogstashLogger(28747);
            let called = true;
            logger = instance;
            logger.on('error', (err) => {
                if (/OFFLINE$/.test(err.message)) {
                    expect((<any> logstashTransport).retries).to.be.equal(4);
                    // tslint:disable-next-line
                    expect(logstashTransport.silent).to.be.true;

                    if (called) {
                        done();
                    }

                    called = false;
                }
            });
            // Wait for timeout for logger before sending first message
            const interval = setInterval(() => {
                logger.log('info', 'hello world', {stream: 'sample'});
                clearInterval(interval);
            }, 400);

        });
    });
});
