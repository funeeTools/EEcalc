/**
 * Form spec ↔ machine-readable schema, used by the AI API.
 *
 *  describeFields(spec, state) → flat list of every input with its path ("lead.length",
 *  "groups.0.caps.1.c"), SI unit, unit choices, limits, options and visibility.
 *  applyValues(def, state, values) sets values by path, accepting SI numbers or strings with
 *  units ("10 mil", "2.4 GHz", "4k7", "47 nF").
 */

import { familyOf, snapToLimit, type FieldSpec, type NumberField } from '@/core/form/form';
import { preferredUnit } from '@/core/settings';
import { parseEng } from '@/core/units';

type Scope = Record<string, any>;

export interface FieldInfo {
  path: string;
  kind: 'number' | 'select' | 'toggle' | 'text' | 'list';
  label: string;
  symbol?: string;
  section?: string;
  /** SI unit of the stored value */
  unit?: string;
  /** Display unit choices (label → SI multiplier) and the state path holding the current choice */
  unitChoices?: Record<string, number>;
  unitPath?: string;
  min?: number;
  max?: number;
  integer?: boolean;
  options?: { value: string | number; label: string }[];
  help?: string;
  value: unknown;
  /** Display value in the selected unit, as the page shows it */
  display?: string;
  visible: boolean;
  enabled: boolean;
  solvable?: boolean;
  /** Blank / null allowed (e.g. "not given") */
  optional?: boolean;
  /** Computed by the page, not settable (pure output row or the current solve-for unknown) */
  computed?: boolean;
  /** Lists: item fields (paths relative to the item) and limits */
  item?: FieldInfo[];
  minItems?: number;
  maxItems?: number;
}

/**
 * Set every unit dropdown that belongs to a preference family (Settings → Units) to the preferred
 * unit, including inside list items. Values are SI, so only the display changes.
 */
export function applyUnitPrefs(spec: FieldSpec[], scope: Scope | undefined): void {
  if (!scope) return;
  for (const f of spec) {
    if (f.kind === 'section' || f.kind === 'group') applyUnitPrefs(f.fields, f.at ? scope[f.at] : scope);
    else if (f.kind === 'list') for (const it of scope[f.key] ?? []) applyUnitPrefs(f.fields, it);
    else if (f.kind === 'number' && f.units) {
      const u = preferredUnit(familyOf(f), f.units);
      if (u) scope[f.unitKey ?? `${f.key}Unit`] = u;
    }
  }
}

export function describeFields(spec: FieldSpec[], root: Scope): FieldInfo[] {
  const out: FieldInfo[] = [];
  walk(spec, root, root, '', '', out, true);
  return out;
}

function join(prefix: string, key: string): string {
  return prefix ? `${prefix}.${key}` : key;
}

