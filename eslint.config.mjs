import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';
import {FlatCompat} from '@eslint/eslintrc';
import path from 'path';
import {fileURLToPath} from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
  resolvePluginsRelativeTo: __dirname,
  recommendedConfig: js.configs.recommended,
});

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.parcel-cache/**',
      'dist/**',
      'lib/**',
      'coverage/**',
      'test-bench/**',
      '.eslintrc.js',
      'package.json',
      'package-lock.json',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...compat.extends('google'),
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-wrapper-object-types': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      '@typescript-eslint/no-this-alias': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      'no-unused-vars': 'off',
      'no-control-regex': 'off',
      'prefer-const': 'off',
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      'max-len': 'off',
      'no-invalid-this': 'off',
      'func-call-spacing': 'off',
      'comma-dangle': ['error', 'always-multiline'],
      'indent': ['error', 2, {'SwitchCase': 1}],
      'object-curly-spacing': ['error', 'never'],
    },
  },
);
