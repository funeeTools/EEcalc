# EEcalc — calculator style guide

A loose guide for anyone (human or AI) adding a calculator. The aim is that every page behaves and
feels the same, so a user who has learnt one calculator can drive any other without thinking. When a
calculator genuinely needs something different, do it, but say why in a code comment.

The built calculators are the reference implementations. When in doubt, copy the closest one:

| Pattern | Look at |
|---|---|
| Solve-for-X over a closed-form model | `src/calculators/microstrip` |
| Variable-length list of stages / items | `src/calculators/nf-cascade` |
| Design synthesis + schematic + E-series parts | `src/calculators/filter` |
| Small schematic that follows a topology option | `src/calculators/attenuator-designer` |
| Smith chart, several equivalent input forms, draggable points, a graph beside the chart | `src/calculators/smith` |
| Time-domain simulation, custom result tabs | `src/calculators/inrush` |
| E-series candidates in a colour-coded table, spec window check | `src/calculators/voltage-divider`, `src/calculators/i2c-pullup` |
| Time waveform as the first graph | `src/calculators/i2c-pullup`, `src/calculators/555-timer` |
| Geometry cross-section with dimensions | `src/calculators/coax-impedance`, `src/calculators/trace-width-current` |
| Block diagram of a system budget | `src/calculators/nf-cascade`, `src/calculators/free-space-path-loss` |

---

## 1. Ground rules

- **Other calculators are a feature checklist, not ground truth.** Check every equation against a primary source,
  such as a paper, standard, textbook or datasheet. Cite it in `method` and in the theory references.
  Theory and help text are written fresh, never copied.
- **Avoid heavy numerics.** Leave out field solvers and big meshes. A calculator should compute in
  well under 50 ms so it can run on every keystroke.
- **Calculators are pure.** `def.ts` and `model.ts` must not touch the DOM. The page, the AI API
  (`window.eeCalc`) and the tests all call the same `def.compute(state)`.
- **Read the calculator's `NOTES.md` before changing it** and keep it up to date, with a version bump
  and a changelog line for every change (§13).
- **Store values in SI.** Keep metres, hertz, ohms and farads in the state. Units are display only.
  Use dB, °, K and similar only where they are the natural unit (gain, angles, temperatures), and
  show them with `suffix`.

## 2. Files

```
src/calculators/<name>/
  model.ts    equations only (pure functions, SI in/out, documented with sources)
  def.ts      CalcDef: state type, defaults, fields, compute → CalcReport, examples
  theory.ts   TheoryContent: the long explanation under the calculator (KaTeX)
  index.ts    CalcModule { def, theory, view? } — the only file that may touch the DOM
  NOTES.md    design notes for agents: why it is built this way, and its changelog (§13)
```

Register it in `READY` in `src/app/registry.ts`, using the id `<category>/<slug>` from the roadmap (`src/app/roadmap.ts`), a one-line
`blurb` and a lazy `load`. Put its tests in `tests/calc-<dir>.test.ts`. At minimum, check one
published worked example, one round trip of solve → forward per solve option, and that every
example computes.

## 3. Page layout (do not change per calculator)

```
┌ Inputs (left, full height) ┬ Graph pane (top right) ──────────────┐
│ toolbar: Examples… · Reset │ Diagram|Graph · graph tabs · CSV     │
│ sections of one-line rows  │ diagram (default) or graph           │
│                            ├ Results | Tables | Notes | (custom)  ┤
│                            │ Results tab is always first          │
└────────────────────────────┴──────────────────────────────────────┘
  Theory section below (scroll)
```

- These three areas fit one screen on a laptop. Do not add content that makes the inputs pane
  scroll for a typical use case. Put rarely used inputs in a collapsed or later section.
- The diagram tab (Circuit / Cross-section / Diagram, §7a) goes after Notes. Other custom tabs
  (Breakdown…) follow it, added in `view.setup` via `ctl.slots.info.add(id, title)`.
