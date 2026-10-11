module.exports = {
  presets: [
    '@babel/preset-typescript',
    ['@babel/preset-env', {modules: 'commonjs'}],
  ],
  ignore: ['src/**/*.test.ts'],
  targets: 'node 18',
};
