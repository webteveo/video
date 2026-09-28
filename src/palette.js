// One palette for the whole reel: ink + paper, one signal colour, two supporting accents.
export const C = {
  INK: '#0B0B0E',
  INK2: '#16161B',
  PAPER: '#F3EFE6',
  SIGNAL: '#FF5A1F',
  COBALT: '#2340FF',
  ACID: '#D7FF3A',
  BLUSH: '#FF8FB1',
  GREY: '#7C7C86',
};

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
}
const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
export const lin = (hex) => hexToRgb(hex).map(s2l);
export const rgba = (hex, a = 1) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r * 255 | 0},${g * 255 | 0},${b * 255 | 0},${a})`; };
export function mixHex(a, b, t) {
  const A = hexToRgb(a), B = hexToRgb(b);
  return `rgb(${A.map((v, i) => Math.round((v + (B[i] - v) * t) * 255)).join(',')})`;
}
