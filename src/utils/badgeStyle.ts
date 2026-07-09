import type { CSSProperties } from 'react';

// WCAG relative luminance — used to pick chip text that reads against any
// admin-chosen badge color, regardless of the site's light/dark theme.
function relLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map(c => c + c).join('') : clean;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16) / 255);
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrastRatio(l1: number, l2: number): number {
  const [a, b] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (a + 0.05) / (b + 0.05);
}

// Black or white, whichever contrasts better against the given hex background.
function bestTextColor(hex: string): string {
  const lum = relLuminance(hex);
  return contrastRatio(lum, 1) >= contrastRatio(lum, 0) ? '#ffffff' : '#0a0a0a';
}

// Badge chips use the admin-picked color as a solid fill (not just a text/
// border tint on a transparent, page-inherited background), so legibility no
// longer depends on the site's light/dark theme — only on the color chosen.
export function badgeChipStyle(color: string | null | undefined): CSSProperties | undefined {
  if (!color) return undefined;
  return { background: color, borderColor: color, color: bestTextColor(color) };
}
