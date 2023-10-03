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

  /**
   * How to retry on connection failure. We can either retry immediately or
   * after a delay
   */
  retryStrategy?: RetryStrategy;

  /** @deprecated - Use `retryStrategy` instead */
  max_connect_retries?: number;
  /** @deprecated - Use `retryStrategy` instead */
  timeout_connect_retries?: number;
}

export type RetryStrategy = BackoffRetryStrategy | FixedDelayRetryStrategy;

interface BackoffRetryStrategy extends BaseRetryStrategy {
  strategy: 'exponentialBackoff';
  /**
   * Limit the delay so we don't wait a really long time if a lot of retries
   * have failed.
   */
  maxDelayBeforeRetryMs: number;
}

interface FixedDelayRetryStrategy extends BaseRetryStrategy {
  strategy: 'fixedDelay',
  /** How long to wait before each retry */
  delayBeforeRetryMs: number;
}

interface BaseRetryStrategy {
  /** How many times to retry before fully giving up. -1 for unlimited */
  maxConnectRetries: number;
}
