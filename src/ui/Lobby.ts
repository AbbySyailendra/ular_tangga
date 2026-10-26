import { CHARACTERS, type BoardPresetId } from '../config';
import { onLangChange, t } from '../i18n';
import type { NetworkClient, NetStatus } from '../network/NetworkClient';
import { MAX_PLAYERS, MIN_PLAYERS, ROOM_CODE_LENGTH, type RoomInfo } from '../network/protocol';
import { h, setVisible } from './dom';
import { icon } from './icons';

const BOARDS: BoardPresetId[] = ['easy', 'normal', 'chaos', 'random'];
const NAME_KEY = 'sl3d.playerName';
const CHAR_KEY = 'sl3d.playerChar';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');
const emojiOf = (id: string) => CHARACTERS.find((c) => c.id === id)?.emoji ?? '🎲';

/** Lobby online: buat / gabung room, daftar pemain (2–4), siap, pengaturan host, mulai. */
export class Lobby {
  readonly el = h('div', { class: 'screen lobby hidden' });
  private name = '';
  private character: string = CHARACTERS[0].id;
  private codeInput = '';
  private error = '';
  private errorTimer = 0;
  private copied = '';
  private visible = false;
  private busy = false;

  constructor(
    private net: NetworkClient,
    private cb: { onBack(): void },
  ) {
    try {
      this.name = localStorage.getItem(NAME_KEY) ?? '';
      const c = localStorage.getItem(CHAR_KEY);
      if (c && CHARACTERS.some((x) => x.id === c)) this.character = c;
    } catch {
      /* abaikan */
    }
    onLangChange(() => this.render());
    net.onStatus(() => this.render());
    net.on('joined', () => {
      this.busy = false;
      this.render();
    });
    net.on('room_state', () => this.render());
    net.on('left', () => this.render());
    net.on('error', ({ message, code }) => {
      this.busy = false;
      if (code !== 'rejoin_failed') this.showError(message);
      else this.render();
    });
  }

  show(prefillCode?: string): void {
    this.visible = true;
    if (prefillCode) this.codeInput = prefillCode.toUpperCase().slice(0, ROOM_CODE_LENGTH);
    this.net.connect();
    this.render();
    setVisible(this.el, true);
  }

  hide(): void {
    this.visible = false;
    setVisible(this.el, false);
  }

  /** Pesan singkat di lobby (mis. room bubar). */
  notify(message: string): void {
    this.showError(message);
  }

  private showError(message: string): void {
    this.error = message;
    this.render();
    window.clearTimeout(this.errorTimer);
    this.errorTimer = window.setTimeout(() => {
      this.error = '';
      this.render();
    }, 4500);
  }

  private saveProfile(): void {
    try {
      localStorage.setItem(NAME_KEY, this.name.trim());
      localStorage.setItem(CHAR_KEY, this.character);
    } catch {
      /* abaikan */
    }
  }

  // ───────────────────────── Render ─────────────────────────

  private render(): void {
    if (!this.visible) return;
    const room = this.net.room;
    const card = h(
      'div',
      { class: 'lobby-card' },
      this.statusBar(),
      room ? this.roomView(room) : this.entryView(),
      this.error ? h('div', { class: 'lobby-error', role: 'alert' }, this.error) : null,
    );
    // pertahankan fokus & posisi kursor pada input saat re-render
    const active = document.activeElement as HTMLInputElement | null;
    const focusId = active?.dataset?.focus;
    const caret = active?.selectionStart ?? null;
    this.el.replaceChildren(card);
    if (focusId) {
      const next = this.el.querySelector<HTMLInputElement>(`[data-focus="${focusId}"]`);
      next?.focus();
      if (next && caret !== null) next.setSelectionRange(caret, caret);
    }
  }

  private statusBar(): HTMLElement {
    const s: NetStatus = this.net.status;
    const label =
      s === 'connected' ? t('lobby.status.connected') : s === 'connecting' ? t('lobby.status.connecting') : t('lobby.status.disconnected');
    return h(
      'div',
      { class: 'lobby-head' },
      h('h2', null, icon('globe'), t('lobby.title')),
      h(
        'div',
        { class: `status-pill ${s}` },
        h('i'),
        label,
        s === 'disconnected' ? h('button', { class: 'pill-btn', onclick: () => this.net.connect() }, icon('refresh'), t('lobby.retry')) : null,
      ),
    );
  }

