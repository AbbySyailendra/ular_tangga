import { onLangChange, t } from '../i18n';
import type { NetworkClient } from '../network/NetworkClient';
import { h, setVisible } from './dom';
import { icon } from './icons';

/**
 * Lapisan "Koneksi terputus, menyambung ulang…" yang tetap tampil selama pemain berada di room
 * tetapi soket belum tersambung. Menyambung ulang berjalan otomatis; tombol di sini hanya mempercepat
 * atau membatalkan.
 */
export class ConnectionOverlay {
  readonly el = h('div', { class: 'screen net-overlay hidden', role: 'alertdialog' });
  private shown = false;

  constructor(
    private net: NetworkClient,
    private cb: { onLeave(): void },
  ) {
    net.onStatus(() => this.update());
    net.on('joined', () => this.update());
    net.on('left', () => this.update());
    onLangChange(() => this.render());
  }

  /** Tampil bila ada room yang sedang diikuti tetapi koneksi belum tersambung. */
  update(): void {
    const show = this.net.inRoom && this.net.status !== 'connected';
    if (show === this.shown) {
      if (show) this.render(); // perbarui nomor percobaan
      return;
    }
    this.shown = show;
    if (show) this.render();
    setVisible(this.el, show);
  }

  private render(): void {
    const n = this.net.attempts;
    this.el.replaceChildren(
      h(
        'div',
        { class: 'net-card' },
        h('div', { class: 'spinner', 'aria-hidden': 'true' }),
        h('h3', null, t('net.lost')),
        h('p', null, n > 0 ? t('net.attempt', { n }) : t('net.keepOpen')),
        h(
          'div',
          { class: 'net-actions' },
          h('button', { class: 'btn primary', onclick: () => this.net.ensureConnected() }, icon('refresh'), t('net.retryNow')),
          h('button', { class: 'btn danger', onclick: () => this.cb.onLeave() }, icon('exit'), t('net.leave')),
        ),
      ),
    );
  }
}
