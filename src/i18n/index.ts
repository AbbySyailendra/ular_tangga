import id from './id.json';
import en from './en.json';
import { settings, type Lang } from '../utils/settings';

const DICTS: Record<Lang, Record<string, string>> = { id, en };

/** Terjemahan sederhana dengan placeholder {nama}. Fallback: Indonesia, lalu key. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const lang = settings.get('lang');
  let s = DICTS[lang][key] ?? DICTS.id[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function onLangChange(fn: () => void): () => void {
  return settings.subscribe((_s, changed) => {
    if (changed === 'lang') fn();
  });
}
