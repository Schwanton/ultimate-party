import os from 'node:os';

/** Beste lokale IP-Adresse im WLAN finden (für QR-Code und Beitritts-Link). */
export function lanAddress(): string {
  const candidates: { addr: string; score: number }[] = [];
  for (const [name, list] of Object.entries(os.networkInterfaces())) {
    for (const ni of list ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      let score = 0;
      if (ni.address.startsWith('192.168.')) score += 3;
      else if (ni.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ni.address)) score += 1;
      if (/^(en|wl|wlan|eth|Wi-Fi|WLAN)/i.test(name)) score += 1;
      if (/(docker|veth|vbox|vmnet|utun|bridge)/i.test(name)) score -= 5;
      candidates.push({ addr: ni.address, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.addr ?? 'localhost';
}