- The graph pane opens on the diagram, drawn large; a Diagram | Graph switch at the left of
  the graph bar flips it, and the graph picker sits right beside it in the same thin row (no tab strip, so
  the drawing keeps the height). The bottom pane opens on Results (no remembered tab or view). The
  diagram is also drawn in its own bottom tab, and from the default inputs it is the picture on the
  hover card of the calculator's tab in the top bar, so it must render well from `defaults()`, fill
  a wide pane, and stay recognisable when shrunk to about 400 px wide.

## 4. Inputs

**One input per line:** ◎ solve button (or spacer), symbol, label, value box, then a unit dropdown
or a fixed unit. The `Form` renders this; never build input rows by hand.

- Give every number field a `symbol` (`'Z₀'`, `'W'`, `'f_c'`, `'I_L,pk'`, where `_` starts a subscript that runs over letters, digits and commas) and a
  short `label`. Keep labels under about 22 characters, because the column is narrow. Put the
  longer explanation in `help`; it shows behind the (i) button.
- **Units:**
  - Use a shared table from `src/core/unitsets.ts` (`U_LEN_PCB`, `U_THICK`, `U_FREQ`, `U_OHM`,
    `U_CAP`, `U_IND`…) with an explicit `unitKey`. Put the most common unit first, or use
    `withDefault()`.
  - Tables tagged with a family (`pcb`, `copper`, `length`, `freq`) follow the user's
    **Settings → Preferred units**. Give a new table a family only if a global preference makes
    sense for it. Opt a field out with `unitFamily: 'none'`.
  - Values without a dropdown take `unit` (auto SI prefix, e.g. `'F'` shows `4.7µ`).
  - Unitless or log quantities take `suffix` (`'dB'`, `'°'`, `'K'`).
- **Limits:** always set `min` / `max`. They reject typos such as 50 m for a trace width. Use
  `integer: true` for counts.
- **Solved values stay in range.** Never write a solved value outside the field's `min` / `max`;
  return `ok: false` with a message instead.
- Solved boxes show 4–5 significant digits. Converters, whose solved rows are the answer, set
  `digits: 12` on those fields.
- **Engineering notation is accepted everywhere** (`4k7`, `2.2u`, `10n`, `1meg`). Typing a unit
  suffix ("10 mil") switches the dropdown. Don't parse input yourself.
- **Sections** group inputs in the order a designer thinks: geometry, then material, then
  operating point, then options. Use a section `note` for one sentence of context, not a paragraph.
- **Presets** such as materials and cable types are a `select` with `apply` that fills the
  related fields. `def.sync` switches the preset back to "Custom" when the user edits one of those
  fields.
- Lists (stages, capacitor groups) use `kind: 'list'`. `create(prev)` copies the previous item,
  which is what users expect when adding a stage.
- **Defaults:** a realistic, mainstream design that gives a sensible answer on first load (for
  example, a 50 Ω line on 1.6 mm FR-4 at 1 GHz).

## 5. Solve for X

Most calculators are "solve for X". Prefer that over separate analysis and synthesis modes.

- Mark the candidates `solvable: true` and list them in `def.solve.options`. The current unknown is
  `state.solveFor`.
- The solved field is shown in the **solved colour scheme**: green row, bold value, read-only. Set
  `solved: true` on the matching `ResultItem`. Its `key` is the state path, so `runCompute`
  writes the value back into the input box.
- **Keep one set of forward equations.** Invert numerically with `invert()` / `brent()` from
  `src/core/calc/solve.ts` instead of using a second approximate synthesis formula. Then a solved
  value fed back in reproduces the target exactly.
- If several input forms describe the same thing (Smith: R + jX, or |Γ|∠θ, or VSWR, or RL), use a
  "given as" `select`, plus `solvedWhen` / `onSolve` / `onUnsolve`. The non-chosen forms then
  show as solved, and clicking one switches to it.
