/**
 * Declarative input forms. A calculator describes its inputs as data; the form renders them,
 * keeps a plain JSON state object (SI units), and calls onChange.
 *
 * Number fields accept engineering notation ("4k7", "2.2u", "10n", "1e-3").
 *  - `unit`  : SI unit shown with an auto prefix (value 4.7e-6, unit 'F' → "4.7µ F")
 *  - `units` : a unit dropdown (mm / mil / in …), choice stored in state[unitKey]
 *  - `suffix`: fixed text after the box ("°C", "oz/ft²")
 */

import { engString, parseEng } from '@/core/units';
import { h, clear, symNodes } from '@/core/ui/dom';
import { preferredUnit, settings, type UnitFamily } from '@/core/settings';
import { unitFamily } from '@/core/unitsets';

/** The unit-preference family of a number field with a unit dropdown. */
export function familyOf(f: NumberField): UnitFamily | undefined {
  if (!f.units || f.unitFamily === 'none') return undefined;
  return f.unitFamily ?? unitFamily(f.units);
}

/**
 * A limit shown in another unit is rounded ("9549300 rpm" for 1e6 rad/s), so typing what the page
 * shows can land a hair outside it. Values within 10 ppm of a limit (6 shown digits) snap to it.
 */
export function snapToLimit(v: number, min?: number, max?: number): number {
  const near = (lim: number) => Math.abs(v - lim) <= 1e-5 * Math.max(Math.abs(lim), Math.abs(v));
  if (min != null && v < min && near(min)) return min;
  if (max != null && v > max && near(max)) return max;
  return v;
}

type Scope = Record<string, any>;
export type ChangeKind = 'value' | 'setting';
type Pred = (scope: Scope, root: Scope) => boolean;

interface Base {
  visible?: Pred;
  enabled?: Pred;
  help?: string;
}

export interface NumberField extends Base {
  kind: 'number';
  key: string;
  label: string;
  /** Equation symbol shown before the label ("Z₀", "W", "εᵣ") */
  symbol?: string;
  /** SI unit. Without `units`, values are shown with an auto SI prefix ("4.7µ F"). */
  unit?: string;
  /** Unit dropdown: label → multiplier to SI. Choice stored in scope[unitKey] (default `${key}Unit`). */
  units?: Record<string, number>;
  unitKey?: string;
  /** Default unit choice when scope[unitKey] is missing */
  defaultUnit?: string;
  /** Global unit-preference family; default from the unit table's tag (core/unitsets), 'none' opts out */
  unitFamily?: UnitFamily | 'none';
  /** Can be made the unknown in a solve-for-X calculator (root.solveFor === key) */
  solvable?: boolean;
  /** Always computed, never typed (pure result row inside the inputs list) */
  output?: boolean;
  /** Custom "is this the unknown" test (e.g. one item of a list); default root.solveFor === key */
  solvedWhen?: (scope: Scope, root: Scope) => boolean;
  /** Custom solve-button action; default sets root.solveFor = key */
  onSolve?: (scope: Scope, root: Scope) => void;
  /** Clicking the button of a computed field: make it an input again (e.g. switch input mode) */
  onUnsolve?: (scope: Scope, root: Scope) => void;
  /** Blank allowed → stored as null (e.g. "no IP3 given"); placeholder from zeroHint */
  optional?: boolean;
  suffix?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  /** Significant digits shown while the field is solved (default 4–5). Converters, whose solved rows are the answer, want more. */
  digits?: number;
  /** Shown as placeholder when the value is 0, e.g. "auto" */
  zeroHint?: string;
}

export interface SelectField extends Base {
  kind: 'select';
  key: string;
  label: string;
  options: (string | { value: string | number; label: string })[];
  /** Selecting a different value re-renders the form (use for fields that swap other fields). */
  structural?: boolean;
  /**
   * Side effect on change, e.g. a material preset filling εr and tan δ. Called after the new value is
   * stored, so `scope[key]` already equals `value`: the old value is not available here.
   */
  apply?: (value: any, scope: Scope, root: Scope) => void;
}

export interface ToggleField extends Base {
  kind: 'toggle';
  key: string;
  label: string;
  on?: string;
  off?: string;
  /** Side effect on change, as for a select (e.g. a switch that changes what the unknown means). */
  apply?: (value: boolean, scope: Scope, root: Scope) => void;
}

export interface SectionSpec extends Base {
  kind: 'section';
  title: string;
  /** Render child fields against scope[at] (a nested object) */
  at?: string;
  note?: string;
  fields: FieldSpec[];
  collapsed?: boolean;
}

