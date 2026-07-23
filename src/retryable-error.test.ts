import {isPermanentConnectionError, isTransientConnectionError} from './retryable-error';

describe('retryable-error classifier', () => {
  test('treats common network codes as transient', () => {
    for (const code of ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ENOTFOUND']) {
      const error = Object.assign(new Error(code), {code});
      expect(isTransientConnectionError(error)).toBe(true);
      expect(isPermanentConnectionError(error)).toBe(false);
    }
  });

  test('treats TLS certificate codes as permanent', () => {
    for (const code of [
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'DEPTH_ZERO_SELF_SIGNED_CERT',
      'SELF_SIGNED_CERT_IN_CHAIN',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ]) {
      const error = Object.assign(new Error(code), {code});
      expect(isPermanentConnectionError(error)).toBe(true);
      expect(isTransientConnectionError(error)).toBe(false);
    }
  });

  test('treats unknown errors as retryable', () => {
    expect(isTransientConnectionError(new Error('weird'))).toBe(true);
    expect(isTransientConnectionError('open')).toBe(true);
  });
});
