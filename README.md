# winston-logstash

A [Logstash TCP][0] transport for [winston][1].

## Usage
``` js
  var winston = require('winston');

  //
  // Requiring `winston-logstash` will expose
  // `winston.transports.Logio`
  //
  require('winston-logstash');

  winston.add(winston.transports.Logstash, {
    port: 28777,
    node_name: 'my node name',
    host: '127.0.0.1'
  });
```

## Inspiration
[winston-loggly][2]

## Run Tests

```
  npm test
```

## TODO

1. Cleanup & check tests
2. SSL Support
3. Change format

#### Author: [Jaakko Suutarla](https://github.com/jaakkos)
#### License: MIT

[0]: http://logstash.net/
[1]: https://github.com/flatiron/winston
[2]: https://github.com/indexzero/winston-loggly