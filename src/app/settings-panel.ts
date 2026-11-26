/**
 * Settings overlay (⚙ in the header): theme, preferred display units, input behaviour, stored data.
 * Every control writes straight to core/settings, which notifies the open calculator.
 */

import { h, clear } from '@/core/ui/dom';
import { clearSavedInputs, onSettings, resetSettings, settings, UNIT_FAMILIES, updateSettings, type Settings } from '@/core/settings';
import type { ThemePref } from '@/core/ui/theme';

export class SettingsPanel {
  readonly el: HTMLElement;
  private body: HTMLElement;
  private status: HTMLElement;

  constructor() {
    this.body = h('div', { class: 'settings-body' });
    this.status = h('span', { class: 'settings-status' });
    const panel = h(
      'div',
      { class: 'settings-panel', role: 'dialog', 'aria-label': 'Settings' },
      h('div', { class: 'settings-head' }, h('h2', null, 'Settings'), h('button', { class: 'finder-close', type: 'button', onclick: () => this.close(), 'aria-label': 'Close' }, '✕')),
      this.body,
      h(
        'div',
        { class: 'settings-foot' },
        this.status,
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', onclick: () => resetSettings() }, 'Restore default settings'),
      ),
    );
    this.el = h('div', { class: 'finder settings-overlay', hidden: true, onclick: (e: MouseEvent) => e.target === this.el && this.close() }, panel);
    this.el.addEventListener('keydown', (e) => e.key === 'Escape' && this.close());
    onSettings(() => !this.el.hidden && this.render());
  }

  open(): void {
    this.status.textContent = '';
    this.render();
    this.el.hidden = false;
    this.body.querySelector<HTMLElement>('button, select, input')?.focus();
  }

  close(): void {
    this.el.hidden = true;
  }

  private render(): void {
    const s = settings();
    clear(this.body);

    const seg = <T extends string>(value: T, options: [T, string][], set: (v: T) => void) =>
      h(
        'div',
        { class: 'seg' },
        ...options.map(([v, label]) => h('button', { class: `seg-btn${v === value ? ' active' : ''}`, type: 'button', onclick: () => set(v) }, label)),
      );
    const row = (label: string, help: string, control: HTMLElement) =>
      h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, h('div', null, label), help ? h('div', { class: 'set-help' }, help) : null), control);
    const check = (key: 'remember' | 'confirmReset') =>
      h('input', { type: 'checkbox', class: 'set-check', checked: s[key], onchange: (e: Event) => updateSettings({ [key]: (e.target as HTMLInputElement).checked } as Partial<Settings>) });

    this.body.append(
      h('h3', { class: 'set-title' }, 'Appearance'),
      row('Theme', 'System follows your OS setting. The ☾ / ☀ button in the header switches directly.', seg<ThemePref>(s.theme, [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], (theme) => updateSettings({ theme }))),

      h('h3', { class: 'set-title' }, 'Preferred units'),
      h('p', { class: 'set-note' }, 'Default unit for each kind of input on every calculator. “Auto” keeps the calculator’s own choice. Changing one also converts the open calculator; you can still pick another unit per field.'),
      ...UNIT_FAMILIES.map((fam) => {
        const sel = h('select', { class: 'f-select set-select', onchange: () => updateSettings({ units: { [fam.key]: sel.value } as Settings['units'] }) });
        for (const u of fam.options) sel.appendChild(h('option', { value: u }, u === 'auto' ? 'Auto' : u));
        sel.value = s.units[fam.key];
        return row(fam.label, fam.help, sel);
      }),

      h('h3', { class: 'set-title' }, 'Inputs'),
      row('Digits in input boxes', 'Significant figures shown for values you typed or that were converted.', seg(String(s.inputDigits), [['4', '4'], ['5', '5'], ['6', '6'], ['8', '8']], (v) => updateSettings({ inputDigits: Number(v) }))),
      row('Confirm before Reset', 'Ask before the Reset button discards a calculator’s inputs.', check('confirmReset')),
      row('Remember inputs', 'Keep each calculator’s inputs in this browser between visits. Nothing is ever sent anywhere.', check('remember')),
      row(
        'Saved inputs',
        'Delete every calculator’s saved inputs from this browser.',
        h(
          'button',
          {
            class: 'btn btn-small',
            type: 'button',
            onclick: () => {
              if (!confirm('Delete the saved inputs of every calculator? The open page keeps its current values until you reset it.')) return;
              const n = clearSavedInputs();
              this.status.textContent = `Cleared ${n} saved calculator${n === 1 ? '' : 's'}.`;
            },
          },
          'Clear saved inputs',
        ),
      ),
    );
  }
}