- If no solution exists, return `ok: false` with an error that says what limits the answer (for
  example, "Z₀ = 20 Ω needs W > 10 mm on this substrate"). Never write NaN or ∞ back into an
  input.

## 5a. Mode switches

A **mode switch** is any change the user makes: a setting dropdown, an example, a number, a unit,
a toggle, the ◎ solve-for target, or adding or removing a list item. Many of these change other
values for the user, and that is where pages get glitchy. After any switch the page must show the
least surprising valid state.

- **No red error after a switch from a working page.** A red error is for numbers the user typed
  that make the answer impossible. It is a bug when an option, unit, example or solve-for change
  causes it.
- **Targets do not carry over between modes.** If a switch changes what the solved target means
  (astable ↔ monostable, a different topology), go back to forward analysis of the parts already
  entered (`apply` on the select sets `solveFor` to the analysis option). Do not solve for a target
  left over from the defaults or from the other mode. That is how the 555 page once turned 9.1 kΩ
  into 0.0009 Ω.
- **Declare the analysis option.** Set `solve.analysis` to the option that computes from the
  entered parts without a target, such as `'z0'` or `'tj'`, or to a function of the state when it
  depends on a mode. If a setting switch (dropdown, toggle or list edit) turns a working page into
  an error or NO SOLUTION, the core then shows that analysis of the current values with a yellow
  note, instead of a red error. Typed numbers and ◎ clicks still report their own errors, because
  the user asked for exactly that.
- **No stale numbers.** When there is no answer, the core shows "—" in every solved box and drops
  the graphs and tables drawn from the impossible value. Do not work around this.
- **Readable units.** The core moves a solved value to the prefix of its current unit that shows it
  as 1–9999 (mHz, Hz, kHz…), but it can only use the prefixes in the dropdown. So give unit lists
  enough prefixes for every value a solve can reach.
- **Output ranges cover every possible output.** The `min`/`max` of a field that can be solved
  must include every physically possible answer. For example, a duty cycle of 99.995 % is a valid
  result even if nobody types it. The core range guard is for impossible values, not for limits
  that only make sense for typed inputs.
- **Units are display only.** Changing a unit dropdown never changes a result.
- **The unknown stays visible.** If an option hides the field being solved, move `solveFor` to a
  visible field (usually the analysis option).
- **Examples are complete.** An example sets every value it depends on, including `solveFor`,
  options and units. Loading it after any other state then gives the same page as loading it after
  Reset.
- **A → B → A returns to the same answer** when no number changed in between.

## 6. Results (the main tab)

- **Headline:** 2–5 `primary: true` results become big cards. These are the answers the user came
  for, with the solved unknown first.
- Everything else goes in `group`ed key/value tables (`group: 'Line'`, `'Loss'`…), with at most
  about 8 rows per group.
- `display` is human formatting (`si(v, 'Ω', 4)`, `x.toFixed(2) + ' dB'`). `value` stays SI, for
  the API and CSV.
- Use `tone` sparingly: `fail` means a limit is broken, `warn` a marginal or doubtful result, and
  `pass` only for an explicit pass/fail check. A calculator with a pass/fail verdict sets
  `report.status`, shown as a badge beside the summary.
- `summary` is one line of context, such as "4 L-network solutions at 1 GHz · reference 50 Ω".
- **Tables (Tables tab):**
  - When the rows are candidate solutions (E-series pairs, preferred values) or are each judged
    against a limit (per-group peak voltage), set `rowTones`. Use `pass` when the row works,
    `warn` when it works but is close to a limit, and `fail` when it doesn't work. The rows get
    pale green, yellow and red backgrounds, and a key appears under the table.
  - Use the calculator's own warning limits for the thresholds, and say what they are in the
    table `note`.
  - Leave `rowTones` unset on tables that only list data: breakdowns, ideal-vs-built parts, R–T
    lookups, cascades.
- **Warnings:**
  - Use them when the answer is outside the model's validity, physically doubtful, or likely to
    surprise. Each warning says what is wrong **and what to do about it**.
  - Never let a model run silently past its validity range. Check the published limits (u, εr,
    frequency) and warn.