export interface ListSpec extends Base {
  kind: 'list';
  key: string;
  itemTitle: (item: Scope, index: number) => string;
  fields: FieldSpec[];
  addLabel: string;
  minItems?: number;
  maxItems?: number;
  /** false (or a reason, shown as the ✕ tooltip) when removing this item would leave the list meaningless */
  canRemove?: (item: Scope, items: Scope[], root: Scope) => boolean | string;
  /** New item from the previous one (old app behaviour: copy the last row). */
  create: (prev: Scope | undefined) => Scope;
  variant?: 'card' | 'sub';
}

export interface GroupSpec extends Base {
  kind: 'group';
  title?: string;
  at?: string;
  fields: FieldSpec[];
}

export interface ButtonSpec extends Base {
  kind: 'button';
  label: string;
  onClick: (scope: Scope, root: Scope) => void;
}

export interface NoteSpec extends Base {
  kind: 'note';
  text: string | ((scope: Scope, root: Scope) => string);
}

export interface TextField extends Base {
  kind: 'text';
  key: string;
  label: string;
  maxLength?: number;
}

export type FieldSpec = NumberField | SelectField | ToggleField | TextField | SectionSpec | ListSpec | GroupSpec | ButtonSpec | NoteSpec;

interface Binding {
  row: HTMLElement;
  spec: FieldSpec;
  scope: Scope;
  sync?: () => void;
  setEnabled?: (on: boolean) => void;
}

let uid = 0;

function fmtPlain(v: number, digits = 6): string {
  if (!Number.isFinite(v)) return '';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(digits - 2).replace(/\.?0+e/, 'e');
  return String(Number(v.toPrecision(digits)));
}

export class Form<S extends Scope> {
  private bindings: Binding[] = [];
  /** Any field is solvable → rows reserve space for the solve button so labels line up. */
  private hasSolve: boolean;

  constructor(
    private host: HTMLElement,
    private spec: FieldSpec[],
    public state: S,
    /** `kind` says what the user did: a setting (dropdown, toggle, list edit, button) or a typed value / unit / ◎. */
    private onChange: (state: S, kind?: ChangeKind) => void,
  ) {
    this.hasSolve = JSON.stringify(spec, (_k, v) => (typeof v === 'function' ? undefined : v)).includes('"solvable":true');
    this.render();
  }

  setState(s: S): void {
    this.state = s;
    this.render();
  }

  /** Full rebuild (structure changed: list add/remove, type switch). */
  render(): void {
    const scroll = this.host.scrollTop;
    clear(this.host);
    this.bindings = [];
    this.host.appendChild(this.renderFields(this.spec, this.state));
    this.refresh();
    this.host.scrollTop = scroll;
  }

  /** Re-evaluate visibility / enabled state and push external value changes into inputs. */
  refresh(): void {
    for (const b of this.bindings) {
      const vis = b.spec.visible ? b.spec.visible(b.scope, this.state) : true;
      b.row.hidden = !vis;
      if (b.setEnabled) b.setEnabled(b.spec.enabled ? b.spec.enabled(b.scope, this.state) : true);
      b.sync?.();
    }
  }

  private changed(structural = false, kind: ChangeKind = 'value'): void {
    if (structural) this.render();
    else this.refresh();
    this.onChange(this.state, kind);
  }

  private renderFields(fields: FieldSpec[], scope: Scope): DocumentFragment {
    const frag = document.createDocumentFragment();
    for (const f of fields) frag.appendChild(this.renderField(f, scope));
    return frag;
  }

  private bind(row: HTMLElement, spec: FieldSpec, scope: Scope, extra: Partial<Binding> = {}): HTMLElement {
    this.bindings.push({ row, spec, scope, ...extra });
    return row;
  }

  private labelCell(label: string, help: string | undefined, forId: string, row: () => HTMLElement, symbol?: string, lead?: Node | null): HTMLElement {
    if (lead === undefined && this.hasSolve) lead = h('span', { class: 'f-solve-spacer' });
    const lab = h('label', { class: 'f-label', for: forId, title: label }, label);
    const sym = symbol ? h('span', { class: 'f-sym' }, ...symNodes(symbol)) : null;
    if (!help) return h('div', { class: 'f-label-cell' }, lead ?? null, sym, lab);
    const btn = h(
      'button',
      {
        class: 'f-help-btn',
        type: 'button',
        'aria-label': 'Help',
        title: help,
        onclick: () => row().classList.toggle('show-help'),
      },
      'i',
    );
    return h('div', { class: 'f-label-cell' }, lead ?? null, sym, lab, btn);
  }

