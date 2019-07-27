# winston-logstash

[![Build Status](https://travis-ci.org/jaakkos/winston-logstash.svg?branch=master)](https://travis-ci.org/jaakkos/winston-logstash)

[![Known Vulnerabilities](https://snyk.io/test/github/jaakkos/logger-wrapper/badge.svg?targetFile=package.json)](https://snyk.io/test/github/jaakkos/logger-wrapper?targetFile=package.json)

A [Logstash TCP][0] transport for [winston][1].
### Based on the great work by @jaakkos https://github.com/jaakkos/winston-logstash

I decide to clone and deploy separately - since the code styles and nodejs version support that 
I have are very different from those of the original authors. But I will be more than happy if this 
fork will be merged back into the original project

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