- Notes are for assumptions and method caveats. Keep each one to a sentence.
- `details` holds intermediate values (εeff before dispersion, g-values, matrices). It is for
  agents and debugging, not the UI.

## 7. Graphs

- **Every calculator gets at least one graph.** If the answer is a single number, plot it against
  the most interesting input.
- The first graph is the one most users want. Others go in tabs, three at most.
- **Colours:**
  - Leave `color` unset to get the shared palette.
  - When you pick colours, use the house hues: `#1f4e5f` teal-blue, `#c47b17` amber, `#4f8a8b`,
    `#8b1e1e` limit red, `#6b5b95`, `#2f7d4f`, `#9a8f7a` neutral.
  - Write them for the light theme. The dark theme lightens them automatically (`themed()` in
    `core/ui/theme.ts`).
  - Limit lines (`hlines`) are red-ish and dashed. The operating point is a `vline` or `marker`.
- **Axes:** label and SI unit in the axis title. Use `log: true` for frequency spans over one
  decade. Set `xRange` when the interesting region is a sub-span.
- **Zero lines:** the core draws x = 0 and y = 0 (first y axis) darker than the grid on every
  linear axis whose range contains 0, so the origin reads at a glance; when 0 is at the edge it
  darkens that side of the frame. Log axes have none. Set `zeroLine: false` on an axis only when 0
  means nothing there and the line would mislead.
- **Legend:** it sits in the top-right corner of the plot. When the traces fill the whole frame (a
  time waveform), set `legend: 'below'` so it doesn't hide them.
- **Time-domain waveforms** (I²C bus waveform) make a good first graph when the calculator is about
  edges or timing. Draw the ideal or driven level as a dotted trace behind the real one.
- **Companion graphs:** to show a graph beside the main one instead of in its own tab (Smith chart
  + match bandwidth), set `beside: '<graph id>'` on the main graph.
- **Smith charts:** use `kind: 'smith'` with Γ-plane traces and points. A point with `dragId`
  becomes draggable. Implement `def.onDrag` to write the new position back into whatever input
  form is active, rounded to sensible digits.
- Hover readouts and CSV export come free. Don't build your own.

### Graph labels

- Marker labels sit beside their dot. Reference-line (`vlines`) labels are drawn at the top of the
  plot beside their line.
- The core moves both clear of the plot edge, the inside legend and each other. Keep these labels
  short ("C = 100 nF", "f₀ = 10.7 MHz"), because a long label is stacked into a lower row.
- An empty `label` draws the line without text.

## 7a. Diagram (circuit, cross-section, block diagram)

**Every calculator gets a drawing** of what it models, because it is the fastest way to see which input is
which. Declare it on the module, not by hand in `view.setup`:

```ts
diagram: { title: 'Circuit', draw: (s: MyState, report, compact) => circuit(s, report) }
```

- **Title.** Use `'Circuit'` for schematics, `'Cross-section'` for physical geometry (microstrip, coax,
  wire, PCB trace), and `'Diagram'` for block diagrams, link sketches and thermal networks.
- **Kind of drawing.** Pick the one an engineer would sketch on paper.
  - An electrical calculator gets its schematic.
  - A geometry calculator gets the cross-section, roughly to scale with clamped ratios.
  - A system calculator (link budget, noise cascade, ADC noise) gets a block diagram with the
    contributions annotated.
- **Build with** `Schematic` in `src/core/schematic/schematic.ts`.
  - Parts: R, L, C, sources, diode/LED/zener/Schottky, crystal, thermistor, switch, speaker, motor,
    amplifier and op-amp, IC block with pins.
  - Transistors: `bjt(x, y, { type: 'npn' | 'pnp', mirror })` and `mosfet(x, y, { type: 'n' | 'p', mirror })`
    are placed by their centre and return their pin ends (`{ b, c, e }`, `{ g, d, s }`) to wire to.
    NPN and N-channel put the collector or drain on top; PNP and P-channel put the emitter or source
    on top, so the supply is always above.
  - Annotation: arrows, dimension lines, antenna.
  - Anything else: `shape()` with the shared CSS classes.
  - Never hard-code colours. The classes follow the theme.
