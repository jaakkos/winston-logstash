import net, { Socket } from 'net'
import tls from 'tls';
import { readFileSync } from 'fs';
import timekeeper from 'timekeeper';
import winston, { LoggerInstance } from 'winston';

export const sslFilePath = (filename: string) => (__dirname + '/../test/support/ssl/' + filename)

const freezedTime = new Date(1330688329321);
const port = 28777;

export function createTestServer(port: number, onData: Function) {
  const server = net.createServer(function (socket: Socket) {
    socket.on('close', () => {
    });
    socket.on('data', (data: Buffer) => {
      onData(data);
    });
  });

  server.listen(port);

  return server;
}

export function createTestSecureServer(port: number, options: {
  serverKey?: string
  serverCert?: string, verify?: boolean
}, onData: Function): tls.Server {
  const serverOptions = {
    host: 'localhost',
    enableTrace: false,
    key: (options.serverKey) ?
      readFileSync(options.serverKey) :
      readFileSync(sslFilePath('server.key')),
    cert: (options.serverCert) ?
      readFileSync(options.serverCert) :
      readFileSync(sslFilePath('server.cert')),
    handshakeTimeout: 1000,
    requestCert: options.verify ? options.verify : false,
    ca: readFileSync(sslFilePath('ca.cert')),
  };

  const server = tls.createServer(serverOptions, (socket: Socket) => {
    socket.on('end', () => {

    });
    socket.on('data', (data) => {
      onData(data);
    });
    socket.on('error', (error) => {

    });
  });

  server.listen(port, 'localhost');

  return server;
}

export function setup(timekeeper: any): Promise<Boolean> {
  timekeeper.freeze(freezedTime);
  return Promise.resolve(true);
}

export function tearDown(logger: LoggerInstance, timekeeper: any, testServer: net.Server | tls.Server): Promise<Boolean> {
  return new Promise((resolve, _) => {
    logger.close();
    timekeeper.reset();
    testServer.close(() => {
      resolve(true);
    });
  })
}