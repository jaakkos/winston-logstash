import { Connection, PlainConnection, SecureConnection } from './connection';
import { Manager } from './manager';
import net from 'net';
import tls from 'tls';
import { EventEmitter } from 'events';
import { sslFilePath } from '../test/test_helper'

jest.mock('net');
jest.mock('tls');
jest.mock('./manager');

const MockedNet = net as jest.Mocked<typeof net>;
const MockedTls = tls as jest.Mocked<typeof tls>;
const MockedManager = Manager as jest.MockedClass<typeof Manager>;

beforeEach(() => {
    MockedNet.Socket.mockClear();
    MockedTls.connect.mockClear();
    MockedManager.mockClear();
});

describe('Connection', () => {
    // @ts-ignore
    const manager = new Manager();
    const options = { host: 'localhost', port: 12345 };
    const connection = new Connection(options, manager);

    test('initializes with provided options', () => {
        // @ts-ignore
        expect(connection.host).toBe(options.host);
        // @ts-ignore
        expect(connection.port).toBe(options.port);
    });

    test('can send a message', () => {
        const socket = new EventEmitter() as net.Socket;
        // @ts-ignore
        socket.readyState = 'open';
        socket.write = jest.fn().mockReturnValue(true);
        // @ts-ignore
        connection.socket = socket;
        const message = 'test message';
        const callback = jest.fn();

        const result = connection.send(message, callback);

        expect(result).toBe(true);
        expect(socket.write).toHaveBeenCalledWith(Buffer.from(message), callback);
    });

    test('can close connection', () => {
        const socket = new EventEmitter() as net.Socket;
        socket.removeAllListeners = jest.fn();
        socket.destroy = jest.fn();
        // @ts-ignore
        connection.socket = socket;

        connection.close();

        expect(socket.removeAllListeners).toHaveBeenCalled();
        expect(socket.destroy).toHaveBeenCalled();
    });
});
