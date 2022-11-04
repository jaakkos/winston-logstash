const common = require('winston/lib/winston/common');

module.exports = function(level, msg, meta, self) {
  return common.log({
    level: level,
    message: msg,
    meta: meta,
    json: self.json,
    logstash: self.logstash,
    colorize: self.colorize,
    prettyPrint: self.prettyPrint,
    timestamp: self.timestamp,
    showLevel: self.showLevel,
    stringify: self.stringify,
    label: self.label,
    depth: self.depth,
    formatter: self.formatter,
    humanReadableUnhandledException: self.humanReadableUnhandledException,
  });
};
