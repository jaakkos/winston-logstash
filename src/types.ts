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
  retryStrategy?: RetryStrategy;
}

/**
 * Retry strategy configuration for connection failures.
 * Choose between exponential backoff (recommended for production) or fixed delay.
 */
export type RetryStrategy = ExponentialBackoffStrategy | FixedDelayStrategy;

/**
 * Exponential backoff: start with a short delay, double it each time.
 * Good for production - quick recovery for transient issues, avoids
 * hammering the server when it's overloaded.
 */
export interface ExponentialBackoffStrategy {
  strategy: 'exponentialBackoff';
  /** How many times to retry before giving up. -1 for unlimited. */
  maxConnectRetries: number;
  /** Initial delay before first retry in ms. Default: 100 */
  initialDelayMs?: number;
  /** Maximum delay between retries in ms (caps exponential growth). */
  maxDelayBeforeRetryMs: number;
}

/**
 * Fixed delay: wait the same amount of time between each retry.
 * This is the legacy behavior.
 */
export interface FixedDelayStrategy {
  strategy: 'fixedDelay';
  /** How many times to retry before giving up. -1 for unlimited. */
  maxConnectRetries: number;
  /** How long to wait before each retry in ms. */
  delayBeforeRetryMs: number;
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
