/**
 * The Workbook menu (header, right): save the open calculation, reopen, rename, download or delete
 * saved ones, reopen recent calculators, and download / upload the whole workbook. The same file
 * actions are in Settings → Workbook. Storage and file formats live in workbook.ts.
 */

import { h, clear, downloadFile, pickTextFile } from '@/core/ui/dom';
import { settings } from '@/core/settings';
import { APP_VERSION } from './version';
import { addSaved, calcFile, fileNameFor, mergeWorkbooks, onWorkbook, parseFile, removeSaved, renameSaved, setWorkbook, workbook, workbookFile, type SavedCalc } from './workbook';

export interface WorkbookHost {
  /** The open calculator, or null on a planned page */
  current(): { calc: string; title: string; version: string; inputs: Record<string, unknown> } | null;
  /** Open a calculator and give it these inputs */
  load(calc: string, inputs: Record<string, unknown>): Promise<void>;
  /** "Voltage Divider" / "Voltage Divider (Basic)", or null if this site has no such calculator */
  titleOf(calc: string): string | null;
}

const SHOW_SAVED = 6;
const SHOW_RECENT = 6;

export function downloadWorkbook(): void {
  const wb = workbook();
  downloadFile(fileNameFor(wb.name, '.eecalc.json'), workbookFile(wb, APP_VERSION), 'application/json');
}

/**
 * Ask for a workbook or calculation file and add it. A workbook is merged in (nothing is overwritten);
 * a single calculation is added to the saved list and opened. Resolves with a message for the user.
 */
export async function uploadFile(host: WorkbookHost): Promise<string | null> {
  const f = await pickTextFile('.json,application/json');
  if (!f) return null;
  if (!f.text) return `“${f.name}” is too large to be an EEcalc file.`;
  try {
    const p = parseFile(f.text);
    if (p.kind === 'calculation') {
      const { wb, saved } = addSaved(workbook(), p.saved);
      const stored = setWorkbook(wb);
      if (host.titleOf(saved.calc)) await host.load(saved.calc, saved.inputs);
      return `Added “${saved.name}”${host.titleOf(saved.calc) ? ' and opened it' : ', but this site has no calculator with its id'}.${stored ? '' : STORE_FAIL}`;
    }
    const { wb, added } = mergeWorkbooks(workbook(), p.wb);
    const stored = setWorkbook(wb);
    const same = p.wb.saved.length - added;
    return `Merged “${p.wb.name}”: ${added} saved calculation${added === 1 ? '' : 's'} added${same ? `, ${same} already here` : ''}${p.skipped ? `, ${p.skipped} damaged skipped` : ''}.${stored ? '' : STORE_FAIL}`;
  } catch (e) {
    return (e as Error).message;
  }
}

const STORE_FAIL = ' This browser did not let EEcalc store it, so it will be lost when the page closes: download the workbook to keep it.';

/** "just now", "5 min ago", "3 h ago", "yesterday", "12 Nov" */
export function ago(iso: string, now = Date.now()): string {
  const s = (now - Date.parse(iso)) / 1000;
  if (!(s >= 0)) return '';
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 172800) return 'yesterday';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

export class WorkbookMenu {
  readonly button: HTMLButtonElement;
  readonly el: HTMLElement;
  private status = '';
  /** Saved entry whose name is being edited */
  private editing = '';
  private showAll = false;
  /** Last deleted entry and where it was, for Undo */
  private undo: { entry: SavedCalc; at: number } | null = null;

  constructor(private host: WorkbookHost) {
    this.button = h(
      'button',
      { class: 'wb-btn', type: 'button', 'aria-haspopup': 'true', 'aria-expanded': 'false', title: 'Saved calculations and recent calculators', onclick: () => (this.el.hidden ? this.open() : this.close()) },
      h('span', { class: 'wb-icon', 'aria-hidden': 'true' }, '▤'),
      h('span', { class: 'wb-label' }, 'Workbook'),
      h('span', { class: 'wb-caret', 'aria-hidden': 'true' }, '▾'),
    );
    this.el = h('div', { class: 'wb-menu', role: 'dialog', 'aria-label': 'Workbook', hidden: true });
    document.addEventListener('click', (e) => {
      const t = e.target as Node;
      if (!this.el.hidden && t.isConnected && !this.el.contains(t) && !this.button.contains(t)) this.close();
    });
    document.addEventListener('keydown', (e) => e.key === 'Escape' && !this.el.hidden && !this.editing && this.close());
    onWorkbook(() => !this.el.hidden && !this.editing && this.render());
  }

  open(): void {
    this.status = '';
    this.undo = null;
    this.render();
    this.el.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
  }

  close(): void {
    this.el.hidden = true;
    this.editing = '';
    this.showAll = false;
    this.button.setAttribute('aria-expanded', 'false');
  }

  /** Save the open calculation under a default name and start renaming it. */
  saveCurrent(): void {
    const cur = this.host.current();
    if (!cur) return;
    const stamp = new Date().toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const { wb, saved } = addSaved(workbook(), { name: `${cur.title} · ${stamp}`, calc: cur.calc, calcVersion: cur.version, inputs: cur.inputs });
    this.status = setWorkbook(wb) ? '' : STORE_FAIL.trim();
    this.editing = saved.id;
    this.render();
  }

