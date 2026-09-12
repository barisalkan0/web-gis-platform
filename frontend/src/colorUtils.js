function normalizeHex(color) {
  if (typeof color !== 'string') return null;
  const value = color.trim();
  const short = /^#([0-9a-f]{3})$/i.exec(value);
  if (short) return `#${short[1].split('').map((c) => `${c}${c}`).join('')}`;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

export function roleAccentStyle(color) {
  const hex = normalizeHex(color) || '#64748b';
  const value = Number.parseInt(hex.slice(1), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const perceivedLightness = (r * 299 + g * 587 + b * 114) / 1000;

  return {
    '--role-color': hex,
    borderColor: perceivedLightness > 222 ? '#94a3b8' : hex,
    backgroundColor: `rgba(${r}, ${g}, ${b}, 0.09)`,
    color: '#17233b',
  };
}

export function roleOptionStyle(color) {
  const accent = roleAccentStyle(color);
  return {
    '--role-color': accent['--role-color'],
    '--role-border': accent.borderColor,
    '--role-surface': accent.backgroundColor,
  };
}
