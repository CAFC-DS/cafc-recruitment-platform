import { AgentContact } from '../types/agentContacts';

export type AgentContactSortKey = 'name' | 'agency' | 'rec_count' | 'last_rec_at';

/** Contact-book letter for a name: accents folded, upper-cased, anything not A–Z under '#'. */
export const contactLetter = (name: string): string => {
  const first = (name || '').trim().normalize('NFD').charAt(0).toUpperCase();
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
  const av = key === 'rec_count' ? a.rec_count : a.last_rec_at || '';
  const bv = key === 'rec_count' ? b.rec_count : b.last_rec_at || '';
  if (av === bv) return textOrder(a.name, b.name, 1);
  return (av > bv ? 1 : -1) * dir;
};
