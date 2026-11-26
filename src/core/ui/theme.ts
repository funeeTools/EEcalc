/**
 * Colour theme: light / dark / follow the system.
 *
 * The CSS palette switches on <html data-theme="dark">. Canvas plots draw with literal colours
 * chosen for a light background, so `themed()` lightens dark ones when the dark theme is on;
 * calculators keep specifying one set of colours. Plots redraw on the `ee:theme` window event.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
let pref: ThemePref = 'system';
let current: Theme = 'light';

export function currentTheme(): Theme {
  return current;
}

export function themePref(): ThemePref {
  return pref;
}

/** Apply a theme preference (does not persist it — see core/settings). */
export function applyTheme(p: ThemePref): void {
  pref = p;
  const next: Theme = p === 'system' ? (media?.matches ? 'dark' : 'light') : p;
  const changed = next !== current || document.documentElement.dataset.theme !== next;
  current = next;
  document.documentElement.dataset.theme = next;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'dark' ? '#0c2229' : '#1a4250');
  if (changed) window.dispatchEvent(new CustomEvent('ee:theme', { detail: next }));
}

media?.addEventListener('change', () => {
  if (pref === 'system') applyTheme('system');
});

const cache = new Map<string, string>();

/** A plot colour adjusted for the current theme (unchanged in light mode). */
export function themed(color: string): string;
export function themed(color: string | undefined): string | undefined;
export function themed(color: string | undefined): string | undefined {
  if (!color || current === 'light') return color;
  let out = cache.get(color);
  if (out === undefined) {
    out = lighten(color);
    cache.set(color, out);
  }
  return out;
}

/** Raise the lightness of a dark colour (hue and alpha kept); colours already light are untouched. */
function lighten(color: string): string {
  const rgba = parseColor(color);
  if (!rgba) return color;
  const [r, g, b, a] = rgba;
  const [hh, s, l] = rgbToHsl(r, g, b);
  if (l >= 0.6) return color;
  const l2 = 0.6 + l * 0.3;
  const s2 = Math.min(s * 1.05, 0.75);
  const [r2, g2, b2] = hslToRgb(hh, s2, l2);
  return a < 1 ? `rgba(${r2}, ${g2}, ${b2}, ${a})` : `rgb(${r2}, ${g2}, ${b2})`;
}

function parseColor(c: string): [number, number, number, number] | null {
  let m = c.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const hex = m[1].length === 3 ? m[1].replace(/./g, (x) => x + x) : m[1];
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16), 1];
  }
  m = c.trim().match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
  return null;
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hh = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [hh / 6, s, l];
}

function hslToRgb(hh: number, s: number, l: number): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [Math.round(f(hh + 1 / 3) * 255), Math.round(f(hh) * 255), Math.round(f(hh - 1 / 3) * 255)];
}
