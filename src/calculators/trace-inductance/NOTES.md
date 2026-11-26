# PCB Trace Inductance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/pcb-trace-inductance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-trace-inductance.test.ts`

## Purpose and scope
Inductance of a straight rectangular trace: the partial self-inductance of an isolated trace, or the loop inductance of a trace over a ground plane. Solve L (analysis), length ℓ or width W for a maximum L. X_L = 2πfL is shown at f.

Not covered: vias and pad/turn-down inductance (a warning says to add via inductance when ℓ < 5H), mutual inductance, spiral inductors (`pcb/planar-spiral-inductor`).

## Model and why
- **Isolated:** exact partial self-inductance of a rectangular bar with uniform (DC) current (Ruehli 1972; Hoer & Love 1965 give the same quantity in closed form, but it loses its digits to cancellation for long thin traces, so it is not used for evaluation). Evaluated by Grover's filament formula averaged over the cross-section, using exact GMD and AMD of a rectangle plus Gauss–Legendre quadrature of the smooth remainder; quadrature precision about 1e-12.
- **Grover's long-bar formula** L ≈ μ₀ℓ/2π·[ln(2ℓ/(w+t)) + ½ + 0.2235(w+t)/ℓ] is shown for comparison.
- **Over a plane:** L′ = Z₀,air/c from the Hammerstad–Jensen microstrip model (independent of εr), times length. Hammerstad 1975's two-branch formula (±1 %) and the parallel-plate limit μ₀H/W are shown as comparisons.
- Valid W/H 0.01–100 (H–J fit); T/H above 0.2 and ℓ < 5H give warnings.

## Deliberate choices — ask before changing
- **Exact quadrature rather than a closed-form fit for the isolated trace** (builder). Tests compare it with a 60-digit Python Decimal evaluation of Hoer–Love to about 1e-12.
- Solve options L / ℓ / W. Switching the return path while solving goes back to the analysis, because partial and loop inductance are different targets (builder).
- εr is not an input: loop inductance depends on geometry only (field help says so).
- Unit list includes fH because very short traces have partial inductances in the fH range (builder).
- Default: isolated 20 mm × 0.5 mm × 35 µm trace, L = 19.28 nH, f = 100 MHz; the 19.28 nH is stored in the defaults and a test checks it is the computed value.
- The drawing uses the PCB material kit and keeps traces rectangular until the etch-profile choice is made (style guide §7b). I did not check whether this drawing follows the one-scale W×T rule (user decision 2026-11-24; reference `trace-width-current/diagram.ts`).
- Departure from the reference calculator: not recorded; the brief did not ask for an the reference calculator comparison for this page.

## Sources
- Ruehli 1972, Hoer & Love 1965, Grover 1946 (ch. 3), Rosa 1908, Ghosh 1951 (mean distance of a rectangle), Hammerstad 1975, Hammerstad & Jensen 1980. The model header cites them; I found no record of which were opened. The numerical results were verified against the builder's Python reference (Hoer–Love in 60-digit arithmetic), not against a published worked example.

## Known limits and open items
- DC (uniform) current distribution only. At high frequency the partial inductance falls somewhat; X_L uses the same L.
- Loop L′·ℓ underestimates short traces (ends, vias).
- The record for this page is thin: one builder report and the harness note; there was no separate review round recorded.

## Review history
- 2026-11-24 harness: only the documented staircase round trips, typed extremes and unreadable values in in/mil flags remained (no bugs recorded).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24 (exact partial L, loop L over a plane, three solve options).
