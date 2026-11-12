import dgram from 'node:dgram';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DATA_DIR, PORT } from './config';

/** Virtuelle Adapter (VPN, Docker, VMs, Apple-Direktverbindungen) – dort sind Handys nie */
const VIRTUAL = /(docker|veth|vbox|vmnet|utun|bridge|tun|tap|ppp|ipsec|awdl|llw|anpi|ap\d|gif|stf|zt|tailscale|wg)/i;

type Candidate = { name: string; addr: string; score: number };

function candidates(): Candidate[] {
  const list: Candidate[] = [];
  for (const [name, nis] of Object.entries(os.networkInterfaces())) {
    for (const ni of nis ?? []) {
      if (ni.family !== 'IPv4' || ni.internal) continue;
      if (ni.address.startsWith('169.254.')) continue; // keine echte Adresse (kein DHCP)
      let score = 0;
      if (ni.address.startsWith('192.168.')) score += 3;
      else if (ni.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ni.address)) score += 1;
      if (/^(en|wl|wlan|eth|Wi-Fi|WLAN)/i.test(name)) score += 1;
      if (VIRTUAL.test(name)) score -= 10;
      list.push({ name, addr: ni.address, score });
    }
  }
  return list.sort((a, b) => b.score - a.score);
}

/**
 * Die Adresse, über die das Betriebssystem gerade wirklich ins Netz geht (Standard-Route).
 * Ein UDP-"connect" schickt kein einziges Paket, verrät aber die gewählte lokale Adresse.
 */
let routeIp: string | null = null;
function probeRoute(): void {
  const sock = dgram.createSocket('udp4');
  sock.on('error', () => { routeIp = null; sock.close(); });
  try {
    sock.connect(53, '1.1.1.1', () => {
      try {
        const ip = sock.address().address;
        routeIp = ip && ip !== '0.0.0.0' ? ip : null;
      } catch { routeIp = null; }
      sock.close();
    });
  } catch {
    routeIp = null;
    try { sock.close(); } catch { /* egal */ }
  }
}

/** Beste lokale IP-Adresse im WLAN finden (für QR-Code und Beitritts-Link). */
export function lanAddress(): string {
  const list = candidates();
  // Standard-Route nehmen – aber nur, wenn sie zu einem echten (nicht virtuellen) Adapter gehört
  const viaRoute = list.find((c) => c.addr === routeIp && !VIRTUAL.test(c.name));
  return viaRoute?.addr ?? list.find((c) => c.score > -5)?.addr ?? list[0]?.addr ?? 'localhost';
}

/**
 * Beitritts-Adresse für die Handys – wird jedes Mal neu ermittelt, damit ein WLAN-Wechsel
 * ohne Neustart funktioniert. Feste Adresse erzwingen: UP_HOST=192.168.0.42 npm start
 */
export function joinBaseUrl(): string {
  const host = process.env.UP_HOST?.trim() || lanAddress();
  return `http://${host}:${PORT}`;
}

/** Alle Adressen in .up-data/netzwerk.txt schreiben (zur Fehlersuche) */
function writeDiagnose(): void {
  const lines = [
    `Zeit: ${new Date().toISOString()}`,
    `Standard-Route: ${routeIp ?? '(keine)'}`,
    `UP_HOST: ${process.env.UP_HOST ?? '(nicht gesetzt)'}`,
    `Gewählt: ${joinBaseUrl()}`,
    '',
    'Alle Adressen:',
    ...candidates().map((c) => `  ${c.name.padEnd(12)} ${c.addr.padEnd(16)} Punkte ${c.score}`),
  ];
  try { fs.writeFileSync(path.join(DATA_DIR, 'netzwerk.txt'), lines.join('\n') + '\n'); } catch { /* egal */ }
}

/** Beim Start einmal die Standard-Route ermitteln (kurz warten, max. 1 s) */
export function initNetwork(): Promise<void> {
  probeRoute();
  return new Promise((resolve) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (routeIp || Date.now() - t0 > 1000) {
        clearInterval(iv);
        writeDiagnose();
        resolve();
      }
    }, 50);
  });
}

/** Alle 5 Sekunden prüfen, ob sich die Adresse geändert hat (z. B. anderes WLAN). */
export function watchJoinBaseUrl(onChange: (url: string) => void): void {
  let last = joinBaseUrl();
  setInterval(() => {
    probeRoute();
    setTimeout(() => {
      const now = joinBaseUrl();
      if (now !== last) {
        last = now;
        writeDiagnose();
        onChange(now);
      }
    }, 300);
  }, 5000).unref();
}
