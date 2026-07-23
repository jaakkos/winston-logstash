"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.isPermanentConnectionError = isPermanentConnectionError;
exports.isTransientConnectionError = isTransientConnectionError;
/*
 *
 * (C) 2022 Jaakko Suutarla
 * MIT LICENCE
 *
 */

const TRANSIENT_ERROR_CODES = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ESOCKETTIMEDOUT', 'EPIPE', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNABORTED']);
const PERMANENT_ERROR_CODES = new Set(['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'CERT_HAS_EXPIRED', 'ERR_TLS_CERT_ALTNAME_INVALID', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN']);
const PERMANENT_MESSAGE_PATTERNS = [/unable to verify/i, /certificate/i, /CERT_/i, /SSL.*alert/i];
function getErrorCode(error) {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = error.code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}
function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return '';
}
function isPermanentConnectionError(error) {
  const code = getErrorCode(error);
  if (code) {
    if (PERMANENT_ERROR_CODES.has(code)) {
      return true;
    }
    if (code.startsWith('ERR_SSL_') || code.startsWith('ERR_TLS_')) {
      return true;
    }
  }
  const message = getErrorMessage(error);
  if (!message) {
    return false;
  }

  // Avoid treating transient codes embedded in messages as permanent via "certificate"
  if (TRANSIENT_ERROR_CODES.has(code ?? '') || TRANSIENT_ERROR_CODES.has(message) || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ECONNABORTED/.test(message)) {
    return false;
  }
  return PERMANENT_MESSAGE_PATTERNS.some(pattern => pattern.test(message));
}

/**
 * Whether a connection error should be retried when retry_transient_errors_only is enabled.
 * Permanent TLS/cert failures return false; known transient and unknown errors return true.
 */
function isTransientConnectionError(error) {
  if (isPermanentConnectionError(error)) {
    return false;
  }
  const code = getErrorCode(error);
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }
  const message = getErrorMessage(error);
  if (TRANSIENT_ERROR_CODES.has(message) || /ECONNREFUSED|ECONNRESET|ETIMEDOUT|ESOCKETTIMEDOUT|EPIPE|ENOTFOUND|EAI_AGAIN|ECONNABORTED/.test(message)) {
    return true;
  }

  // Unknown errors (and socket idle timeout payloads) — retry to avoid surprise fail-fast
  return true;
}