  private renderField(f: FieldSpec, scope: Scope): HTMLElement {
    switch (f.kind) {
      case 'number':
        return this.numberField(f, scope);
      case 'select':
        return this.selectField(f, scope);
      case 'toggle':
        return this.toggleField(f, scope);
      case 'text':
        return this.textField(f, scope);
      case 'section': {
        const body = h('div', { class: 'f-section-body' });
        if (f.note) body.appendChild(h('p', { class: 'f-note' }, f.note));
        body.appendChild(this.renderFields(f.fields, f.at ? scope[f.at] : scope));
        const det = h('details', { class: 'f-section', open: !f.collapsed }, h('summary', { class: 'f-section-title' }, f.title), body);
        return this.bind(det, f, scope);
      }
      case 'group': {
        const g = h('div', { class: 'f-group' }, f.title ? h('div', { class: 'f-group-title' }, f.title) : null, this.renderFields(f.fields, f.at ? scope[f.at] : scope));
        return this.bind(g, f, scope);
      }
      case 'list':
        return this.listField(f, scope);
      case 'button': {
        const btn = h('button', { class: 'btn btn-small', type: 'button', onclick: () => { f.onClick(scope, this.state); this.changed(false, 'setting'); } }, f.label);
        const row = h('div', { class: 'f-row f-row-button' }, h('div'), btn);
        return this.bind(row, f, scope, { setEnabled: (on) => (btn.disabled = !on) });
      }
      case 'note': {
        const p = h('p', { class: 'f-note' });
        const sync = () => (p.textContent = typeof f.text === 'function' ? f.text(scope, this.state) : f.text);
        return this.bind(p, f, scope, { sync });
      }
    }
  }

