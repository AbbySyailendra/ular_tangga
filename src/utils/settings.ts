export type Lang = 'id' | 'en';
export type QualityTier = 'high' | 'medium' | 'low';
export type QualitySetting = 'auto' | QualityTier;

export interface Settings {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  lang: Lang;
  quality: QualitySetting;
  highContrast: boolean;
  reducedMotion: boolean;
  fastBots: boolean;
}

const KEY = 'sl3d.settings';

const prefersReduced =
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const DEFAULTS: Settings = {
  master: 0.8,
  music: 0.6,
  sfx: 0.9,
  muted: false,
  lang: 'id',
  quality: 'auto',
  highContrast: false,
  reducedMotion: prefersReduced,
  fastBots: false,
};

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* localStorage tidak tersedia */
  }
  return { ...DEFAULTS };
}

type Listener = (s: Settings, changed: keyof Settings) => void;

class SettingsStore {
  private data: Settings = load();
  private listeners = new Set<Listener>();

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.data[key];
  }

  all(): Readonly<Settings> {
    return this.data;
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* abaikan */
    }
    this.listeners.forEach((fn) => fn(this.data, key));
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settings = new SettingsStore();

/** Preset kualitas efektif: 'auto' memilih Low untuk perangkat lemah. */
export function effectiveQuality(): QualityTier {
  const q = settings.get('quality');
  if (q !== 'auto') return q;
  const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  const weak = (navigator.hardwareConcurrency ?? 8) <= 4;
  return mobile && weak ? 'low' : 'high';
}
