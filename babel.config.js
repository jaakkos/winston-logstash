module.exports = {
  presets: ['@babel/preset-typescript', '@babel/preset-env'],
  ignore: ['src/winston-logstash.test.ts',
    'src/winston-logstash-latest.test.ts',
    'src/connection.test.ts', 'src/manager.test.ts'],
  targets: 'node 6',
};
