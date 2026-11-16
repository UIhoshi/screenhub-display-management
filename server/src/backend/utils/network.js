const os = require('os');

function getLocalIPv4Addresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === 'IPv4' && !entry.internal)
    .map((entry) => entry.address);
}

function isPrivateLanIp(address) {
  const parts = String(address || '').split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  return (
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}

function getPreferredServerIp() {
  const candidates = getLocalIPv4Addresses();
  const privateCandidates = candidates.filter((address) => isPrivateLanIp(address));
  if (privateCandidates.length) {
    return privateCandidates[0];
  }
  return candidates[0] || '127.0.0.1';
}

function getIpv4PrefixScore(left, right) {
  const leftParts = String(left || '').split('.');
  const rightParts = String(right || '').split('.');
  let score = 0;
  for (let index = 0; index < 4; index += 1) {
    if (leftParts[index] !== rightParts[index]) {
      break;
    }
    score += 1;
  }
  return score;
}

function resolveServerIpForClient(clientIp) {
  const candidates = getLocalIPv4Addresses();
  if (!candidates.length) {
    return getPreferredServerIp();
  }

  const ranked = candidates
    .map((address) => ({
      address,
      score: getIpv4PrefixScore(address, clientIp) + (isPrivateLanIp(address) ? 10 : 0),
    }))
    .sort((left, right) => right.score - left.score);

  return ranked[0]?.address || getPreferredServerIp();
}

module.exports = {
  getLocalIPv4Addresses,
  isPrivateLanIp,
  getPreferredServerIp,
  getIpv4PrefixScore,
  resolveServerIpForClient,
};
