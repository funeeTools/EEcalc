# Series / Parallel Resistors — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/series-parallel-resistor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-series-parallel.test.ts`

## Purpose and scope
1–8 resistors, all in series or all in parallel. The page gives R_eq, each part's V, I and P for an applied V or I, the tolerance band of R_eq, and the one resistor that gives a target R_eq, snapped to E-series. Mixed networks are reduced by hand, one group at a time (the theory says how). Capacitors and inductors are not covered.

## Model and why
- Series R_eq = ΣR; parallel 1/R_eq = Σ1/R (Kirchhoff's laws).
- Solving resistor k uses the exact inverse (`solveOne`): no positive answer when a series target is ≤ the sum of the others, or a parallel target is ≥ the others in parallel.
- Worst case is **exact**, with every part at −t or every part at +t. This works because R_eq increases with every R_i and is homogeneous of degree 1.
- RSS spread uses the log sensitivities (series R_i/R_eq, parallel R_eq/R_i; both sum to 1). For n equal parts it reduces to t/√n.

## Deliberate choices — ask before changing
- **Solve options:** `req` (analysis) and `rk` with `solveIdx`. ◎ is on each list item (`solvedWhen`), following the nf-cascade pattern. The solved part follows its identity through list edits (a WeakMap in `sync`); removing the solved part returns to analysis.
- **Switching the connection sets `solveFor = 'req'`** (§5a: a target R_eq means something else in the other connection).
- **Harness flags kept as legitimate.** The "error-after-edit" flags are typed targets or resistors (×10, min, max) that no positive R_k can meet. The messages name the limit. A comment in def.ts explains this.
- **E-series candidates:** the values just below and above the exact one (`bracketE`). Rows are toned against max(tolerance of R_k, 0.5 %), as on the voltage-divider page.
- **"Smallest chip"** per part uses `chipFor` from voltage-divider/model (2× power margin plus the voltage limit). Beyond a 2512 the part is drawn red and a warning appears.
- **R_eq field min is 1e-5 Ω, not 1e-4:** 8 × 0.1 mΩ in parallel is 12.5 µΩ, and the core range guard would otherwise reject it.
- **Diagram:**
  - Series is a loop with up to 4 parts per row, wrapping back along the bottom. Above 3 parts it shows only each part's voltage, because "V · P" collided.
  - Parallel uses horizontal rungs between two rails, and the height grows with the count.
  - `parallelDrawing` is reused by current-divider: change it with both pages in mind.
- **Departures from the reference calculator.** The reference calculator shows both totals always and covers C and L. This page is resistor-only (per the slug) and adds tolerance, per-part operating points, solve-for-one and E-series.
- **Defaults:** 10 kΩ ∥ 4.7 kΩ across 5 V, in analysis.

## Sources
- Horowitz & Hill 3e §1.2.2; Alexander & Sadiku, *Fundamentals of Electric Circuits* 6e, §2.5–2.6. Both from memory; the equations are standard.
- Vishay CRCW e3 limits via the voltage-divider table (not re-verified).
- I found no single-topology published numeric example. The second source is the identities: product-over-sum, nR, R/n, and t/√n for RSS.

## Known limits and open items
- No C or L mode, and no mixed networks.
- No "best two standard resistors to make X" search (a possible future feature).
- Python check: solve-R_k in series reaches 1e-9 relative error when R_k is much smaller than the others. That is round-off in target − Σothers, and it is inherent.

## Review history
- Graph `req-vs-rk`: the asymptote sat on the frame edge and the vline label crossed the target line. Fixed with y headroom (parallel max ×2, series min ÷2) and by moving the part value to the marker label.
- Harness: "1e+2 µΩ" in messages was replaced by a literal "0.1 mΩ … 10 TΩ".

## Changelog
- 0.1.0 (2026-11-26) — first release: series/parallel R_eq, per-part V/I/P, exact worst case and RSS, solve one resistor with E-series snap.
