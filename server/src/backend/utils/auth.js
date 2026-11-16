const crypto = require('crypto');

function sha256Digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest();
}

/**
 * Constant-time token comparison via fixed-length SHA-256 digests.
 */
function isValidToken(provided, expected) {
  const candidate = String(provided || '').trim();
  const target = String(expected || '').trim();
  if (!candidate || !target) {
    return false;
  }
  return crypto.timingSafeEqual(sha256Digest(candidate), sha256Digest(target));
}

module.exports = {
  isValidToken,
};
