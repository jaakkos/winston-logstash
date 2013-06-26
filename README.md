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
    host: '127.0.0.1'
  });
```

### Logstash config

``` ruby
  input {
    # Sample input over TCP
    tcp { format => "json" charset => "UTF-8" port => 28777 type=>"sample" }
  }
  output {
    stdout { debug => true debug_format => "json"}
  }
```

## Inspiration
[winston-loggly][2]

## Run Tests

```
  NODE_TLS_REJECT_UNAUTHORIZED=0 npm test
```

## TODO

1. Support for different formats
2. ???

#### Author: [Jaakko Suutarla](https://github.com/jaakkos)

#### License: MIT

See LICENSE for the full license text.

[0]: http://logstash.net/
[1]: https://github.com/flatiron/winston
[2]: https://github.com/indexzero/winston-loggly