- **Live and honest.**
  - Redraw from state: every option that changes the circuit changes the drawing.
  - Label parts with the input symbols and live values.
  - Draw from state even when `report.ok` is false, if you can.
- **Tones** link the drawing to the form:
  - `solved` (green) for the solve-for unknown;
  - `hl` (red) for a limit exceeded or the worst case;
  - `muted` for context that isn't the design (source and load).
- **Legibility.**
  - Keep the viewBox about 460 wide or less, so the 10.5–12 px labels stay readable when the
    drawing shrinks to phone width.
  - Wider drawings get a portrait layout when `compact` is true, or `scroll: true`.
  - No label may overlap a symbol or another label for any option or example.

## 7b. PCB materials

Every drawing of a board (cross-section, top view, stackup, pad, via, BGA) shows its materials the same
way on every calculator, so a user who has learnt the colours on one page can read any other. Draw them
only through `src/core/schematic/pcb.ts`. The colours live in one file, `src/styles/pcb.css`, so they can
be tweaked in one place. Never hard-code a material colour.

| Material | Kit name | Look |
|---|---|---|
| Solder mask | `mask` | green |
| Solder mask over copper (top views) | `maskCu` | lighter green: a trace under mask |
| Copper: traces, planes, pads, via barrels | `cu` | copper tone |
| Exposed copper with a gold finish (ENIG pads) | `gold` | gold |
| Solder paste, before reflow | `paste` | silver-grey with a grain texture |
| Solder after reflow (joints, BGA balls) | `solder` | smooth, lighter silver |
| Laminate (FR-4 core, prepreg) | `fr4` | light tan with a woven-glass texture |
| Exposed laminate, no copper or mask (top views, board edge) | `fr4Bare` | darker tan, woven |
| Silkscreen | `silk` | white, thin grey outline |
| Drilled hole seen from above | `hole` | near-black |
| Air: hole interior in a section, clearance | `air` | background, dashed outline |
| Component body | `part` | dark grey |
| Copper on another layer, seen through the board (top views) | `cuHidden` | faded copper, dashed edge |
| Stencil foil (stainless steel) | `steel` | cool blue-grey, brushed streaks |
| Conformal coating | `coat` | translucent light-blue film |
| Non-conductive via plug / fill epoxy | `resin` | muted violet-grey |
| Resistive film or ink (embedded resistors) | `film` | dark wine (distinct from copper) |

- **Helpers.**
  - `pcbRect(sch, mat, x, y, w, h, { rx, tone, layer })`.
  - `pcbShape(sch, mat, tag, attrs, …)`: paths, circles and polygons.
  - `pcbLegend(sch, x, y, mats, { cols, colW, names })`.
  - `pcbClass(mat)`: only for hand-built SVG.
  - Textures (weave, grain) are added automatically.
- **Legend.**
  - Every PCB drawing ends with a legend of the materials it shows: only those, in a consistent spot
    (bottom-left), in the order the table lists them.
  - Rename an entry where it helps, e.g. `names: { fr4: 'Prepreg' }`. Keep the colour meaning.
- **Draw order.**
  - Laminate first.
  - Then copper.
  - Then the finish (gold) on exposed copper.
  - Then mask, conformal over traces, with openings over pads.
  - Then silkscreen on the mask.
  - Then paste or solder.
  - Then parts.
- **Real proportions where they teach something.** Mask about 20–30 µm and finish a few µm. Draw thin
  layers at a legible minimum (about 2–3 px), not to scale.
