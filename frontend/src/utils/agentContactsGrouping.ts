import { AgentContact } from '../types/agentContacts';

export type AgentContactSortKey = 'name' | 'agency' | 'rec_count' | 'last_rec_at' | 'avg_performance_score' | 'avg_data_score';

// Letters NFD doesn't split into base letter + accent.
const EXTRA_FOLDS: Record<string, string> = { Ł: 'L', Ø: 'O', Æ: 'A', Đ: 'D', Œ: 'O', Þ: 'T', ß: 'S' };

/** Lower-cased text with accents removed, for accent-insensitive matching. */
export const foldText = (text: string): string =>
  Array.from((text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .map((ch) => EXTRA_FOLDS[ch.toUpperCase()] ?? ch)
    .join('')
    .toLowerCase();

/** Contact-book letter for a name: accents folded, upper-cased, anything not A–Z under '#'. */
export const contactLetter = (name: string): string => {
  const first = foldText((name || '').trim()).charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : '#';
};

const textOrder = (a: string | null, b: string | null, dir: 1 | -1) => {
  if (!a && !b) return 0;
  if (!a) return 1; // blanks always last
  if (!b) return -1;
  return a.localeCompare(b, 'en', { sensitivity: 'base' }) * dir;
};

export const compareContacts = (key: AgentContactSortKey, dir: 1 | -1) => (a: AgentContact, b: AgentContact): number => {
  if (key === 'name') {
    const aHash = contactLetter(a.name) === '#';
    const bHash = contactLetter(b.name) === '#';
    if (aHash !== bHash) return (aHash ? 1 : -1) * dir;
    return textOrder(a.name, b.name, dir);
  }
  if (key === 'agency') return textOrder(a.agency, b.agency, dir) || textOrder(a.name, b.name, 1);
  if (key === 'avg_performance_score' || key === 'avg_data_score') {
    const an = a[key] ?? null;
    const bn = b[key] ?? null;
    if (an === null || bn === null) return an === bn ? textOrder(a.name, b.name, 1) : an === null ? 1 : -1; // unscored last
    return an === bn ? textOrder(a.name, b.name, 1) : (an > bn ? 1 : -1) * dir;
  }
  const av = key === 'rec_count' ? a.rec_count : a.last_rec_at || '';
  const bv = key === 'rec_count' ? b.rec_count : b.last_rec_at || '';
  if (av === bv) return textOrder(a.name, b.name, 1);
  return (av > bv ? 1 : -1) * dir;
};

/**
 * An average data score as shown: rounded to a whole number, then given the band for that number,
 * the way the backend bands a score (backend/services/data_scores.py BANDS: 116/108/103/98/92).
 */
export const dataScoreDisplay = (average: number): { value: number; band: number } => {
  const value = Math.round(average);
  const band = value >= 116 ? 5 : value >= 108 ? 4 : value >= 103 ? 3 : value >= 98 ? 2 : value >= 92 ? 1 : 0;
  return { value, band };
};