  private charPicker(taken: Set<string>, onPick: (id: string) => void): HTMLElement {
    return h(
      'div',
      { class: 'char-chips' },
      ...CHARACTERS.map((c) => {
        const blocked = taken.has(c.id);
        return h(
          'button',
          {
            class: `chip ${c.id === this.character ? 'active' : ''}`,
            disabled: blocked,
            title: t(`char.${c.id}`),
            'aria-label': t(`char.${c.id}`),
            onclick: () => onPick(c.id),
          },
          c.emoji,
        );
      }),
    );
  }

  // ───────────────────────── Sebelum masuk room ─────────────────────────

  private entryView(): HTMLElement {
    const online = this.net.status === 'connected';
    const nameInput = h('input', {
      type: 'text',
      class: 'text-input',
      maxlength: 14,
      placeholder: t('setup.namePlaceholder'),
      value: this.name,
      'data-focus': 'name',
      oninput: () => {
        this.name = nameInput.value;
      },
    });
    const codeInput = h('input', {
      type: 'text',
      class: 'text-input code-input',
      maxlength: ROOM_CODE_LENGTH,
      placeholder: t('lobby.codePlaceholder'),
      value: this.codeInput,
      autocapitalize: 'characters',
      autocomplete: 'off',
      spellcheck: false,
      'data-focus': 'code',
      oninput: () => {
        this.codeInput = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        codeInput.value = this.codeInput;
        joinBtn.disabled = !online || this.busy || this.codeInput.length < ROOM_CODE_LENGTH;
      },
      onkeydown: (e: Event) => {
        if ((e as KeyboardEvent).key === 'Enter' && !joinBtn.disabled) joinBtn.click();
      },
    });
    const create = h(
      'button',
      {
        class: 'btn primary big',
        disabled: !online || this.busy,
        onclick: () => {
          this.saveProfile();
          this.busy = true;
          this.net.send({ t: 'create_room', name: this.name, character: this.character });
        },
      },
      icon('plus'),
      t('lobby.create'),
    );
    const joinBtn = h(
      'button',
      {
        class: 'btn big',
        disabled: !online || this.busy || this.codeInput.length < ROOM_CODE_LENGTH,
        onclick: () => {
          this.saveProfile();
          this.busy = true;
          this.net.send({ t: 'join_room', code: this.codeInput, name: this.name, character: this.character });
        },
      },
      icon('users'),
      t('lobby.join'),
    );

    return h(
      'div',
      { class: 'lobby-body' },
      h('label', { class: 'field' }, h('span', null, t('setup.name')), nameInput),
      h('div', { class: 'field' }, h('span', null, t('setup.character')), this.charPicker(new Set(), (id) => {
        this.character = id;
        this.render();
      })),
      h(
        'div',
        { class: 'lobby-actions two' },
        h('div', { class: 'action-box' }, create),
        h(
          'div',
          { class: 'action-box' },
          h('span', { class: 'action-label' }, t('lobby.codeLabel')),
          h('div', { class: 'join-row' }, codeInput, joinBtn),
        ),
      ),
      h('div', { class: 'lobby-foot' }, h('button', { class: 'btn', onclick: () => this.cb.onBack() }, icon('back'), t('setup.back'))),
    );
  }

  // ───────────────────────── Di dalam room ─────────────────────────

  private roomView(room: RoomInfo): HTMLElement {
    const me = room.players.find((p) => p.id === this.net.myId);
    const isHost = room.hostId === this.net.myId;
    const taken = new Set(room.players.filter((p) => p.id !== this.net.myId).map((p) => p.character));
    const link = `${location.origin}${location.pathname}?room=${room.code}`;

    const copy = (what: 'code' | 'link') => {
      const text = what === 'code' ? room.code : link;
      const done = () => {
        this.copied = what;
        this.render();
        window.setTimeout(() => {
          this.copied = '';
          this.render();
        }, 1400);
      };
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, () => window.prompt('', text));
      else window.prompt('', text);
    };