  private render(): void {
    const wb = workbook();
    clear(this.el);
    const cur = this.host.current();

    // ── name
    const name = h('input', { class: 'wb-name', value: wb.name, 'aria-label': 'Workbook name', maxlength: 120, title: 'Rename the workbook' });
    const commitName = () => name.value.trim() && name.value !== wb.name && setWorkbook({ ...workbook(), name: name.value.trim() });
    name.addEventListener('change', commitName);
    name.addEventListener('keydown', (e) => e.key === 'Enter' && name.blur());
    this.el.append(h('div', { class: 'wb-head' }, name));

    // ── save
    this.el.append(
      h('button', { class: 'btn btn-small wb-save', type: 'button', disabled: !cur, title: cur ? `Save the inputs of ${cur.title}` : 'Open a calculator to save it', onclick: () => this.saveCurrent() }, '＋ Save this calculation'),
    );

    // ── saved
    this.el.append(h('div', { class: 'wb-section' }, `Saved${wb.saved.length ? ` (${wb.saved.length})` : ''}`));
    if (!wb.saved.length) this.el.append(h('p', { class: 'wb-empty' }, 'Nothing saved yet. Saved calculations keep their inputs until you delete them.'));
    const list = this.showAll ? wb.saved : wb.saved.slice(0, SHOW_SAVED);
    for (const s of list) this.el.append(this.savedRow(s));
    if (wb.saved.length > SHOW_SAVED) {
      this.el.append(h('button', { class: 'wb-more', type: 'button', onclick: () => ((this.showAll = !this.showAll), this.render()) }, this.showAll ? 'Show fewer' : `Show all ${wb.saved.length}`));
    }

    // ── recent
    const recent = wb.recent.filter((r) => this.host.titleOf(r.calc)).slice(0, SHOW_RECENT);
    this.el.append(h('div', { class: 'wb-section' }, 'Recent'));
    if (!settings().history) this.el.append(h('p', { class: 'wb-empty' }, 'History is off (Settings → Workbook).'));
    else if (!recent.length) this.el.append(h('p', { class: 'wb-empty' }, 'Calculators you use appear here.'));
    for (const r of recent) {
      this.el.append(
        h('a', { class: `wb-recent${cur?.calc === r.calc ? ' here' : ''}`, href: `#/${r.calc}`, onclick: (e: MouseEvent) => (e.preventDefault(), this.close(), void this.host.load(r.calc, r.inputs)) },
          h('span', { class: 'wb-title' }, this.host.titleOf(r.calc)),
          h('span', { class: 'wb-when' }, ago(r.at))),
      );
    }

    // ── files
    this.el.append(
      h(
        'div',
        { class: 'wb-foot' },
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'Add a workbook or calculation file (merges, never overwrites)', onclick: async () => this.say(await uploadFile(this.host)) }, '⤒ Upload…'),
        h('button', { class: 'btn btn-small btn-ghost', type: 'button', title: 'Save the whole workbook as a file', onclick: () => downloadWorkbook() }, '⤓ Download workbook'),
      ),
    );
    if (this.status || this.undo) {
      const undo = this.undo;
      this.el.append(
        h('p', { class: 'wb-status', role: 'status' }, this.status, undo ? h('button', { class: 'wb-link', type: 'button', onclick: () => this.restore() }, 'Undo') : null),
      );
    }
    const input = this.el.querySelector<HTMLInputElement>('.wb-rename');
    if (input) {
      input.focus();
      input.select();
    }
  }

  private savedRow(s: SavedCalc): HTMLElement {
    const title = this.host.titleOf(s.calc);
    const meta = h('span', { class: 'wb-meta' }, `${title ?? `${s.calc} (not on this site)`} · ${ago(s.savedAt)}`);
    if (this.editing === s.id) {
      const input = h('input', { class: 'wb-rename', value: s.name, maxlength: 120, 'aria-label': 'Name' });
      const done = (keep: boolean) => {
        if (this.editing !== s.id) return;
        this.editing = '';
        if (keep) setWorkbook(renameSaved(workbook(), s.id, input.value));
        else this.render();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(true);
        if (e.key === 'Escape') done(false);
      });
      input.addEventListener('blur', () => done(true));
      return h('div', { class: 'wb-row editing' }, h('div', { class: 'wb-main' }, input, meta));
    }
    const icon = (label: string, text: string, fn: () => void) => h('button', { class: 'wb-icon-btn', type: 'button', title: label, 'aria-label': label, onclick: (e: MouseEvent) => (e.stopPropagation(), fn()) }, text);
    return h(
      'div',
      { class: 'wb-row' },
      h(
        'button',
        { class: 'wb-main', type: 'button', disabled: !title, title: title ? `Open ${title} with these inputs` : 'This site has no calculator with this id', onclick: () => (this.close(), void this.host.load(s.calc, s.inputs)) },
        h('span', { class: 'wb-title' }, s.name),
        meta,
      ),
      icon('Rename', '✎', () => ((this.editing = s.id), this.render())),
      icon('Download this calculation', '⤓', () => downloadFile(fileNameFor(s.name, '.eecalc.json'), calcFile(s, APP_VERSION), 'application/json')),
      icon('Delete', '✕', () => this.remove(s)),
    );
  }

  private remove(s: SavedCalc): void {
    const at = workbook().saved.findIndex((x) => x.id === s.id);
    this.undo = { entry: s, at };
    this.status = `Deleted “${s.name}”.`;
    setWorkbook(removeSaved(workbook(), s.id));
    this.render();
  }

  private restore(): void {
    if (!this.undo) return;
    const saved = [...workbook().saved];
    saved.splice(Math.max(0, this.undo.at), 0, this.undo.entry);
    this.status = `Restored “${this.undo.entry.name}”.`;
    this.undo = null;
    setWorkbook({ ...workbook(), saved });
    this.render();
  }

  private say(msg: string | null): void {
    if (msg == null) return;
    this.status = msg;
    this.undo = null;
    if (!this.el.hidden) this.render();
  }
}
