import { CHARACTERS, MAX_BOTS, type BoardPresetId } from '../config';
import type { GameConfig } from '../core/Game';
import { DEFAULT_OPTIONS } from '../core/Rules';
import { onLangChange, t } from '../i18n';
import { CharacterPreview } from './CharacterPreview';
import { h, setVisible } from './dom';
import { icon } from './icons';

const BOARDS: BoardPresetId[] = ['easy', 'normal', 'chaos', 'random'];
const NAME_KEY = 'sl3d.playerName';

/** Layar siapkan permainan: nama, karakter (pratinjau 3D), jumlah bot, papan, aturan. */
export class CharacterSelect {
  readonly el = h('div', { class: 'screen setup hidden' });
  private preview: CharacterPreview | null = null;
  private previewHost = h('div', { class: 'preview-host' });
  private config: GameConfig = {
    playerName: '',
    characterId: CHARACTERS[0].id,
    botCount: 1,
    boardPreset: 'normal',
    options: { ...DEFAULT_OPTIONS },
  };

  constructor(
    private cb: { onStart(config: GameConfig): void; onBack(): void },
  ) {
    try {
      this.config.playerName = localStorage.getItem(NAME_KEY) ?? '';
    } catch {
      /* abaikan */
    }
    this.render();
    onLangChange(() => this.render());
  }

  private ensurePreview(): CharacterPreview | null {
    if (this.preview) return this.preview;
    try {
      this.preview = new CharacterPreview();
      this.previewHost.append(this.preview.canvas);
      this.preview.setCharacter(this.config.characterId);
    } catch {
      this.preview = null; // WebGL kedua gagal: pratinjau dilewati, pilihan karakter tetap jalan
    }
    return this.preview;
  }

  private seg<T extends string | number>(
    values: T[],
    current: T,
    label: (v: T) => string,
    onPick: (v: T) => void,
  ): HTMLElement {
    const wrap = h('div', { class: 'seg' });
    for (const v of values) {
      wrap.append(
        h(
          'button',
          {
            class: `seg-btn ${v === current ? 'active' : ''}`,
            onclick: () => {
              onPick(v);
              this.render();
            },
          },
          label(v),
        ),
      );
    }
    return wrap;
  }

  private toggle(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
    const input = h('input', { type: 'checkbox', onchange: () => onChange(input.checked) });
    input.checked = checked;
    return h('label', { class: 'toggle' }, input, h('span', { class: 'switch' }), h('span', null, label));
  }

  private render(): void {
    const c = this.config;
    const cards = CHARACTERS.map((def) =>
      h(
        'button',
        {
          class: `char-card ${def.id === c.characterId ? 'active' : ''}`,
          onclick: () => {
            c.characterId = def.id;
            this.preview?.setCharacter(def.id);
            this.render();
          },
        },
        h('span', { class: 'char-emoji' }, def.emoji),
        h('b', null, t(`char.${def.id}`)),
        h('small', null, t(`char.${def.id}.trait`)),
      ),
    );

    const nameInput = h('input', {
      type: 'text',
      class: 'text-input',
      maxlength: 14,
      placeholder: t('setup.namePlaceholder'),
      value: c.playerName,
      oninput: () => {
        c.playerName = nameInput.value;
      },
    });

    this.el.replaceChildren(
      h(
        'div',
        { class: 'setup-card' },
        h('h2', null, t('setup.title')),
        h(
          'div',
          { class: 'setup-grid' },
          h('div', { class: 'setup-preview' }, this.previewHost, h('div', { class: 'preview-name' }, t(`char.${c.characterId}`))),
          h(
            'div',
            { class: 'setup-form' },
            h('label', { class: 'field' }, h('span', null, t('setup.name')), nameInput),
            h('div', { class: 'field' }, h('span', null, t('setup.character')), h('div', { class: 'char-grid' }, ...cards)),
            h(
              'div',
              { class: 'field' },
              h('span', null, t('setup.bots')),
              this.seg([1, 2, 3].slice(0, MAX_BOTS), c.botCount, (v) => String(v), (v) => (c.botCount = v)),
            ),
            h(
              'div',
              { class: 'field' },
              h('span', null, t('setup.board')),
              this.seg(BOARDS, c.boardPreset, (v) => t(`board.${v}`), (v) => (c.boardPreset = v)),
            ),
            h(
              'div',
              { class: 'field' },
              h('span', null, t('setup.rules')),
              this.toggle(t('setup.sixAgain'), c.options.sixRollsAgain, (v) => (c.options.sixRollsAgain = v)),
              this.toggle(t('setup.exact'), c.options.exactFinish, (v) => (c.options.exactFinish = v)),
            ),
          ),
        ),
        h(
          'div',
          { class: 'setup-actions' },
          h('button', { class: 'btn', onclick: () => this.cb.onBack() }, icon('back'), t('setup.back')),
          h(
            'button',
            {
              class: 'btn primary big',
              onclick: () => {
                try {
                  localStorage.setItem(NAME_KEY, c.playerName.trim());
                } catch {
                  /* abaikan */
                }
                this.cb.onStart(structuredClone(c));
              },
            },
            icon('dice'),
            t('setup.start'),
          ),
        ),
      ),
    );
  }

  show(): void {
    setVisible(this.el, true);
    this.ensurePreview()?.start();
  }

  hide(): void {
    setVisible(this.el, false);
    this.preview?.stop();
  }
}