    const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => {
      const p = room.players[i];
      if (!p) {
        return h('div', { class: 'slot empty' }, h('div', { class: 'slot-avatar' }, icon('users')), h('div', { class: 'slot-info' }, h('b', null, t('lobby.slot.empty'))));
      }
      const badges = [
        p.isHost ? h('span', { class: 'badge host' }, icon('crown'), t('lobby.host')) : null,
        p.id === this.net.myId ? h('span', { class: 'badge you' }, t('lobby.you')) : null,
        !p.connected ? h('span', { class: 'badge off' }, t('lobby.offline')) : p.isHost ? null : h('span', { class: `badge ${p.ready ? 'ok' : 'wait'}` }, p.ready ? t('lobby.ready') : t('lobby.notReady')),
      ];
      return h(
        'div',
        { class: `slot ${p.connected ? '' : 'offline'}`, style: { '--c': hex(p.color) } },
        h('div', { class: 'slot-avatar' }, emojiOf(p.character)),
        h('div', { class: 'slot-info' }, h('b', null, p.name), h('div', { class: 'badges' }, ...badges)),
      );
    });

    const settingsView = isHost
      ? h(
          'div',
          { class: 'room-settings' },
          h('div', { class: 'field' }, h('span', null, t('setup.board')), h('div', { class: 'seg' }, ...BOARDS.map((b) =>
            h('button', {
              class: `seg-btn ${room.settings.boardPreset === b ? 'active' : ''}`,
              onclick: () => this.net.send({ t: 'settings', boardPreset: b }),
            }, t(`board.${b}`)),
          ))),
          this.toggle(t('setup.sixAgain'), room.settings.options.sixRollsAgain, (v) => this.net.send({ t: 'settings', options: { sixRollsAgain: v } })),
          this.toggle(t('setup.exact'), room.settings.options.exactFinish, (v) => this.net.send({ t: 'settings', options: { exactFinish: v } })),
        )
      : h(
          'div',
          { class: 'room-settings readonly' },
          h('span', { class: 'hint' }, t('lobby.settingsReadonly')),
          h('div', { class: 'chips-line' },
            h('span', { class: 'tag' }, t('setup.board') + ': ' + t(`board.${room.settings.boardPreset}`)),
            h('span', { class: 'tag' }, (room.settings.options.sixRollsAgain ? '✓ ' : '✗ ') + t('setup.sixAgain')),
            h('span', { class: 'tag' }, (room.settings.options.exactFinish ? '✓ ' : '✗ ') + t('setup.exact')),
          ),
        );

    // tombol & petunjuk aksi utama
    const count = room.players.length;
    const allConnected = room.players.every((p) => p.connected);
    const othersReady = room.players.every((p) => p.isHost || p.ready);
    let hint: string;
    let canStart = false;
    if (isHost) {
      if (count < MIN_PLAYERS) hint = t('lobby.hint.min');
      else if (!allConnected) hint = t('lobby.hint.offline');
      else if (!othersReady) hint = t('lobby.hint.notReady');
      else {
        hint = t('lobby.hint.ready');
        canStart = true;
      }
    } else {
      hint = me?.ready ? t('lobby.hint.hostWait') : '';
    }

    const primary = isHost
      ? h('button', { class: 'btn primary big', disabled: !canStart, onclick: () => this.net.send({ t: 'start_game' }) }, icon('play'), t('lobby.start'))
      : h(
          'button',
          { class: `btn big ${me?.ready ? '' : 'primary'}`, onclick: () => this.net.send({ t: 'ready', ready: !me?.ready }) },
          icon(me?.ready ? 'refresh' : 'check'),
          me?.ready ? t('lobby.cancelReady') : t('lobby.readyBtn'),
        );

    return h(
      'div',
      { class: 'lobby-body' },
      h(
        'div',
        { class: 'room-code-box' },
        h('div', { class: 'room-code-text' }, h('span', { class: 'action-label' }, t('lobby.share')), h('div', { class: 'room-code' }, room.code)),
        h(
          'div',
          { class: 'room-code-actions' },
          h('button', { class: 'btn sm', onclick: () => copy('code') }, icon(this.copied === 'code' ? 'check' : 'copy'), this.copied === 'code' ? t('lobby.copied') : t('lobby.copyCode')),
          h('button', { class: 'btn sm', onclick: () => copy('link') }, icon(this.copied === 'link' ? 'check' : 'link'), this.copied === 'link' ? t('lobby.copied') : t('lobby.copyLink')),
        ),
      ),
      h('div', { class: 'field' }, h('span', null, t('lobby.players', { n: count, max: MAX_PLAYERS })), h('div', { class: 'slots' }, ...slots)),
      h('div', { class: 'field' }, h('span', null, t('lobby.myChar')), this.charPicker(taken, (id) => {
        this.character = id;
        this.saveProfile();
        this.net.send({ t: 'set_character', character: id });
      })),
      h('div', { class: 'field' }, h('span', null, t('lobby.settings')), settingsView),
      h('div', { class: 'lobby-hint' }, hint),
      h(
        'div',
        { class: 'lobby-foot' },
        h('button', { class: 'btn', onclick: () => this.leave() }, icon('exit'), t('lobby.leave')),
        primary,
      ),
    );
  }

  private leave(): void {
    this.net.leave();
    this.render();
  }

  private toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const input = h('input', { type: 'checkbox', onchange: () => onChange(input.checked) });
    input.checked = checked;
    return h('label', { class: 'toggle' }, input, h('span', { class: 'switch' }), h('span', null, label));
  }
}
