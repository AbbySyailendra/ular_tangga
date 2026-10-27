/** Pesan singkat melayang (mis. "Tersambung kembali"); tidak memblokir interaksi. */
export function toast(text: string, kind: 'info' | 'good' | 'bad' = 'info'): void {
  const root = document.getElementById('ui');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = text;
  root.append(el);
  window.setTimeout(() => el.classList.add('out'), 3000);
  window.setTimeout(() => el.remove(), 3500);
}