function walk(spec: FieldSpec[], scope: Scope, root: Scope, prefix: string, section: string, out: FieldInfo[], parentVisible: boolean): void {
  for (const f of spec) {
    const visible = parentVisible && (f.visible ? f.visible(scope, root) : true);
    const enabled = f.enabled ? f.enabled(scope, root) : true;
    switch (f.kind) {
      case 'section':
        walk(f.fields, f.at ? scope[f.at] : scope, root, f.at ? join(prefix, f.at) : prefix, f.title, out, visible);
        break;
      case 'group':
        walk(f.fields, f.at ? scope[f.at] : scope, root, f.at ? join(prefix, f.at) : prefix, f.title ?? section, out, visible);
        break;
      case 'number': {
        const unitKey = f.units ? f.unitKey ?? `${f.key}Unit` : undefined;
        const v = scope?.[f.key];
        const info: FieldInfo = {
          path: join(prefix, f.key),
          kind: 'number',
          label: f.label,
          symbol: f.symbol,
          section: section || undefined,
          unit: f.unit ?? (f.units ? siUnitGuess(f) : f.suffix),
          min: f.min,
          max: f.max,
          integer: f.integer,
          help: f.help,
          value: v,
          visible,
          enabled,
          solvable: f.solvable || undefined,
          optional: f.optional || undefined,
          computed: f.output || (f.solvable && (f.solvedWhen ? f.solvedWhen(scope, root) : root.solveFor === f.key)) || undefined,
        };
        if (f.units && unitKey) {
          info.unitChoices = f.units;
          info.unitPath = join(prefix, unitKey);
          const u = scope?.[unitKey];
          if (typeof v === 'number' && f.units[u]) info.display = `${+(v / f.units[u]).toPrecision(6)} ${u}`;
        }
        out.push(info);
        break;
      }
      case 'select':
        out.push({
          path: join(prefix, f.key),
          kind: 'select',
          label: f.label,
          section: section || undefined,
          options: f.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
          help: f.help,
          value: scope?.[f.key],
          visible,
          enabled,
        });
        break;
      case 'text':
        out.push({ path: join(prefix, f.key), kind: 'text', label: f.label, section: section || undefined, help: f.help, value: scope?.[f.key] ?? '', visible, enabled });
        break;
      case 'toggle':
        out.push({ path: join(prefix, f.key), kind: 'toggle', label: `${f.label} (${f.on ?? 'On'} = true / ${f.off ?? 'Off'} = false)`, section: section || undefined, help: f.help, value: !!scope?.[f.key], visible, enabled });
        break;
      case 'list': {
        const items: Scope[] = scope?.[f.key] ?? [];
        const itemInfo: FieldInfo[] = [];
        walk(f.fields, items[0] ?? f.create(undefined), root, '', '', itemInfo, true);
        out.push({
          path: join(prefix, f.key),
          kind: 'list',
          label: f.addLabel.replace(/^add\s+/i, ''),
          section: section || undefined,
          value: `${items.length} item(s)`,
          visible,
          enabled,
          // Item schema: visibility depends on each item's own values (e.g. its type), so it is not reported here.
          item: itemInfo.map(({ value: _v, display: _d, visible: _vis, ...rest }) => ({ ...rest, value: undefined, visible: true })),
          minItems: f.minItems ?? 1,
          maxItems: f.maxItems,
        });
        items.forEach((it, i) => walk(f.fields, it, root, join(join(prefix, f.key), String(i)), `${f.itemTitle(it, i)}`, out, visible));
        break;
      }
      default:
        break;
    }
  }
}

function siUnitGuess(f: NumberField): string | undefined {
  const base = Object.entries(f.units ?? {}).find(([, m]) => m === 1);
  return base?.[0];
}

/** Find the number/select/toggle spec at a dotted path (list indices allowed). */
export function findField(spec: FieldSpec[], path: string): { field: FieldSpec; parentPath: string } | null {
  const parts = path.split('.');
  return find(spec, parts, '');
}

function find(spec: FieldSpec[], parts: string[], prefix: string): { field: FieldSpec; parentPath: string } | null {
  for (const f of spec) {
    if (f.kind === 'section' || f.kind === 'group') {
      if (f.at) {
        if (parts[0] === f.at) {
          const r = find(f.fields, parts.slice(1), join(prefix, f.at));
          if (r) return r;
        }
      } else {
        const r = find(f.fields, parts, prefix);
        if (r) return r;
      }
    } else if (f.kind === 'list') {
      if (parts[0] === f.key) {
        if (parts.length === 1) return { field: f, parentPath: prefix };
        if (/^\d+$/.test(parts[1])) {
          const r = find(f.fields, parts.slice(2), join(join(prefix, f.key), parts[1]));
          if (r) return r;
        }
      }
    } else if ('key' in f && parts.length === 1 && parts[0] === f.key) {
      return { field: f, parentPath: prefix };
    } else if (f.kind === 'number' && f.units && parts.length === 1 && parts[0] === (f.unitKey ?? `${f.key}Unit`)) {
      return { field: { kind: 'select', key: parts[0], label: `${f.label} unit`, options: Object.keys(f.units) }, parentPath: prefix };
    }
  }
  return null;
}

export function getPath(obj: Scope, path: string): any {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj as any);
}

export function setPath(obj: Scope, path: string, value: unknown): void {
  const parts = path.split('.');
  let o: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] == null) throw new Error(`Path "${path}": "${parts.slice(0, i + 1).join('.')}" does not exist`);
    o = o[parts[i]];
  }
  o[parts[parts.length - 1]] = value;
}

/** Match a typed unit against the field's unit choices: exact first, then case-insensitive if unambiguous. */
function matchUnit(s: string, units: Record<string, number>): string | undefined {
  const keys = Object.keys(units).sort((a, b) => b.length - a.length);
  const ok = (u: string, tail: string) => s.length > u.length && tail === u && /[\d.\s]$/.test(s.slice(0, -u.length));
  const exact = keys.find((u) => ok(u, s.slice(-u.length)));
  if (exact) return exact;
  // Case-insensitive only when it cannot confuse milli (m) with mega (M): "7 mHz" must not become MHz.
  const ci = keys.filter((u) => ok(u.toLowerCase(), s.slice(-u.length).toLowerCase()) && !/^[mM]/.test(s.slice(-u.length)) === !/^[mM]/.test(u) && (s.slice(-u.length)[0] === u[0] || !/^[mM]$/.test(u[0])));
  return ci.length === 1 ? ci[0] : undefined;
}

