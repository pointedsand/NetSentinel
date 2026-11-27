const rank = { 'Reverse DNS':1, 'NetBIOS name response':2, 'DHCP client hostname':2, 'Observed mDNS':3, 'Local OS hostname':4 };

export function recordName(device, name, method, ttlSeconds, now = Date.now()) {
  if (typeof name !== 'string' || !name || name.length > 253 || /[\s\x00-\x1f]/.test(name)) return false;
  if (device.nameExpires > now && rank[device.nameMethod] > rank[method]) return false;
  device.hostname = name;
  device.nameMethod = method;
  device.nameObserved = now;
  device.nameExpires = now + Math.min(86400,ttlSeconds)*1000;
  return true;
}

export function advertisedName(packet) {
  if (packet.application !== 'mDNS response' || packet.decodeStatus !== 'decoded' ||
      packet.sourcePort !== 5353 || packet.vlanIds?.length) return;
  return packet.dnsAnswers?.find(a => (a.type === 1 || a.type === 28) && a.value === packet.source &&
    typeof a.owner === 'string' && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.local$/i.test(a.owner));
}
