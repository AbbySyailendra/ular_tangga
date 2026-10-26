import { onLangChange, t } from '../i18n';
import { h, setVisible } from './dom';

export class Loading {
  readonly el = h('div', { class: 'screen loading' });
  private bar = h('i');
  private tip = h('p', { class: 'tip' });
  private title = h('h2');
  private tipIndex = Math.floor(Math.random() * 4);

  constructor() {
    this.el.append(
      h('div', { class: 'loading-dice' }, '🎲'),
      this.title,
      h('div', { class: 'progress' }, this.bar),
      this.tip,
    );
    this.render();
    onLangChange(() => this.render());
  }

  private render(): void {
    this.title.textContent = t('loading.title');
    this.tip.textContent = t(`loading.tip${(this.tipIndex % 4) + 1}`);
  }

  setProgress(p: number): void {
    this.bar.style.width = `${Math.round(p * 100)}%`;
  }

  hide(): void {
    setVisible(this.el, false);
    window.setTimeout(() => this.el.remove(), 600);
  }
}