/**
 * Parse an API value for a number field. Accepts SI numbers, or strings with an optional
 * engineering prefix and/or one of the field's unit choices: "1.2", "4k7", "10 mil", "2.4 GHz".
 * Fields with a fixed non-SI suffix (dB, dBm, K, °, %) take plain numbers only — "50 K" is 50 kelvin,
 * never 50 kilo-anything. Returns the SI value and the unit choice that was named (if any).
 */
export function parseFieldValue(f: NumberField, raw: unknown): { value: number; unitChoice?: string } {
  if (typeof raw === 'number') return { value: raw };
  if (typeof raw !== 'string') throw new Error(`Expected a number or string, got ${typeof raw}`);
  // Normalise spellings: "ohm" → Ω, "um"/"μm" (Greek mu) → "µm" (micro sign) — but only as a unit word.
  const s = raw.trim().replace(/\s*ohms?$/i, ' Ω').replace(/(\d|\s)[uμ](?=[a-zA-ZΩ]+$)/, '$1µ');
  if (f.units) {
    const hit = matchUnit(s, f.units);
    if (hit) {
      const n = parseEng(s.slice(0, -hit.length).trim());
      if (!Number.isFinite(n)) throw new Error(`Cannot parse "${raw}"`);
      return { value: n * f.units[hit], unitChoice: hit };
    }
  }
  if (!f.unit && !f.units) {
    let t = s;
    if (f.suffix && t.toLowerCase().endsWith(f.suffix.toLowerCase())) t = t.slice(0, -f.suffix.length).trim();
    if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(t)) throw new Error(`Cannot parse "${raw}" — give a plain number${f.suffix ? ` in ${f.suffix}` : ''}`);
    return { value: Number(t) };
  }
  const unit = f.unit ?? '';
  let n = parseEng(s, unit);
  if (!Number.isFinite(n) && unit) {
    // allow a space before the unit and µ/u variants: "47 nF"
    n = parseEng(s.replace(/\s+/g, ''), unit);
  }
  if (!Number.isFinite(n)) throw new Error(`Cannot parse "${raw}" (examples: 4.7k, 2.2u, "10 mm")`);
  return { value: n };
}

export interface ApplyOptions {
  /** Allowed values of `solveFor` (from CalcDef.solve) */
  solveOptions?: string[];
  /** Extra top-level control keys (not form fields): key → normaliser that returns the value or throws */
  controls?: Record<string, (raw: unknown, state: Scope) => unknown>;
  /** The root state when `state` is a list item (internal) */
  root?: Scope;
}

/** Plain nested objects → dotted paths; arrays and primitives are leaves. */
function flatten(obj: Scope, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v as Scope, p, out);
    else out[p] = v;
  }
  return out;
}

