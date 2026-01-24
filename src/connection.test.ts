import { Connection, PlainConnection, SecureConnection, ConnectionActions, ConnectionEvents } from './connection'; 
import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';
import { sslFilePath } from '../test/test_helper'

jest.mock('net');
jest.mock('tls');

const MockedNet = net as jest.Mocked<typeof net>;
const MockedTls = tls as jest.Mocked<typeof tls>;

let socket: net.Socket & { emit: jest.Mock, readyState: string };
let options: { host: string, port: number };

beforeEach(() => {
    MockedNet.Socket.mockClear();
    MockedTls.connect.mockClear();

    options = { host: 'localhost', port: 12345 };

    socket = new EventEmitter() as net.Socket & { emit: jest.Mock, readyState: string };
    socket.write = jest.fn().mockReturnValue(true);
    socket.removeAllListeners = jest.fn();
    socket.end = jest.fn();
    socket.destroy = jest.fn();
    socket.connect = jest.fn().mockImplementation(() => {
        socket.emit('connect')
    });
    socket.readyState = 'open';
});

describe('Connection', () => {
    const options = { host: 'localhost', port: 12345 };

    describe('PlainConnection', () => {
        let connection: PlainConnection;

        beforeEach(() => {
            connection = new PlainConnection(options);
        });

        test('initializes with provided options', () => {
            expect(connection['host']).toBe(options.host);
            expect(connection['port']).toBe(options.port);
        });

        test('can send a message', () => {
            connection['socket'] = socket;
            const message = 'test message';
            const callback = jest.fn();

            const result = connection.send(message, callback);

            expect(result).toBe(true);
            expect(socket.write).toHaveBeenCalledWith(message, 'utf8', callback);
        });

        test('can close connection', () => {
            connection['socket'] = socket;
            connection.close();

            expect(socket.removeAllListeners).toHaveBeenCalled();
            expect(socket.end).toHaveBeenCalled();
            expect(socket.destroy).toHaveBeenCalled();
            expect(connection['socket']).toBeUndefined();
            expect(connection['action']).toBe(ConnectionActions.Closing);
        });

        test('can connect to server', () => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect();
            expect(MockedNet.Socket).toHaveBeenCalledTimes(1);
            expect(connection['action']).toBe(ConnectionActions.Connecting);
        });

        test('checks if connection is ready to send', () => {
            connection['socket'] = socket;
            expect(connection.readyToSend()).toBe(true);
        });

        test('emits timeout event when socket times out', (done) => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect();

            connection.on(ConnectionEvents.Timeout, (readyState) => {
                expect(connection['action']).toBe(ConnectionActions.HandlingError);
                done();
            });

            socket.emit('timeout');
        });

        test('emits drain event when socket drains', (done) => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect();

            connection.on(ConnectionEvents.Drain, () => {
                done();
            });

            socket.emit('drain');
        });

        test('emits Closed event when closing intentionally', (done) => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect();

            connection.on(ConnectionEvents.Closed, () => {
                done();
            });

            connection.close();
        });

        test('emits ClosedByServer event when server closes connection', (done) => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect();

            connection.on(ConnectionEvents.ClosedByServer, () => {
                done();
            });

            socket.emit('close', new Error('Connection closed by server'));
        });

    });

    describe('SecureConnection', () => {
        let connection: SecureConnection;
        const sslOptions = {
            ...options,
            ssl_key: sslFilePath('client.key'),
            ssl_cert: sslFilePath('client.cert'),
            ca: sslFilePath('ca.cert')
        };

        beforeEach(() => {
            connection = new SecureConnection(sslOptions);
        });

        test('initializes with provided options and SSL options', () => {
            expect(connection['host']).toBe(sslOptions.host);
            expect(connection['port']).toBe(sslOptions.port);
            expect(connection['secureContextOptions'].key).toBeDefined();
            expect(connection['secureContextOptions'].cert).toBeDefined();
            expect(connection['secureContextOptions'].ca).toBeDefined();
        });

        test('can connect to secure server', () => {
            MockedTls.connect.mockReturnValue(socket as any);
            connection.connect();
            expect(MockedTls.connect).toHaveBeenCalledTimes(1);
            expect(connection['action']).toBe(ConnectionActions.Connecting);
        });

        test('checks if secure connection is ready to send', () => {
            connection['socket'] = socket;
            expect(connection.readyToSend()).toBe(true);
        });

        test('emits error when TLS connect throws', (done) => {
            const testError = new Error('TLS connection failed');
            MockedTls.connect.mockImplementation(() => {
                throw testError;
            });

            connection.on(ConnectionEvents.Error, (error) => {
                expect(error).toBe(testError);
                done();
            });

            connection.connect();
        });

        test('defaults rejectUnauthorized to true when not specified', () => {
            const optionsWithoutReject = {
                ...options,
                ssl_key: sslFilePath('client.key'),
                ssl_cert: sslFilePath('client.cert'),
                ca: sslFilePath('ca.cert'),
                // rejectUnauthorized not specified
            };
            const conn = new SecureConnection(optionsWithoutReject);
            expect(conn['secureContextOptions'].rejectUnauthorized).toBe(true);
        });

        test('respects explicit rejectUnauthorized: false', () => {
            const optionsWithRejectFalse = {
                ...options,
                ssl_key: sslFilePath('client.key'),
                ssl_cert: sslFilePath('client.cert'),
                ca: sslFilePath('ca.cert'),
                rejectUnauthorized: false,
            };
            const conn = new SecureConnection(optionsWithRejectFalse);
            expect(conn['secureContextOptions'].rejectUnauthorized).toBe(false);
        });

        test('warns when SSL enabled without CA and rejectUnauthorized is true', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            
            const optionsWithoutCA = {
                ...options,
                ssl_key: sslFilePath('client.key'),
                ssl_cert: sslFilePath('client.cert'),
                // no ca provided
            };
            new SecureConnection(optionsWithoutCA);
            
            expect(warnSpy).toHaveBeenCalledWith(
                expect.stringContaining('SSL verification is enabled but no CA certificate provided')
            );
            
            warnSpy.mockRestore();
        });

        test('does not warn when CA is provided', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            
            new SecureConnection(sslOptions); // has ca
            
            expect(warnSpy).not.toHaveBeenCalled();
            
            warnSpy.mockRestore();
        });

        test('does not warn when rejectUnauthorized is false', () => {
            const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            
            const optionsWithRejectFalse = {
                ...options,
                rejectUnauthorized: false,
            };
            new SecureConnection(optionsWithRejectFalse);
            
            expect(warnSpy).not.toHaveBeenCalled();
            
            warnSpy.mockRestore();
        });

    });
});