- **A conductor's width and thickness share one scale** (the user asked for this: the shape must not
  stretch or squash as W or T change). Pick one factor k, as large as fits (copper at most about 40 px
  thick and 300 px wide), but never so small that the copper is thinner than about 5 px. If the full
  width won't fit at that thickness, run the conductor past both edges of the drawing, cut off the mask
  and laminate edges there, and draw W as two outward arrows to the edges with the value between them.
  A too-narrow conductor is widened to about 3 px. Say which applies in a small `sch-hint` note under
  the drawing ("W and T to scale", "to scale · runs past both edges", "W widened to be visible").
  Reference: `src/calculators/trace-width-current/diagram.ts`. Spacings and heights near the trace
  should use the same k where they fit; when they can't, clamp them and say so in the note.
- **Traces are drawn rectangular** (no etch trapezoid) on every page for now; the etch-profile choice is
  still open with the user.
- **Tones.**
  - Materials keep their colours. The solved quantity is shown by its green dimension line and label.
  - A material outline in `tone: 'solved'` is only for large shapes. On a thin trace the outline would
    hide the copper.
  - Exceeded limits get `tone: 'hl'`, a red outline, plus a red dimension or label.
- **Text over a material** gets the `sch-halo` class (e.g. `'sch-label sch-halo'`), so it stays
  readable on any fill in both themes.
- **Top views:**
  - laminate with no mask is `fr4Bare`;
  - mask over bare laminate is `mask`;
  - mask over copper is `maskCu`;
  - mask openings show `gold` (or `cu` for bare copper);
  - holes are `hole`.
- **Cross-sections:**
  - laminate is `fr4`;
  - a hole interior is `air` inside a `cu` barrel;
  - name prepreg and core in the legend when both appear.
- **Reference:** `src/calculators/microstrip/index.ts` (cross-section). Check new drawings with
  `src/dev/snapshot.ts` in both themes.

## 8. Theory section

- Start with an `intro.lead`: two or three sentences on what the calculator does and which method it
  uses.
- Sections, in roughly this order:
  1. the governing equations (KaTeX, with variables defined);
  2. corrections or extensions;
  3. how solve-for works on this page;
  4. practical design notes (what really matters on a board: tolerances, what the model misses);
  5. references (full citations).
- State validity ranges and accuracy claims honestly, relative to what the source says.
- In `theory.ts` strings, LaTeX backslashes are doubled (`\\frac`). Use typographic apostrophes
  (’) inside single-quoted strings.

## 9. Examples

Give 3–6 `examples` that teach something, such as a published worked example (e.g. "Pozar ex. 5.1"),
a common real-world case, and an edge case that shows a warning. The first example equals the
defaults. Use labels that say what is set up, not just a name.

## 10. AI control (automatic if you follow the above)

The API reads the field spec. Every input is settable by path with unit strings, and every result,
table and graph is retrievable. Your job is only to:

- keep `ResultItem.key`s stable and meaningful (they are API names);
- write `method` (one sentence plus sources);
- use `controls` for any settable top-level key that is not a form field;
- validate in `compute`, and throw an `Error` with a human message for bad combinations.

WebMCP tool registration exists in `src/app/api.ts` but is **experimental and deliberately kept out
of the public docs** (`public/ai.html`, `public/llms.txt`, README) until browser support settles.

## 11. Look and feel checklist

- [ ] Opens with sensible defaults and a non-empty graph.
- [ ] Has a diagram tab that follows the options, marks the solved part green, and stays legible at
      phone width.
- [ ] A board drawing uses the PCB material kit (§7b) with a legend, and reads well in both themes.
- [ ] Each input row fits on one line at the default column width.
- [ ] The solve-for unknown is green, in the input and in the result card.
- [ ] Changing any input updates graph and results immediately (no "Calculate" button).
- [ ] The page looks right in light and dark (toggle with the ☾/☀ header button; setting
      `data-theme` by hand does not redraw the plots) and at phone width.
- [ ] Settings → Preferred units changes the relevant dropdowns.
- [ ] Reset and every Example produce valid results.
- [ ] Warnings appear at the model's validity limits.
- [ ] Fuzz tests run through `runCompute` (not just `def.compute`), so they see the core
      solved-range guard, and assert that valid inputs are never refused.
