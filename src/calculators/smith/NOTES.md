# Smith Chart & Matching — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/smith-chart` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-smith.test.ts`

## Purpose and scope
A load on a Smith chart, entered as R + jX, |Γ| ∠Γ, VSWR or return loss (the other forms are calculated), optionally behind a lossless line, with every L-network that matches it to Z₀, component values at the design frequency, the VSWR ≤ 2 bandwidth of each, and the chosen solution drawn on the chart and as a circuit. One of the five phase-1 pages (2026-11-21); it is the reference for the custom canvas Smith chart.

Not covered: stub or quarter-wave-transformer synthesis (the line may act as a transformer, but there is no stub solver), lossy components or finite Q, noise and stability circles, multi-section matching.

## Model and why
- Γ = (Z − Z₀)/(Z + Z₀), line transform Z_in = Z_l (Z_L + jZ_l tanθ)/(Z_l + jZ_L tanθ) (Pozar 4e §2.3–2.4, eq. 2.44).
- **All real L-section solutions** for both topologies (shunt element at the load or series element at the load), Pozar §5.1 eqs. 5.3–5.6; components at the design frequency, with a ⚠ mark when a part is below about 0.5 pF or 1 nH.
- Bandwidth: VSWR ≤ 2 edges (|Γ| ≤ 1/3) found by stepping outward geometrically (at most ±50 %) and then bisection, independent of any plot grid; the plot span follows the widest band (at least ±1 %). The solution with the widest band gets a ★.
- High-Q load warning at |X|/R above 10: narrow match, real component loss will dominate.

## Deliberate choices — ask before changing
- **Chart features requested by the user, 2026-11-22** (after asking what the page was based on, since it looked different from the reference calculator's): an angle readout and a dotted |Γ| circle at the cursor, a 3-position Z / Y / Z+Y grid toggle (stored at `eecalc:smith:grid`), draggable points (dragging Z_L rewrites the load in whichever form is being entered), the match-bandwidth graph drawn to the right of the chart instead of in a tab, and more minor grid lines. Commit abac709.
- The page is based on Pozar ch. 2 and §5.1; it adds L-network matching, line rotation and a bandwidth plot beyond what the reference calculator offers (coordinator's answer to the user, 2026-11-22). The reference calculator has normalised r/x inputs, a draggable point, a Z/Y/Z+Y toggle, quick-pick buttons and sliders; the quick-pick buttons and sliders were not copied (reason not recorded).
- Solutions are numbered in the order found, **not ranked by merit**; the matching table is not row-toned because every solution gives a perfect match at the design frequency and they differ only in bandwidth, a preference not a pass/fail (coordinator, 2026-11-23).
- The "Matching solution on chart" input takes 1–4; an out-of-range number shows the last one with a note.
- A lossless load (R = 0, |Γ| = 1) stays lossless through rounding and gets "cannot be matched by a lossless network"; an open circuit gets "no match possible".
- Switching the load form keeps the load (A → B → A) (regression test).
- Residual column prints "< 10⁻¹²" (or ×10ⁿ above that) rather than e-notation: "1.4e-16" ran into the next row's "2" and the harness read "1.4e-162" (56 high flags, 2026-11-23).
- The Circuit tab (2026-11-22) shows the **selected matching network** between source and load, with the load drawn muted as R plus a series reactance. It has no green "solved" part, because no single component is the unknown (coordinator's note).
- Default: 25 − j30 Ω in a 50 Ω system at 1 GHz, no line.

## Sources
- Pozar, *Microwave Engineering* 4th ed. §2.3–2.4 and §5.1; Pozar ex. 5.1 (200 − j100 Ω to 100 Ω at 500 MHz) reproduced in the test from an independent Python check: 0.92 pF / 38.98 nH and 46.14 nH / 2.599 pF. Opening of the book is **not recorded**.
- Reviewer's own Python for Γ/VSWR/line/L-match agreed in the 2026-11-23 pass.

## Known limits and open items
- Ideal lossless components; real inductors and capacitors will shift the centre frequency.
- Bandwidth is capped at ±50 % of f.
- The page was 10 px too wide at 1000 px width in the hidden test tab; confirmed a test artefact (the side canvas default 300 px), not a layout bug.

## Review history
- Phase-1 reviews (2026-11-21): some loads gave fake matching parts or the same network more than once; Infinity written back corrupted the state; an open load behind a λ/4 line crashed; high-Q bandwidth was badly underestimated.
- Match-box title overlapped a series-capacitor "C" label (title moved up).
- Harness: residual e-notation read as an exponent (56 high flags → 0).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built and reviewed 2026-11-21 (phase 1), chart upgrades and bandwidth plot beside the chart 2026-11-22, circuit diagram 2026-11-22, mode-switch and residual fixes 2026-11-23.