  private numberField(f: NumberField, scope: Scope): HTMLElement {
    const id = `f${++uid}`;
    const allowsNeg = (f.min ?? -1) < 0;
    const input = h('input', {
      id,
      class: 'f-input',
      type: 'text',
      inputmode: f.unit || allowsNeg ? 'text' : 'decimal',
      autocomplete: 'off',
      spellcheck: false,
      dataset: { key: f.key },
    });
    let unitSel: HTMLSelectElement | null = null;
    const unitKey = f.units ? f.unitKey ?? `${f.key}Unit` : undefined;
    if (f.units && unitKey && !(scope[unitKey] in f.units)) scope[unitKey] = preferredUnit(familyOf(f), f.units) ?? f.defaultUnit ?? Object.keys(f.units)[0];
    const scaleOf = () => (f.units && unitKey ? f.units[scope[unitKey]] ?? 1 : 1);
    const isSolved = () => !!f.output || (!!f.solvable && (f.solvedWhen ? f.solvedWhen(scope, this.state) : this.state.solveFor === f.key));
    const show = () => {
      const v = Number(scope[f.key]);
      if (scope[f.key] == null || (isSolved() && !Number.isFinite(v))) {
        input.value = isSolved() ? (Math.abs(v) === Infinity ? (v > 0 ? '∞' : '−∞') : '—') : '';
        input.placeholder = f.optional && !isSolved() ? f.zeroHint ?? '—' : '';
        input.classList.remove('invalid');
        return;
      } else input.value = f.unit && !f.units ? engString(v, isSolved() ? f.digits ?? 4 : settings().inputDigits) : fmtPlain(v / scaleOf(), isSolved() ? f.digits ?? 5 : settings().inputDigits);
      input.placeholder = v === 0 && f.zeroHint && !f.optional ? f.zeroHint : '';
      if (v === 0 && f.zeroHint && !f.optional && !isSolved()) input.value = '';
      input.classList.remove('invalid');
      input.title = isSolved() ? 'Calculated result' : '';
    };
    const commit = () => {
      if (isSolved()) return;
      let raw = input.value.trim();
      // "10 mil" typed into a mm field switches the dropdown.
      if (f.units && unitKey) {
        const hit = Object.keys(f.units)
          .sort((a, b) => b.length - a.length)
          .find((u) => raw.length > u.length && raw.endsWith(u) && /[\d.\s]$/.test(raw.slice(0, -u.length)));
        if (hit) {
          raw = raw.slice(0, -hit.length).trim();
          if (scope[unitKey] !== hit) {
            scope[unitKey] = hit;
            if (unitSel) unitSel.value = hit;
          }
        }
      }
      let v: number;
      if (!raw && f.optional) {
        input.classList.remove('invalid');
        if (scope[f.key] !== null) {
          scope[f.key] = null;
          this.changed();
        }
        return;
      }
      if (!raw && f.zeroHint) v = 0;
      else v = parseEng(raw, f.unit ?? '');
      if (Number.isFinite(v) && f.units) v *= scaleOf();
      if (Number.isFinite(v) && f.integer) v = Math.round(v);
      if (Number.isFinite(v)) v = snapToLimit(v, f.min, f.max);
      let err = '';
      const fmtLim = (x: number) => (f.unit && !f.units ? engString(x) + f.unit : `${fmtPlain(x / scaleOf())} ${unitKey ? scope[unitKey] : f.suffix ?? ''}`.trim());
      if (!Number.isFinite(v)) err = 'Not a number. Examples: 4.7k, 2.2u, 10n, 1e-3';
      else if (f.min != null && v < f.min) err = `Minimum ${fmtLim(f.min)}`;
      else if (f.max != null && v > f.max) err = `Maximum ${fmtLim(f.max)}`;
      input.classList.toggle('invalid', !!err);
      input.title = err;
      if (err) return;
      if (scope[f.key] !== v) {
        scope[f.key] = v;
        this.changed();
      }
    };
    input.addEventListener('input', commit);
    input.addEventListener('blur', () => {
      if (!input.classList.contains('invalid')) show();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });

    const ctl = h('div', { class: 'f-control' }, input);
    if (f.units && unitKey) {
      unitSel = h('select', { class: 'f-select f-unit-select', 'aria-label': `${f.label} unit` });
      for (const u of Object.keys(f.units)) unitSel.appendChild(h('option', { value: u }, u));
      unitSel.value = scope[unitKey];
      unitSel.addEventListener('change', () => {
        scope[unitKey] = unitSel!.value;
        show();
        this.onChange(this.state);
      });
      ctl.appendChild(unitSel);
    } else if (f.unit || f.suffix) ctl.appendChild(h('span', { class: 'f-unit' }, f.unit ?? f.suffix));

    // Solve-for-X target button
    let solveBtn: HTMLButtonElement | null = null;
    if (f.solvable) {
      solveBtn = h('button', {
        class: 'f-solve-btn',
        type: 'button',
        title: `Solve for ${f.symbol ?? f.label}`,
        'aria-label': `Solve for ${f.label}`,
        onclick: () => {
          if (isSolved()) {
            if (!f.onUnsolve) return;
            f.onUnsolve(scope, this.state);
            this.changed();
            return;
          }
          if (f.onSolve) f.onSolve(scope, this.state);
          else (this.state as Scope).solveFor = f.key;
          this.changed();
        },
      });
    } else if (this.hasSolve) solveBtn = h('span', { class: 'f-solve-spacer' }) as any;

    let row!: HTMLElement;
    row = h('div', { class: 'f-row f-row-num', dataset: { key: f.key } }, this.labelCell(f.label, f.help, id, () => row, f.symbol, solveBtn), ctl, f.help ? h('div', { class: 'f-help' }, f.help) : null);
    show();
    return this.bind(row, f, scope, {
      sync: () => {
        const solved = isSolved();
        row.classList.toggle('solved', solved);
        input.readOnly = solved;
        solveBtn?.classList.toggle('active', solved);
        if (solveBtn) solveBtn.setAttribute('aria-pressed', String(solved));
        // the unit can change from outside too (a solved value moved to a readable prefix)
        if (unitSel && unitKey && scope[unitKey] in f.units! && unitSel.value !== scope[unitKey]) unitSel.value = scope[unitKey];
        if (solved || (document.activeElement !== input && !input.classList.contains('invalid'))) show();
      },
      setEnabled: (on) => {
        input.disabled = !on;
        if (unitSel) unitSel.disabled = !on;
        row.classList.toggle('disabled', !on);
      },
    });
  }

