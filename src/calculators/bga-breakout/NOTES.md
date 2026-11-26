# BGA Breakout Width — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/bga-breakout-width` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-bga-breakout.test.ts`

## Purpose and scope
Escape routing from a BGA: how many traces fit between neighbouring lands or via pads (N), the widest trace, or the largest land or via pad for N traces; dog-bone and via-in-pad checks; and an estimate of signal layers for the rows to escape. Solve options: N (analysis), W, land, via pad (and the pitch/preset).

Not covered: land sizing from the ball (`pcb/bga-land-pad`), pad diameter limits for plated holes (`pcb/maximum-pad-diameter`, which imports this model), differential-pair or length-matched breakout, staggered rows.

## Model and why
- Channel arithmetic: N traces of width w with clearance s in a gap g = p − D fit when g ≥ N·w + (N+1)·s, so N = ⌊(g − s)/(w + s)⌋, w_max = (g − (N+1)s)/N, D_max = p − N·w − (N+1)s. Lands apply on the top layer, via pads on inner layers.
- Rows escaped per signal layer = N + 1 (outer row direct, each further row needs one more trace through every channel outside it). Rows deep = half of the array rows; power/ground balls that drop straight to planes reduce the estimate (stated in a note).
- Dog-bone: the via sits at the centre of four balls, p/√2 from each land, so copper clearance = p/√2 − (D_land + D_via)/2. Via-in-pad must be filled and plated over (IPC-4761 type VII).
- Land guidance for collapsing balls: land about 20–25 % smaller than the ball (IPC-7351B guidance; the detailed tables are on `bga-land-pad`).
- Warnings: no trace fits; NSMD/SMD opening inconsistent; mask web under 75 µm (rule of thumb for liquid photo-imageable mask); annular ring under 50 µm (rule of thumb; IPC-6012 Class 2 allows breakout); drill as large as the via pad; dog-bone collision; via-in-pad pad larger than land; W under 75 µm (HDI pricing).

## Deliberate choices — ask before changing
- A tiny relative tolerance (1e-9) counts an exact fit (W = W_max gives N, not N − 1) (builder; tested).
- NSMD ↔ SMD keeps the solderable diameter, and A → B → A restores it (builder; tested). A preset switch while solving W goes back to the analysis of the new package.
- Lands or via pads as wide as the pitch are an input error ("they overlap").
- Dog-bone vias are assumed tented, so they do not reduce the mask web.
- Defaults: 0.8 mm pitch preset, 0.45 mm ball, NSMD land 0.35 mm (mask opening 0.45 mm), dog-bone via pad 0.45 mm / drill 0.2 mm, channel between pads, W = s = 0.1 mm.
- The ◎ on the via pad after typing a 1.5 mm trace width, and a typed 0.22 mm pitch, give NO SOLUTION on purpose: the user asked for it (code comment, builder; the harness high flag is kept).
- The legend picks its columns by entry count (coordinator edit, 2026-11-24: 4 columns of 110 px above six entries, otherwise 3 of 148 px).
- Drawing: top view of a corner of the BGA with gold pads in mask openings, traces between, dog-bone vias and the package outline, on the PCB kit. Traces rectangular until the etch-profile choice (§7b).
- Where this page's counterpart in the reference calculator differs: not recorded.

## Sources
- Intel AN 114 §1.3.4.1 and Xilinx UG1099: channel arithmetic and rows per layer (cited in the model; no record that they were verified against the documents).
- IPC-7351B BGA land-pattern guidance, IPC-4761: cited from memory/secondary sources.
- The reviewer's own code matched the channel arithmetic. Test: 1.27 mm PBGA, two 0.127 mm traces at 0.127 mm need a land ≤ 0.635 mm.

## Known limits and open items
- Round lands and vias on the full pitch grid, one clearance rule for trace–trace and trace–copper, straight traces through the middle of the channel.
- Thin record: the builder's report (features, sources) was only partly captured; this note relies on the code for details.

## Review history
- Reviewer 2026-11-24: the BGA channel arithmetic matched their own code; no bug recorded for this page.
- Harness 2026-11-24: one high flag (◎ on the via pad after typing a 1.5 mm W), documented as intended; the rest were integer round trips, typed extremes and the new overlap errors.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (no calculation bugs recorded).