- [ ] `npx tsc --noEmit` and `npx vitest run` pass.
- [ ] The mode-switch harness (section 12) reports no high-severity flags, and every medium flag
      is fixed or explained.
- [ ] Equations are cross-checked against an independent source (a Python re-implementation
      or a published table) and recorded in a test.

## 12. Testing regime

Every calculator goes through all five layers before it ships, and again after any change to its
model or fields. The person who builds a calculator does not do its review.

### 12.1 Factual verification (is the physics right?)

1. **Primary source for every equation.** Use a textbook, standard, paper or datasheet, cited in
   `method` and in the theory references. Other calculators are only a feature checklist.
2. **Published worked examples.** Reproduce every worked example you can find (Pozar, Balanis,
   IEC/IEEE standards, vendor application notes) and record each one in a test with the source.
3. **Independent re-implementation.** The builder writes a Python version from the source, not
   from the TypeScript. The reviewer then writes their own, without reading the builder's, and
   compares the page with it at hundreds to thousands of random points across the whole input
   range, including the extremes.
4. **Limits and asymptotes.** Check that the answer goes to the textbook limit at the edges
   (lossless, very thin, very wide, DC, f → ∞). Where an approximation's error is known, state it
   honestly on the page, measured against an exact method.

### 12.2 Unit tests (`npx vitest run`)

- A round trip for every solve option: solve, feed the answer back as an input, and get the
  target back.
- Every example computes, gives the expected result and raises no unexpected warnings.
- A fuzz test of at least 300 random states through `runCompute` (not `def.compute`), so the core
  guard and write-back are included. It checks that nothing throws, values are finite, no NaN or
  undefined appears in any text, recomputing gives the same answer, and valid inputs are never
  refused.
- A regression test for every bug a review found.

### 12.3 Mode-switch harness (`src/dev/modeswitch.ts`)

This test drives the real UI of every calculator and inspects every state it reaches, which the
unit tests cannot do.

- **Phase 1, every single switch.** Start from the defaults and from each example in turn. From
  each start, try every available action once: every option of every dropdown, every unit, every
  toggle, every ◎ button, every list button, every example, and every number at ×10, ÷10, its
  minimum and its maximum.
- **Phase 2, every pair of setting switches.** Try every ordered pair of setting switches from the
  defaults (dropdowns, toggles, ◎, examples, and one alternative per unit dropdown). If there are
  more than 400 pairs, a random 400 are used.
- **Phase 3, random walks.** Run 12-step walks that mix settings, units, ◎, examples and random
  numbers until the time budget runs out (60 s per calculator by default).
- **What is checked after every step:**
  - a red error after a switch from a working state, or a NO SOLUTION status after one;
  - an input box that does not show its state value (wrong unit scale, stale solved value, or a
    unit dropdown out of step);
  - unreadable values (below 0.001 or above 99 999 in the shown unit);
  - values outside the field's limits;
  - NaN, undefined, null, Infinity or "[object" text anywhere;
  - a result that changes when only a unit changed;
  - no visible unknown on a solve-for page;
  - results that change when the same state is recomputed;
  - round-trip failures: from a consistent state, solving for any other unknown must return the
    value already in the state;
  - huge jumps after a pure setting switch;
  - empty or non-finite graphs;
  - diagram labels that overlap or are clipped, and NaN in the SVG;
  - console errors.
- **How to run it:**
  - **Headless:** run `npm run dev`, then `npm run modeswitch -- --budget 60 --workers 4`. This needs
    Chrome, set with `CHROME=/path/to/chrome`. Every flag is written with the trail of actions that
    reproduces it.
  - **In a browser tab on the dev server:**
    `(await import('/src/dev/modeswitch.ts')).runCalc(id, { budgetMs })`. Use `replay(id, trail)`
    to reproduce a flag, and `runAll(ids, { sink })` to run several calculators.
