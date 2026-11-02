import type { CSSProperties, ReactNode } from 'react';
import type { Animal, Avatar as AvatarData, PlayerInfo } from '@up/sdk';
import { net } from '../net';

const SHADES: Record<string, string> = {
  '#E8336F': '#A81B4B', '#36D6F5': '#1A97B0', '#FFD447': '#C79E1A', '#9B7BFF': '#6B4FD1', '#4BE3A1': '#23A872',
  '#FF9F43': '#C46F1C', '#FF7EB6': '#C24F86', '#5B8CFF': '#2F5ECC', '#C6F432': '#8FB516', '#FF5A4E': '#C22E24',
  '#2EC4B6': '#178F84', '#C29BFF': '#8B66D6', '#262048': '#0A0716',
};

const INK = '#110D24';

const ANIMAL_ART: Record<Animal, ReactNode> = {
  panda: (
    <>
      <circle cx="15" cy="17" r="8" fill={INK} /><circle cx="49" cy="17" r="8" fill={INK} />
      <circle cx="32" cy="36" r="21" fill="#FFFFFF" stroke={INK} strokeWidth="2.5" />
      <ellipse cx="23.5" cy="34" rx="5.5" ry="7.5" transform="rotate(-25 23.5 34)" fill={INK} />
      <ellipse cx="40.5" cy="34" rx="5.5" ry="7.5" transform="rotate(25 40.5 34)" fill={INK} />
      <circle cx="24.5" cy="33" r="2" fill="#FFFFFF" /><circle cx="39.5" cy="33" r="2" fill="#FFFFFF" />
      <ellipse cx="32" cy="44" rx="4" ry="3" fill={INK} />
      <path d="M28 49c2 2 6 2 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  tiger: (
    <>
      <circle cx="14" cy="18" r="7" fill="#FF9F43" stroke={INK} strokeWidth="2.5" /><circle cx="50" cy="18" r="7" fill="#FF9F43" stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="36" r="21" fill="#FF9F43" stroke={INK} strokeWidth="2.5" />
      <path d="M32 16v7M25 18l2 6M39 18l-2 6M12 33h7M13 39h6M52 33h-7M51 39h-6" stroke={INK} strokeWidth="3" strokeLinecap="round" fill="none" />
      <ellipse cx="32" cy="46" rx="11" ry="8" fill="#FFFFFF" />
      <circle cx="24" cy="33" r="2.5" fill={INK} /><circle cx="40" cy="33" r="2.5" fill={INK} />
      <path d="M28 41h8l-4 4z" fill={INK} />
      <path d="M32 45v3M28 50c2 1 6 1 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  roterpanda: (
    <>
      <path d="M9 23 L13 8 L24 16 Z" fill="#E8662E" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M55 23 L51 8 L40 16 Z" fill="#E8662E" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <ellipse cx="32" cy="37" rx="23" ry="20" fill="#E8662E" stroke={INK} strokeWidth="2.5" />
      <ellipse cx="23" cy="27" rx="5" ry="3" fill="#FFFFFF" /><ellipse cx="41" cy="27" rx="5" ry="3" fill="#FFFFFF" />
      <path d="M21 37c0 5 1 8 3 10M43 37c0 5-1 8-3 10" stroke="#8A2E12" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="46" rx="10" ry="7" fill="#FFFFFF" />
      <circle cx="23" cy="35" r="2.5" fill={INK} /><circle cx="41" cy="35" r="2.5" fill={INK} />
      <ellipse cx="32" cy="43" rx="3" ry="2" fill={INK} />
      <path d="M29 48c2 2 4 2 6 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  axolotl: (
    <>
      <path d="M13 28c-5-3-7-8-7-8M12 34c-6 0-9-2-9-2M13 40c-5 3-7 6-7 6M51 28c5-3 7-8 7-8M52 34c6 0 9-2 9-2M51 40c5 3 7 6 7 6" stroke="#E8336F" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="36" rx="21" ry="16" fill="#FFB3C7" stroke={INK} strokeWidth="2.5" />
      <circle cx="19" cy="40" r="2.5" fill="#E8336F" opacity="0.5" /><circle cx="45" cy="40" r="2.5" fill="#E8336F" opacity="0.5" />
      <circle cx="23" cy="33" r="2.8" fill={INK} /><circle cx="41" cy="33" r="2.8" fill={INK} />
      <path d="M25 42c4 4 10 4 14 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  schneeleopard: (
    <>
      <circle cx="16" cy="19" r="7" fill="#E6E9F2" stroke={INK} strokeWidth="2.5" /><circle cx="48" cy="19" r="7" fill="#E6E9F2" stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="36" r="21" fill="#E6E9F2" stroke={INK} strokeWidth="2.5" />
      <g fill="none" stroke={INK} strokeWidth="2">
        <circle cx="22" cy="23" r="2.5" /><circle cx="42" cy="23" r="2.5" /><circle cx="32" cy="20" r="2" /><circle cx="16" cy="38" r="2.5" /><circle cx="48" cy="38" r="2.5" />
      </g>
      <ellipse cx="24" cy="34" rx="2.5" ry="3" fill={INK} /><ellipse cx="40" cy="34" rx="2.5" ry="3" fill={INK} />
      <path d="M28 41h8l-4 4z" fill="#E8336F" stroke={INK} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M32 45v2M28 49c2 1 6 1 8 0" stroke={INK} strokeWidth="2" fill="none" strokeLinecap="round" />
    </>
  ),
  nashorn: (
    <>
      <ellipse cx="16" cy="19" rx="4" ry="7" transform="rotate(-30 16 19)" fill="#9AA0B8" stroke={INK} strokeWidth="2.5" />
      <ellipse cx="48" cy="19" rx="4" ry="7" transform="rotate(30 48 19)" fill="#9AA0B8" stroke={INK} strokeWidth="2.5" />
      <rect x="12" y="20" width="40" height="40" rx="18" fill="#9AA0B8" stroke={INK} strokeWidth="2.5" />
      <circle cx="20" cy="34" r="2.5" fill={INK} /><circle cx="44" cy="34" r="2.5" fill={INK} />
      <path d="M27 47 L32 25 L37 47 Z" fill="#F4F1E8" stroke={INK} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="26" cy="53" r="1.8" fill={INK} /><circle cx="38" cy="53" r="1.8" fill={INK} />
    </>
  ),
  orangutan: (
    <>
      <circle cx="32" cy="34" r="22" fill="#D9692B" stroke={INK} strokeWidth="2.5" />
      <path d="M25 12l3 6M32 10v7M39 12l-3 6" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <ellipse cx="15" cy="38" rx="5" ry="9" fill="#B8521C" stroke={INK} strokeWidth="2" />
      <ellipse cx="49" cy="38" rx="5" ry="9" fill="#B8521C" stroke={INK} strokeWidth="2" />
      <ellipse cx="32" cy="38" rx="14" ry="15" fill="#F2B48A" stroke={INK} strokeWidth="2" />
      <circle cx="26" cy="32" r="2.5" fill={INK} /><circle cx="38" cy="32" r="2.5" fill={INK} />
      <circle cx="30" cy="40" r="1.3" fill={INK} /><circle cx="34" cy="40" r="1.3" fill={INK} />
      <path d="M25 46c4 4 10 4 14 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
  schildkroete: (
    <>
      <ellipse cx="32" cy="58" rx="27" ry="15" fill="#2E8F63" stroke={INK} strokeWidth="2.5" />
      <path d="M14 52l8 4 10-4 10 4 8-4" stroke={INK} strokeWidth="2" fill="none" strokeLinejoin="round" />
      <ellipse cx="32" cy="32" rx="16" ry="17" fill="#4BE3A1" stroke={INK} strokeWidth="2.5" />
      <circle cx="32" cy="20" r="2" fill="#2E8F63" /><circle cx="25" cy="23" r="1.5" fill="#2E8F63" /><circle cx="39" cy="23" r="1.5" fill="#2E8F63" />
      <circle cx="26" cy="30" r="2.8" fill={INK} /><circle cx="38" cy="30" r="2.8" fill={INK} />
      <circle cx="27" cy="29" r="0.9" fill="#FFFFFF" /><circle cx="39" cy="29" r="0.9" fill="#FFFFFF" />
      <path d="M26 39c3 3 9 3 12 0" stroke={INK} strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </>
  ),
};

export interface AvatarProps {
  player?: PlayerInfo;
  avatar?: AvatarData;
  color?: string;
  size?: number;
  /** Schatten unten (Spielstein-Look) */
  flat?: boolean;
  dim?: boolean;
  title?: string;
}

export function Avatar({ player, avatar, color, size = 64, flat, dim, title }: AvatarProps) {
  const a = avatar ?? player?.avatar ?? { kind: 'animal', animal: 'panda' };
  const bg = color ?? player?.color ?? '#36D6F5';
  const drop = flat ? 0 : Math.max(2, Math.round(size / 16));
  const style: CSSProperties = {
    width: size, height: size, flex: 'none', borderRadius: '50%', overflow: 'hidden', display: 'inline-flex',
    background: bg, boxShadow: drop ? `0 ${drop}px 0 ${SHADES[bg] ?? '#0A0716'}` : undefined,
    opacity: dim ? 0.4 : 1, filter: player && !player.connected && !player.isBot ? 'grayscale(1)' : undefined,
  };
  const label = title ?? player?.name;
  if (a.kind === 'photo' && player) {
    const code = net.state.room?.code;
    return (
      <span style={style} role="img" aria-label={label}>
        <img src={`/photo/${code}/${player.id}?v=${a.version}`} alt="" width={size} height={size} style={{ objectFit: 'cover', width: '100%', height: '100%' }} />
      </span>
    );
  }
  const animal = a.kind === 'animal' ? a.animal : 'panda';
  return (
    <span style={style} role="img" aria-label={label}>
      <svg width="100%" height="100%" viewBox="0 0 64 64" aria-hidden="true">{ANIMAL_ART[animal] ?? ANIMAL_ART.panda}</svg>
    </span>
  );
}

/** Krone für VIP oder Sieger */
export function Crown({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return (
    <svg width={size} height={size * 0.73} viewBox="0 0 30 22" aria-hidden="true" style={style}>
      <path d="M3 19 L5 5 L11 12 L15 3 L19 12 L25 5 L27 19 Z" fill="#FFD447" stroke="#110D24" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
