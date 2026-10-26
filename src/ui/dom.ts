type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown> | null;

/** Pembuat elemen kecil: h('div', { class: 'x', onclick: fn }, child, ...) */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Props,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = String(value);
      else if (key === 'style' && typeof value === 'object') {
        for (const [prop, v] of Object.entries(value as Record<string, string>)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, v);
          else (el.style as unknown as Record<string, string>)[prop] = v;
        }
      }
      else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' ? c : document.createTextNode(String(c)));
  }
}

export function setVisible(el: HTMLElement, visible: boolean): void {
  el.classList.toggle('hidden', !visible);
}
