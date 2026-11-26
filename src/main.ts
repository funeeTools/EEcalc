import './styles/app.css';
import './styles/pcb.css';
import './core/settings'; // applies the saved theme before first paint
import { createApi, registerWebMcp } from './app/api';
import { Shell } from './app/shell';

const root = document.getElementById('app')!;
const shell = new Shell(root);
shell.start();

// AI control: window.eeCalc.
const api = createApi(shell);
(window as any).eeCalc = api;
// Dev only: the mode-switch harness (src/dev/modeswitch.ts) reads the open calculator's controller.
if (import.meta.env.DEV) (window as any).__eeShell = shell;
// WebMCP is experimental and deliberately left out of the public docs (ai.html, llms.txt) for now;
// the tools still register where a browser exposes modelContext. Status: <html data-webmcp>.
void registerWebMcp(api).then((how) => {
  document.documentElement.dataset.webmcp = how ?? 'none';
});

// Machine-readable mirror of the open calculator's latest report, for agents that read the DOM.
const mirror = document.createElement('script');
mirror.type = 'application/json';
mirror.id = 'ee-report';
document.body.appendChild(mirror);
window.addEventListener('ee:report', (e: Event) => {
  const { calcId, report, state } = (e as CustomEvent).detail;
  mirror.textContent = JSON.stringify({
    calc: calcId,
    ok: report.ok,
    status: report.status,
    solveFor: report.solveFor,
    results: report.results.map((r: any) => ({ key: r.key, label: r.label, value: r.value, unit: r.unit, display: r.display })),
    warnings: report.warnings,
    inputs: state,
  }, (_k, v) => (typeof v === 'number' && !Number.isFinite(v) ? String(v) : v));
});

// Keep the workspace exactly one screen tall below the sticky header (the calculator menu lies over the page).
const syncChrome = () => {
  const hh = document.querySelector<HTMLElement>('.app-header')?.offsetHeight ?? 0;
  document.documentElement.style.setProperty('--header-h', `${hh}px`);
  document.documentElement.style.setProperty('--chrome-h', `${hh}px`);
};
new ResizeObserver(syncChrome).observe(document.body);
window.addEventListener('hashchange', () => requestAnimationFrame(syncChrome));
syncChrome();