- **Practicalities:**
  - Chrome throttles timers in a tab that has been hidden for more than about 5 minutes, which cuts
    a run to a tenth of its actions. Reload the tab before each run.
  - Use the dev server without hot reload when several people edit at once: run `EE_NO_HMR=1 npx
    vite --port 5181`, or use the `eecalc-test` launch entry.
  - `src/dev/snapshot.ts` renders the diagram (`shotDiagram`) or graph (`shotGraph`) to a PNG through
    a local collector, for windows that cannot take screenshots.
  - Known false positives:
    - the 30 % label-overlap check can trip on two-line labels with subscripts;
    - round trips from states whose target is not an input of the current mode, or that are
      rounded on purpose (E-series parts, whole bits, whole filter orders).

    Explain each one in a code comment.
- **Pass criteria:**
  - no high-severity flags;
  - every medium flag fixed, or explained in a code comment when the behaviour is right (for
    example, a round-trip "failure" whose target is not an input of the current mode);
  - low flags reviewed.

### 12.4 Review of the switched states

The harness finds candidates. A reviewer then judges them.

- Reproduce every high and medium flag with `replay` in the browser and look at the page: the
  diagram, the graph, the result cards and the notes.
- Check the harness's sampled post-switch states (state and results) against the reviewer's own
  Python. A number can look tidy and still be wrong.
- After a fix, the same reviewer re-verifies, and the harness is run again for that calculator.

### 12.5 Browser pass

- Light and dark mode, switched with the ☾/☀ button.
- Phone width (375 px), with no sideways page scroll.
- No console errors.
- Every diagram checked with labels legible and not overlapping.
- Pass `tabId` on every browser call when several agents share the browser.

## 13. Notes, versions and changelogs

**Read `NOTES.md` before changing a calculator.** It records the choices that were made on purpose:
which model and why, alternatives rejected, departures from other calculators' feature lists, kept harness flags, rounding
rules, decisions the user made, what is verified and what is only from memory, and the bugs reviews
found. Don't undo an item under "Deliberate choices" without asking the user. Template sections:

1. Purpose and scope
2. Model and why
3. Deliberate choices — ask before changing (with who decided and when)
4. Sources (verified or from memory)
5. Known limits and open items
6. Review history (one line per bug, with the failing input)
7. Changelog

Write it when you build the calculator, and update it in the same change as the code whenever you
make a design choice or fix a bug. Keep it short: 40–90 lines.

**Versions** use Semantic Versioning, `MAJOR.MINOR.PATCH`:

- **PATCH** for a bug fix that makes the existing behaviour correct (a wrong constant, a unit slip, a
  label overlap, a stale value after a switch).
- **MINOR** for a deliberate change in behaviour or features: a new input, output, option, model,
  graph or preset, or a changed default.
- **MAJOR** for an overhaul that makes it a different thing: a new simulation method, many new
  variables, a rewritten model.

There are three kinds of version:

- **Each calculator** has `version` in its `def.ts`. It is shown in the inputs toolbar, the theory
  section and `eeCalc.describe(id)`. Bump it in every change to that calculator, and add a line to
  the `## Changelog` in its `NOTES.md`: `- 0.1.1 (YYYY-MM-DD) — what changed and why`.
- **The site** is `APP_VERSION` in `src/app/version.ts`, kept equal to `package.json` (a test checks
  it). It is shown in the header. Bump it for changes to the shell, the core, the styles or the set of
  calculators, and log them in `CHANGELOG.md` at the repository root (Keep a Changelog format, newest
  first, under `[Unreleased]` until a version is cut).
- **The AI API** is `API_VERSION` in the same file (`window.eeCalc.version`). Bump MINOR when a call
  or field is added, and MAJOR when an existing call or field changes or goes away, because agents
  program against it.

A new calculator starts at `0.1.0`. A shared-core change that alters what a calculator shows (a new
graph style, say) bumps the site version, not every calculator.

