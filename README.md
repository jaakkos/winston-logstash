# winston-logstash

[![Build Status](https://github.com/jaakkos/winston-logstash/actions/workflows/build-test.yaml/badge.svg)](https://github.com/jaakkos/winston-logstash/actions/workflows/build-test.yaml)

A [Logstash TCP][0] transport for [winston][1].

## Usage

### Winston 2.x

``` js
  // See test cases from test-bench/winston-2x/test/smoke.js
  const winston = require('winston');
  const transports = require('winston-logstash');

    const logger = new (winston.Logger)({
      transports: [
        new transports.Logstash({
              port: 28777,
              node_name: 'my node name',
              host: '127.0.0.1'})]});

    log.info("Hello world!");
```

### Winston 3.x

``` js
  // See test cases from test-bench/winston-3x/test/smoke.js
  const winston = require('winston');
  const LogstashTransport = require('winston-logstash/lib/winston-logstash-latest');

    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
              port: 28777,
              node_name: 'my node name',
              host: '127.0.0.1'})]});

    log.info("Hello world!");
```

### Logstash config

``` ruby
  # See example from test-bench/logstash/logstash/pipeline/default.conf
  input {
    # Sample input over TCP
    tcp { port => 28777 type=>"sample" }
  }
  output {
    stdout { debug => true }
  }

  filter {
    json {
      source => "message"
    }
  }

```

## FAQ

### How to keep the connection open while Logstash is restarting?

It's possible to set max_connect_retries to -1 (infinite) so the client keeps trying to connect to the Logstash. So when Logstash is restarted the retry logic will reconnect when it comes back online.

``` js
    const logger = winston.createLogger({
      transports: [
        new LogstashTransport({
              ...
               max_connect_retries: -1
              ...
              })]});
```

## Run Tests

```shell
  $ npm test
```

## Run integration tests with Logstash

```shell
  $ cd test-bench/winston-3x
  $ docker-compose up -d
  $ npm test
```

## Inspiration

[winston-loggly][2]

## Author: [Jaakko Suutarla](https://github.com/jaakkos)

## License: MIT

See LICENSE for the full license text.

[0]: http://logstash.net/
[1]: https://github.com/flatiron/winston
[2]: https://github.com/indexzero/winston-loggly
