# Minimum Conductor Spacing — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/minimum-conductor-spacing` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-conductor-spacing.test.ts`

## Purpose and scope
Minimum electrical spacing between two conductors from the IPC-2221B Table 6-1 for a peak voltage, conductor condition (column) and altitude; or the maximum voltage a given gap allows. Solve options: d (analysis) and V_max (inverse of the staircase). Input is DC/peak or RMS.

Not covered: creepage over contaminated surfaces, safety standards (IEC 60664, UL), pollution degree, the IPC-2221C table.

## Model and why
- Table 6-1 is a step function of voltage band (0–15, 16–30, 31–50, 51–100, 101–150, 151–170, 171–250, 251–300, 301–500 V; upper end inclusive). Above 500 V, d = d(301–500 V) + (V − 500)·(per-volt increment of the column), e.g. B1 at 600 V = 0.25 mm + 100 × 0.0025 mm/V = 0.50 mm.
- Columns (IPC-2221B): B1 internal; B2 external uncoated ≤ 3050 m; B3 external uncoated > 3050 m; B4 external with polymer coating (solder mask); A5 external with conformal coat; A6 component leads uncoated ≤ 3050 m; A7 leads with conformal coat.
- B2 becomes B3 above 3050 m; the coated columns and B1 ignore altitude (a note says so).
- The all-columns table shows pass/fail tones against the entered gap; the graph is the staircase.

## Deliberate choices — ask before changing
- **IPC-2221B, not 2221C** (coordinator, 2026-11-24; the project memory also records it as a decision taken). The coordinator brief asked for "B1–B5, A6/A7", which is the 2221C layout (B1–B5, A6–A8, different values such as B2 = 0.64 and B4 = 0.075). The builder found that edition only in KiCad and a Rust crate that probably copies KiCad, so it is **unverified** and not implemented. Options noted for the user: keep 2221B, or add an edition select once 2221C is checked against the standard. Do not switch without asking.
- Two cells disagree between sources: B3 at 151–170 V and B1 above 500 V. The values used are 3.2 mm and 0.0025 mm/V (Altair copy, its worked example, KiCad); Sierra Circuits shows 6.4 mm and 0.025 mm/V. The reviewer confirmed the page's values match IPC-2221B (builder, reviewer, 2026-11-24). A test locks both choices.
- **Uncoated leads above 3050 m have no IPC value.** The page applies max(A6, B3) as a labelled conservative stand-in and warns (builder).
- B4 note: it holds only where the mask covers both conductors and the gap without openings.
- V_max is shown as sine RMS (peak ÷ √2) when the RMS option is on. A gap below the smallest table value has no voltage (NO SOLUTION).
- Default: 100 V peak, 0.6 mm, B2, 0 m altitude. The drawing uses the PCB kit (top view and cross-section, internal vs external, masked vs conformal); traces rectangular until the etch-profile choice is made (§7b). The one-scale W×T rule concerns trace width and thickness; this drawing's scaling was not checked here.

## Sources
- IPC-2221B (Nov. 2012) §6.3, Table 6-1: **not read from the standard itself.** Transcribed from the Altair PollEx "IPC Material" help page and cross-checked cell by cell against Sierra Circuits (protoexpress.com); the KiCad pcb_calculator table agreed with the Altair values. The reviewer independently confirmed every cell matches IPC-2221B.
- The IPC-2221C layout: KiCad only; unverified.

## Known limits and open items
- 2221C not available (above).
- It is a design-rule lookup, not a safety certification.

## Review history
- 2026-11-24 review: every table cell confirmed; no calculation bugs recorded.
- Harness 2026-11-24: only documented staircase round trips, typed extremes and unreadable values in in/mil remained.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24 (IPC-2221B table, V_max inverse), reviewed 2026-11-24.
