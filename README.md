# winston-logstash

[![Build Status](https://travis-ci.org/jaakkos/winston-logstash.png?branch=master)](https://travis-ci.org/jaakkos/winston-logstash)

[![Dependency Status](https://gemnasium.com/badges/github.com/jaakkos/winston-logstash.svg)](https://gemnasium.com/github.com/jaakkos/winston-logstash)

A [Logstash TCP][0] transport for [winston][1].

## OBS

Due changes to Winston version >= 1.0.0 supports winston < 3.x. Updated version with Winston 3.x support will be released soon.

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
  npm test
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
