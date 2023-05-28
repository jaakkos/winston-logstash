import { Connection, PlainConnection, SecureConnection } from './connection';
import { Manager } from './manager';
import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';
import { sslFilePath } from '../test/test_helper'

jest.mock('net');
jest.mock('tls');

const MockedNet = net as jest.Mocked<typeof net>;
const MockedTls = tls as jest.Mocked<typeof tls>;

let manager: Manager;
let connection: Connection;
let socket: net.Socket;
let options: { host: string, port: number };

beforeEach(() => {
    MockedNet.Socket.mockClear();
    MockedTls.connect.mockClear();

    options = { host: 'localhost', port: 12345 };
    connection = new PlainConnection(options);
    manager = new Manager({}, connection);
    socket = new EventEmitter() as net.Socket;
    socket.write = jest.fn().mockReturnValue(true);
    socket.removeAllListeners = jest.fn();
    socket.destroy = jest.fn();
});

describe('Connection', () => {
    const options = { host: 'localhost', port: 12345 };

    describe('PlainConnection', () => {
        let connection: PlainConnection;

        beforeEach(() => {
            connection = new PlainConnection(options);
        });

        test('initializes with provided options', () => {
            // @ts-ignore
            expect(connection.host).toBe(options.host);
            // @ts-ignore
            expect(connection.port).toBe(options.port);
        });

        test('can send a message', () => {
            // @ts-ignore
            connection.socket = socket;
            const message = 'test message';
            const callback = jest.fn();

            const result = connection.send(message, callback);

            expect(result).toBe(true);
            expect(socket.write).toHaveBeenCalledWith(Buffer.from(message), callback);
        });

        test('can close connection', () => {
            // @ts-ignore
            connection.socket = socket;

            connection.close();

            expect(socket.removeAllListeners).toHaveBeenCalled();
            expect(socket.destroy).toHaveBeenCalled();
        });

        test('can connect to server', () => {
            MockedNet.Socket.mockReturnValue(socket as any);
            connection.connect(manager);
            expect(MockedNet.Socket).toHaveBeenCalledTimes(1);
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
            // @ts-ignore
            expect(connection.host).toBe(sslOptions.host);
            // @ts-ignore
            expect(connection.port).toBe(sslOptions.port);
            // @ts-ignore
            expect(connection.secureContextOptions.key).toBeDefined();
            // @ts-ignore
            expect(connection.secureContextOptions.cert).toBeDefined();
            // @ts-ignore
            expect(connection.secureContextOptions.ca).toBeDefined();
        });

        test('can connect to secure server', () => {
            MockedTls.connect.mockReturnValue(socket as any);
            connection.connect(manager);
            expect(MockedTls.connect).toHaveBeenCalledTimes(1);
        });
    });
});
