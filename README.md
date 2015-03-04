# winston-logstash

[![Build Status](https://travis-ci.org/jaakkos/winston-logstash.png?branch=master)](https://travis-ci.org/jaakkos/winston-logstash)

A [Logstash TCP][0] transport for [winston][1].

## Usage

### Node

``` js
  var winston = require('winston');

  //
  // Requiring `winston-logstash` will expose
  // `winston.transports.Logstash`
  //
  require('winston-logstash');

  winston.add(winston.transports.Logstash, {
    port: 28777,
    node_name: 'my node name',
    host: '127.0.0.1',
    retryInterval: 200
  });
```

### More Options

* **max_connect_retries** - (optional) The maximum number of retry attempts.  Default 4.  After max is reached, the logger will never re-connect to your Logstash server.
* **retryInterval** - (optional) Time (in ms) between re-connection attempts.  Default 100ms.
* **fibonacci_backoff** - (optional) Re-connection attempts are backed off according to fibonacci pattern.  Each retry attempt happens after `fibonacci[n] * retryInterval` ms.
* **flat_retry_threshold** - (optional) Once this many retry attempts have been made, Winston will only retry every `flat_retry_interval` ms.
* **max_queue_length** - (optional) The max number of messages to have pending.  When disconnected from Logstash server, Winston will queue messages and try to send them later. 

Read the code for more options.

### Logstash config

``` ruby
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

## Inspiration
[winston-loggly][2]

## Run Tests

```
  NODE_TLS_REJECT_UNAUTHORIZED=0 npm test
```

## TODO

1. Rethink logstash integration ( https://github.com/flatiron/winston/blob/master/lib/winston/common.js#L149 )
2. Rewrite
3. Release major after rewrite

N. Clean up tests ( refactor )

#### Author: [Jaakko Suutarla](https://github.com/jaakkos)

#### License: MIT

See LICENSE for the full license text.

[0]: http://logstash.net/
[1]: https://github.com/flatiron/winston
[2]: https://github.com/indexzero/winston-loggly
