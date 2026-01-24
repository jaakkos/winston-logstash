/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import { GenericTextTransportOptions, GenericTransportOptions } from "winston";
import { TransportStreamOptions } from "winston-transport";

export type LogEntry = [String, Function];
export type LogEntries = [LogEntry];

export interface ConnectionOptions {
  host?: string;
  port?: number;
}

export interface ConnectionManagerOptions {
  max_connect_retries?: number;
  timeout_connect_retries?: number;
}

export interface SecureConnectionOptions extends ConnectionOptions {
  ssl_key?: string;
  ssl_cert?: string;
  ca?: string;
  ssl_passphrase?: string;
  rejectUnauthorized?: boolean;
}

export interface InstanceOptions extends ConnectionManagerOptions,
  SecureConnectionOptions {
  ssl_enable?: Boolean;
}

export interface LogstashOptions extends GenericTransportOptions,
  GenericTextTransportOptions, InstanceOptions {
  node_name?: string;
  meta?: Object;
}

export interface LogstashTransportOptions extends TransportStreamOptions, InstanceOptions {}

// Legacy export for backward compatibility
export interface LogstashTransportSSLOptions extends SecureConnectionOptions {}
