/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

import { GenericTextTransportOptions, GenericTransportOptions } from "winston";

export type LogEntry = [String, Function];
export type LogEntries = [LogEntry];

interface LogstashTransportSSLOptions {
  ssl_key?: string
  ssl_cert?: string
  ca?: string
  ssl_passphrase?: string
  rejectUnauthorized?: boolean
}

interface LogstashTransportOptions extends GenericTransportOptions,
  GenericTextTransportOptions, LogstashTransportSSLOptions {
  node_name?: string;
  meta?: Object
  ssl_enable?: Boolean;
  retries?: number;
  max_connect_retries?: number;
  timeout_connect_retries?: number;
}