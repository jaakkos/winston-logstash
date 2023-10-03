## Configuration

* `host`
  * The host location of the logstash server.
  * Default: `127.0.0.1`
* `port`
  * The host port to connect.
  * Default: `28777`
* `retryStrategy`
  * What strategy to use to retry when the connection encounters an error.
  * Consists of an object in one of two formats:
    * Exponential backoff: start with a short timeout, and then retry with a longer timeout with each failure.
      * `{ strategy: 'exponentialBackoff', maxConnectRetries: number, maxDelayBeforeRetryMs: number }`
    * Fixed delay: retry after a fixed delay each time.
      * `{ strategy: 'fixedDelay', maxConnectRetries: number, delayBeforeRetryMs: number }`
  * You can set `maxConnectRetries: -1` to have no limit on the number of retries.
  * Default `{ strategy: 'exponentialBackoff', maxConnectRetries: -1, maxDelayBeforeRetryMs: 120000 }`
* `ssl_enable`
  * Enable SSL transfer of logs to logstash.
  * Default: `false`
* `ssl_key`
  * Path location of client private key.
  * Only needed if SSL verify is required on logstash.
  * No default
* `ssl_cert`
  * Path location of client public certificate.
  * Only needed if SSL verify is required on logstash.
  * No default
* `ssl_passphrase`
  * Passphrase for the SSL key.
  * Only needed if the certificate has a passphrase.
  * No default
* `rejectUnauthorized`
  * If true the server will reject any connection which is not authorized with the list of supplied CAs.
  * Default true
