module.exports = {
  presets: ['@babel/preset-typescript', '@babel/preset-env'],
  ignore: ['src/winston-logstash.test.ts',
    'src/winston-logstash-latest.test.ts'],
  targets: 'node 6',
};
