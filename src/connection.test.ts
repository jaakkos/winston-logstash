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
            expect(socket.write).toHaveBeenCalledWith(Buffer.from(message), callback);
        });

        test('can close connection', () => {
            connection['socket'] = socket;
            connection.close();

            expect(socket.removeAllListeners).toHaveBeenCalled();
            expect(socket.destroy).toHaveBeenCalled();
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

        test('checks if secure```javascript connection is ready to send', () => {
            connection['socket'] = socket;
            expect(connection.readyToSend()).toBe(true);
        });

    });
});
