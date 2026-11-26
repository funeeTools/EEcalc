# PCB Trace Width vs Current — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/trace-width-current` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-trace-width-current.test.ts`

## Purpose and scope
Trace width, maximum current or temperature rise for a copper trace (solve W, I or ΔT), plus DC resistance, voltage drop and loss at the hot temperature, and the width the other layer type would need.

Not covered: IPC-2152 (no model in the repo; see limits), pulse/fusing current (`pcb/fusing-current`), AC/skin-effect resistance (`pcb/trace-resistance`).

## Model and why
- IPC-2221 empirical fit: I = k·ΔT^0.44·A^0.725 (A in mil²); k = 0.048 external, 0.024 internal (internal = external derated by half). Closed-form inverses exist and are used by the tests as a check on the numeric solve.
- R = ρ(T)·L/(W·t) at T = T_a + ΔT, with annealed-copper ρ20 = 1.724e-8 Ω·m and α = 0.00393 /°C (IEC 60028).
- Warnings outside the IPC-2221 chart span: ΔT 10–100 °C, 35 A external / 17.5 A internal, 700 mil², 400 mil, ½–3 oz; conductor above about 105 °C for FR-4; width below 0.1 mm.
- Stated accuracy: an empirical fit to 1950s data, not a first-principles model.

## Deliberate choices — ask before changing
- **IPC-2221, not IPC-2152** (builder, 2026-11-22). IPC-2152's charts are not freely available, so the repo has no 2152 model. The page says 2152 is not uniformly more permissive: per Brooks & Adam it gives about 25 % less current than 2221 for external traces in still air, much more for internal traces and near planes. Trace resistance and microvia pages also use this fit.
- **Drawing: W and T on one scale** (user, 2026-11-24: "Copper thickness and width should be ratiometrically correct in the diagram whenever possible", and if too wide, cut off the mask edges and show W as arrows). This page is the reference implementation of the style guide §7b rule. T is at most 40 px, never below 5 px; a trace wider than 300 px runs past both edges with outward W arrows; a trace under 3 px is widened. A `sch-hint` says which applies. Do not stretch either axis independently.
- **Traces drawn rectangular** (no etch trapezoid), per §7b, until the user makes the etch-profile choice (the user asked on 2026-11-24 why etchback is left out; the coordinator said it was never a deliberate decision: builders drew the rectangle that the IPC-2221 fit and the impedance formulas assume. Only `pcb/fusing-current` models an etch profile.)
- Drawing uses the shared PCB material kit (laminate, mask on the outer layer only, copper) with a legend; the heated zone is a tint behind the materials, not a material (coordinator, 2026-11-24).
- Out-of-range solves give explicit messages, not "no solution" (builder, after review 2026-11-22): rise above 500 °C shows "> 500 °C"; width over 1 m "> 1 m"; negligible rise "NOT LIMITING" "< 0.01 °C"; width under 1 µm "NOT LIMITING" "< 1 µm".
- Thickness uses the project's "oz" = 34.79 µm; calculators using 1.378 mil/oz give widths about 0.6 % narrower (builder).
- Default is 3 A on an outer layer, 1 oz, 10 °C rise, 25 °C ambient, 50 mm long: W = 54.15 mil (1.375 mm).
- The theory states the 2.6× area for doubled current follows from the empirical 0.725 exponent, not surface-only cooling (reviewer, 2026-11-22).

## Sources
- IPC-2221A §6.2 / Fig. 6-4 (NBS report 4283 via MIL-STD-275 / IPC-D-275): **not verified against the document.** The builder could not get the PDF (dead link); the fit and chart span are as reproduced in Brooks & Adam and common references.
- D. Brooks, J. Adam, "Trace Currents and Temperatures Revisited" (UltraCAD, 2015): history and the 2152 comparison.
- IEC 60028: copper ρ and α.
- Checked against the builder's Python: 74.162 mil², 54.145 mil, R = 19.078 mΩ at the default; 71.92 mil, 93.55 mil, 0.5334 A, 50.13 °C cases.

## Known limits and open items
- Still-air, single-trace fit; no planes or neighbours. A real IPC-2152 figure would need a sourced fit.
- On 2026-11-24 the coordinator listed merging this page with Trace Resistance as a candidate; the user said they would investigate. No decision is recorded.
- No etch trapezoid in the drawing (above).

## Review history
- 2026-11-22 review: no calculation bugs. Fixed: the theory wording on the 2.6× area; the generic "no solution in range" message for a target above the search range (200 A in 0.1 mm → now "> 500 °C").
- 2026-11-24 review of the restyle: numbers unchanged, kit colours match, failed width drawn red. Shipped.
- 2026-11-24: the drawing stretched and squashed as W and T changed (user report). Fixed with the one-scale rule.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed 2026-11-22 (messages and theory wording), restyled to the PCB kit 2026-11-24, one-scale W×T drawing 2026-11-24.
