import {LogstashTransportConfig} from '../src/LogstashTransportConfig';
import {Logger} from 'winston';
import {LogstashWinstonTransport} from '../src/winston-logstash';
import {Server, Socket} from 'net';

process.env.NODE_ENV = 'test';

const chai = require('chai');
const expect = chai.expect;
const net = require('net');
const tls = require('tls');
const fs = require('fs');
const winston = require('winston');
const timekeeper = require('timekeeper');
const freezed_time = new Date(1330688329321);

chai.config.includeStack = true;

const LogstashTransport = require('../src/winston-logstash');
const {createLogger, format} = winston;
const {combine, label, prettyPrint, errors, json} = format;

describe('winston-logstash transport', function() {

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

    function createTestServer(port: number, on_data: (data: Blob) => void): Server {
        const server = net.createServer(function(socket: Socket) {
            socket.on('end', function() {
            });
            socket.on('data', on_data);
        });
        server.listen(port, function() {
        });

        return server;
    }

    function createTestSecureServer(port: number, options: any, on_data: (data: Blob) => void) {
        const serverOptions = {
            key: (options.serverKey) ? fs.readFileSync(options.serverKey):fs.readFileSync(__dirname + '/support/ssl/server.key'),
            cert: (options.serverCert) ? fs.readFileSync(options.serverCert):fs.readFileSync(__dirname + '/support/ssl/server.cert'),
            handshakeTimeout: 2000,
            requestCert: options.verify ? options.verify:false,
            ca: options.verify ? [fs.readFileSync(__dirname + '/support/ssl/client.pub')]:[]
        };
        const server = tls.createServer(serverOptions, function(socket: Socket) {
            socket.on('end', function() {
            });
            socket.on('data', on_data);
        });
        server.listen(port, function() {
        });

        return server;
    }

    function createLogstashLogger(port: number, secure?: boolean, caFilePath?: string, extraOptions?: LogstashTransportConfig): { logger: Logger, logstashTransport: LogstashWinstonTransport } {
        let transportsConfiguration: LogstashTransportConfig = {
            port: port,
            node_name: 'test',
            localhost: 'localhost',
            pid: 12345,
            ssl_enable: !!secure,
            ca: (secure && caFilePath) ? [__dirname + '/support/ssl/server.cert'] : undefined
        };

        if (extraOptions && typeof extraOptions === 'object') {
            transportsConfiguration = mergeObject(transportsConfiguration, extraOptions);
        }
        const logstashTransport = new LogstashTransport(transportsConfiguration);
        const logger = createLogger({
            transports: [logstashTransport],
            format: combine(
                    label({label: 'test'}),
                    errors({stack: true}),
                    prettyPrint(),
                    json()
            ),
        });

        return {logger, logstashTransport};

    }

    describe('with logstash server', function() {
        let test_server: Server | null;
        let logger: Logger | null;
        const port = 28777;

        beforeEach(function(done) {
            timekeeper.freeze(freezed_time);
            done();
        });

        it('send logs over TCP as valid json', function(done) {
            let response;
            const expected = {
                'stream': 'sample',
                'level': 'info',
                'message': 'hello world',
                'label': 'test'
            };
            let {logger: instance} = createLogstashLogger(port);
            logger = instance;
            test_server = createTestServer(port, function(data: Blob) {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('send each log with a new line character', function(done) {
            let response;
            let {logger: instance} = createLogstashLogger(port);
            logger = instance;
            test_server = createTestServer(port, function(data: Blob) {
                response = data.toString();
                expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('send with different log levels', function(done) {

            let response;
            let {logger: instance} = createLogstashLogger(port);
            logger = instance;
            test_server = createTestServer(port, function(data: Blob) {
                response = data.toString();
                expect(response).to.be.equal('{"stream":"sample","level":"info","message":"hello world","label":"test"}\n{"stream":"sample","level":"error","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
            logger.log('error', 'hello world', {stream: 'sample'});

        });

        it('send with overrided meta data', function(done) {
            let response;
            let {logger: instance} = createLogstashLogger(port, false, '', {meta: {default_meta_override: 'foo'}});
            logger = instance;
            test_server = createTestServer(port, function(data: Blob) {
                response = data.toString();

                expect(response).to.be.equal('{"default_meta_override":"foo","level":"info","message":"hello world","label":"test"}\n');
                done();
            });

            logger.log('info', 'hello world', {'default_meta_override': 'tada'});
        });

        // Teardown
        afterEach(function(done) {
            if (logger) {
                logger.close();
            }
            timekeeper.reset();
            if (test_server) {
                test_server.close(function() {
                    test_server = null;
                    logger = null;
                    done();
                });
            }
        });

    });

    describe('with secured logstash server', function() {
        let test_server: Server | null;
        let logger: Logger | null;
        const port = 28777;

        beforeEach(function(done) {
            timekeeper.freeze(freezed_time);
            done();
        });

        it('send logs over SSL secured TCP as valid json', function(done) {
            let response;
            const expected = {
                'stream': 'sample',
                'level': 'info',
                'message': 'hello world',
                'label': 'test'
            };
            let {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server.cert');
            logger = instance;
            test_server = createTestSecureServer(port, {}, function(data: Blob) {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });
        // todo figure why the test not passing on original branch
        xit('send logs over SSL secured TCP as valid json with SSL verification', function(done) {
            let response;
            const expected = {
                'stream': 'sample',
                'level': 'info',
                'message': 'hello world',
                'label': 'test'
            };
            let {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server.cert');
            logger = instance;
            test_server = createTestSecureServer(port, {verify: true}, function(data: Blob) {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('logstash transport receive an error when there is a connection error different from ECONNREFUSED', function(done) {
            let response;
            const expected = {
                'stream': 'sample',
                'level': 'info',
                'message': 'hello world',
                'label': 'test'
            };
            let silence = true;
            let {logger: instance} = createLogstashLogger(port, true, __dirname + '/support/ssl/server-fail.cert');
            logger = instance;
            test_server = createTestSecureServer(port, {
                serverKey: __dirname + '/support/ssl/server-fail.key',
                serverCert: __dirname + '/support/ssl/server-fail.cert',
                verify: true
            }, function(data: Blob) {
                response = data.toString();
                expect(JSON.parse(response)).to.be.eql(expected);
                if (silence) {
                    done();
                    silence = false;
                }
            });

            logger.on('error', function(err) {
                expect(err).to.be.an.instanceof(Error);
                if (silence) {
                    done();
                    silence = false;
                }
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        // Teardown
        afterEach(function(done) {
            if (logger) {
                logger.close();
            }
            timekeeper.reset();
            if (test_server) {
                test_server.close(function() {
                    test_server = null;
                    logger = null;
                    done();
                });
            }
        });
    });

    describe('without logstash server', function() {
        let logger: Logger;

        it('fallback to silent mode if logstash server is down', function(done) {

            let {logger: instance, logstashTransport} = createLogstashLogger(28747);
            logger = instance;
            logger.on('error', () => {
                expect(logstashTransport.silent).to.be.true;
                done();
            });

            logger.log('info', 'hello world', {stream: 'sample'});
        });

        it('emit an error message when it fallback to silent mode', function(done) {
            let {logger: instance, logstashTransport} = createLogstashLogger(28747);
            let called = true;
            logger = instance;
            logger.on('error', function(err) {
                if (/OFFLINE$/.test(err.message)) {
                    expect((<any> logstashTransport).retries).to.be.equal(4);
                    expect(logstashTransport.silent).to.be.true;

                    if (called) {
                        done();
                    }

                    called = false;
                }
            });
            // Wait for timeout for logger before sending first message
            const interval = setInterval(function() {
                logger.log('info', 'hello world', {stream: 'sample'});
                clearInterval(interval);
            }, 400);

        });
    });
});