  private selectField(f: SelectField, scope: Scope): HTMLElement {
    const id = `f${++uid}`;
    const sel = h('select', { id, class: 'f-select' });
    for (const o of f.options) {
      const [value, label] = typeof o === 'string' ? [o, o] : [String(o.value), o.label];
      sel.appendChild(h('option', { value }, label));
    }
    sel.value = String(scope[f.key]);
    sel.addEventListener('change', () => {
      const opt = f.options.find((o) => String(typeof o === 'string' ? o : o.value) === sel.value);
      scope[f.key] = typeof opt === 'object' ? opt.value : sel.value;
      f.apply?.(scope[f.key], scope, this.state);
      this.changed(!!f.structural, 'setting');
    });
    let row!: HTMLElement;
    row = h('div', { class: 'f-row' }, this.labelCell(f.label, f.help, id, () => row), h('div', { class: 'f-control' }, sel), f.help ? h('div', { class: 'f-help' }, f.help) : null);
    return this.bind(row, f, scope, {
      sync: () => {
        if (document.activeElement !== sel) sel.value = String(scope[f.key]);
      },
      setEnabled: (on) => {
        sel.disabled = !on;
        row.classList.toggle('disabled', !on);
      },
    });
  }

  private textField(f: TextField, scope: Scope): HTMLElement {
    const id = `f${++uid}`;
    const input = h('input', { id, class: 'f-input f-text', type: 'text', autocomplete: 'off', maxlength: f.maxLength ?? 40 });
    input.value = String(scope[f.key] ?? '');
    // Text edits change labels only: refresh without a structural re-render (keeps focus).
    input.addEventListener('input', () => {
      scope[f.key] = input.value;
      this.onChange(this.state);
    });
    let row!: HTMLElement;
    row = h('div', { class: 'f-row' }, this.labelCell(f.label, f.help, id, () => row), h('div', { class: 'f-control' }, input), f.help ? h('div', { class: 'f-help' }, f.help) : null);
    return this.bind(row, f, scope, {
      sync: () => {
        if (document.activeElement !== input) input.value = String(scope[f.key] ?? '');
      },
    });
  }

  private toggleField(f: ToggleField, scope: Scope): HTMLElement {
    const id = `f${++uid}`;
    const mk = (val: boolean, text: string) =>
      h('button', { type: 'button', class: 'seg-btn', onclick: () => { if (!!scope[f.key] === val) return; scope[f.key] = val; f.apply?.(val, scope, this.state); this.changed(false, 'setting'); } }, text);
    const onB = mk(true, f.on ?? 'On');
    const offB = mk(false, f.off ?? 'Off');
    const seg = h('div', { class: 'seg', id }, onB, offB);
    let row!: HTMLElement;
    row = h('div', { class: 'f-row' }, this.labelCell(f.label, f.help, id, () => row), h('div', { class: 'f-control' }, seg), f.help ? h('div', { class: 'f-help' }, f.help) : null);
    return this.bind(row, f, scope, {
      sync: () => {
        onB.classList.toggle('active', !!scope[f.key]);
        offB.classList.toggle('active', !scope[f.key]);
      },
      setEnabled: (on) => {
        onB.disabled = offB.disabled = !on;
        row.classList.toggle('disabled', !on);
      },
    });
  }

  private listField(f: ListSpec, scope: Scope): HTMLElement {
    const items: Scope[] = scope[f.key];
    const wrap = h('div', { class: `f-list f-list-${f.variant ?? 'card'}` });
    const min = f.minItems ?? 1;
    items.forEach((item, i) => {
      const head = h(
        'div',
        { class: 'f-item-head' },
        h('span', { class: 'f-item-title' }, f.itemTitle(item, i)),
        h('span', { class: 'f-item-actions' },
          h('button', {
            class: 'icon-btn', type: 'button', title: 'Duplicate', 'aria-label': 'Duplicate',
            disabled: f.maxItems != null && items.length >= f.maxItems,
            onclick: () => { items.splice(i + 1, 0, structuredClone(item)); this.changed(true, 'setting'); },
          }, '⧉'),
          ((ok) => h('button', {
            class: 'icon-btn', type: 'button', title: typeof ok === 'string' ? ok : 'Remove', 'aria-label': 'Remove',
            disabled: items.length <= min || ok !== true,
            onclick: () => { items.splice(i, 1); this.changed(true, 'setting'); },
          }, '✕'))(f.canRemove ? f.canRemove(item, items, this.state) : true),
        ),
      );
      wrap.appendChild(h('div', { class: 'f-item' }, head, h('div', { class: 'f-item-body' }, this.renderFields(f.fields, item))));
    });
    const add = h('button', {
      class: 'btn btn-add', type: 'button',
      disabled: f.maxItems != null && items.length >= f.maxItems,
      onclick: () => { items.push(f.create(items[items.length - 1])); this.changed(true, 'setting'); },
    }, `+ ${f.addLabel}`);
    wrap.appendChild(add);
    return this.bind(wrap, f, scope);
  }
}