/** Apply {path: value} pairs to a state, validating against the form spec. Returns problems. */
export function applyValues(spec: FieldSpec[], state: Scope, values: Record<string, unknown>, opts: ApplyOptions = {}): string[] {
  const errors: string[] = [];
  const root = opts.root ?? state;
  // Mode-setting keys first, so a value given in the same call is judged in the new mode. Selects and
  // toggles go before solveFor: their apply() may pick its own unknown, and an explicit solveFor must win.
  const rank = (k: string) => {
    const kind = findField(spec, k)?.field.kind;
    return kind === 'select' || kind === 'toggle' ? 0 : k === 'solveFor' || opts.controls?.[k] ? 1 : 2;
  };
  const entries = Object.entries(values).sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [path, raw] of entries) {
    if (path === 'solveFor') {
      if (opts.solveOptions && !opts.solveOptions.includes(String(raw))) errors.push(`solveFor: must be one of ${opts.solveOptions.map((o) => JSON.stringify(o)).join(', ')}`);
      else state.solveFor = raw;
      continue;
    }
    if (opts.controls?.[path]) {
      try {
        state[path] = opts.controls[path](raw, state);
      } catch (e) {
        errors.push(`${path}: ${(e as Error).message}`);
      }
      continue;
    }
    const hit = findField(spec, path);
    if (!hit) {
      errors.push(`Unknown input "${path}"`);
      continue;
    }
    const f = hit.field;
    try {
      if (f.kind === 'number') {
        if (f.optional && (raw === null || raw === '')) {
          setPath(state, path, null);
          continue;
        }
        const parent = hit.parentPath ? getPath(state, hit.parentPath) : state;
        if (f.output || (f.solvable && (f.solvedWhen ? f.solvedWhen(parent, root) : root.solveFor === f.key))) {
          throw new Error(`is calculated in the current mode${root.solveFor ? ` (solveFor = "${root.solveFor}")` : ''} — choose a different unknown / input mode to set it`);
        }
        const { value, unitChoice } = parseFieldValue(f, raw);
        let v = f.integer ? Math.round(value) : value;
        if (!Number.isFinite(v)) throw new Error('not finite');
        v = snapToLimit(v, f.min, f.max);
        if (f.min != null && v < f.min) throw new Error(`below minimum ${f.min}`);
        if (f.max != null && v > f.max) throw new Error(`above maximum ${f.max}`);
        setPath(state, path, v);
        if (unitChoice && f.units) setPath(state, join(hit.parentPath, f.unitKey ?? `${f.key}Unit`), unitChoice);
      } else if (f.kind === 'select') {
        const opts2 = f.options.map((o) => (typeof o === 'string' ? o : o.value));
        const match = opts2.find((o) => String(o) === String(raw)) ?? opts2.find((o) => String(o).toLowerCase() === String(raw).toLowerCase());
        if (match === undefined) {
          const labels = f.options.map((o) => (typeof o === 'string' ? undefined : o));
          const byLabel = labels.find((o) => o && o.label.toLowerCase() === String(raw).toLowerCase());
          if (!byLabel) throw new Error(`must be one of ${opts2.map((o) => JSON.stringify(o)).join(', ')}`);
          setPath(state, path, byLabel.value);
        } else setPath(state, path, match);
        if (f.apply) {
          const parent = hit.parentPath ? getPath(state, hit.parentPath) : state;
          f.apply(getPath(state, path), parent, state);
        }
      } else if (f.kind === 'text') {
        setPath(state, path, String(raw ?? '').slice(0, f.maxLength ?? 40));
      } else if (f.kind === 'toggle') {
        setPath(state, path, raw === true || raw === 'true' || raw === 1 || raw === 'on');
        if (f.apply) {
          const parent = hit.parentPath ? getPath(state, hit.parentPath) : state;
          f.apply(getPath(state, path), parent, state);
        }
      } else if (f.kind === 'list') {
        if (!Array.isArray(raw)) throw new Error('expected an array of items');
        if (raw.length < (f.minItems ?? 1)) throw new Error(`needs at least ${f.minItems ?? 1} item(s)`);
        if (f.maxItems != null && raw.length > f.maxItems) throw new Error(`at most ${f.maxItems} items`);
        // Each item starts from a complete item (the list's own "new item" rule applied to the previous
        // *merged* item), then every given value goes through the same validation as a path update.
        const items: Scope[] = [];
        const itemErrors: string[] = [];
        raw.forEach((it, i) => {
          // A value left out means "default", never "same as the previous item".
          const item = structuredClone(f.create(undefined));
          if (it && typeof it === 'object') {
            for (const e of applyValues(f.fields, item, flatten(it as Scope), { ...opts, root })) itemErrors.push(`[${i}] ${e}`);
          } else itemErrors.push(`[${i}] expected an object`);
          items.push(item);
        });
        if (itemErrors.length) throw new Error(itemErrors.join('; '));
        setPath(state, path, items);
      } else errors.push(`"${path}" is not settable`);
    } catch (e) {
      errors.push(`${path}: ${(e as Error).message}`);
    }
  }
  // An option's side effect (e.g. "a new laminate goes back to analysis") must not override an unknown
  // asked for in the same call: the explicit solveFor wins.
  if ('solveFor' in values && state.solveFor !== values.solveFor && !(opts.solveOptions && !opts.solveOptions.includes(String(values.solveFor)))) state.solveFor = values.solveFor;
  return errors;
}

/** applyValues with the calculator's own solve options and control keys. */
export function applyDefValues(def: { fields: FieldSpec[]; solve?: { options: { key: string }[] }; controls?: Record<string, (raw: unknown, state: any) => unknown> }, state: Scope, values: Record<string, unknown>): string[] {
  return applyValues(def.fields, state, values, { solveOptions: def.solve?.options.map((o) => o.key), controls: def.controls });
}
