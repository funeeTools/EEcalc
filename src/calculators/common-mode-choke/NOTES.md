# Common-Mode Choke — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `emc/common-mode-choke` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-common-mode-choke.test.ts`

## Purpose and scope
Two-winding common-mode choke on a ferrite core: L = A_L·N² (solve for N, L or A_L), common-mode and differential-mode inductance from a leakage percentage, |Z| with self-resonance from the winding capacitance, insertion loss in a source/load system (50/50 Ω or CISPR 17's 0.1/100 Ω worst cases), copper loss from the differential current, and an optional common-mode flux check. Default: 10 mH at 150 kHz, turns solved on A_L = 4 µH/N², 10 pF, R_p 20 kΩ, 1 % leakage. Circuit drawing: two windings with dots between source and load.

Not covered: saturation from the differential current (no source found; the page says so), core loss beyond the R_p fit, mains safety ratings.

## Model and why
- Two identical windings of inductance L with coupling k (M = kL): L_CM = L(1 + k)/2, L_DM = 2L(1 − k). Leakage as data sheets measure it (one winding, the other shorted) is L(1 − k²), so k = √(1 − leak). Paul (2nd ed., ch. 6) and Nave (1991).
- Z_CM = R_dc/2 + [jωL_CM ∥ R_p ∥ 1/(jωC_p)]: the parallel R–L–C that ferrite makers fit to |Z|(f); f_r = 1/(2π√(L·C_p)), peak |Z| = R_p. The DM path has 2·R_dc.
- Insertion loss of a series impedance between source Z_s and load Z_l (CISPR 17 definition): IL = 20·log₁₀|(Z_s + Z + Z_l)/(Z_s + Z_l)|.
- CM flux B̂ = A_L·N·Î_CM/A_e, taking the differential current as cancelling in the core.

## Deliberate choices — ask before changing
- **Saturation from the differential current is not modelled** and the page says so (builder, 2026-11-23: no source found). The notes add that leakage flux from large line currents can still saturate parts of the core.
- **A series choke gives the same IL in 50/50 Ω and CISPR 17's 0.1/100 Ω**, because only Z_s + Z_l matters; the page says so (reviewer finding, 2026-11-23). Keep the worst-case systems as options anyway because CISPR 17 names them.
- **A_L is entered in µH/N² by default** so the default reads 4, not 4000; nH/N² is also offered (reviewer, 2026-11-23). The examples set `fUnit` and `alUnit` so nothing reads "100000 kHz" (harness fix, 2026-11-23).
- **Lossless at exactly f_r shows "∞" with advice**, not "TΩ" or 290 dB; the model caps at Q = 10¹², and the exact f_r point is added to the graph only when a loss resistance exists.
- Solved L, N and A_L are never written outside their field limits.
- The default has N solved (solveFor `n`), and the LISN example puts a 25 Ω CM load and a 100 Ω DM load at 30 MHz to show a capacitive choke.
- Copper loss is 2·I_DM²·R_dc, because the differential current flows through both windings (R_dc/2 in the common-mode impedance, 2·R_dc in differential mode: a first draft of the checker had left R_dc out; the page was right).
- No A_L or ferrite presets for specific part numbers: the page works from entered values only (reason not recorded).

## Sources
- **Hand checks, no published worked example found** (builder): a pure 10 mH choke at 150 kHz in 50/50 Ω is 39.49 dB; 10 mH with 10 pF resonates at 503.3 kHz. Python re-implementation (coupled-pair impedance matrix solved directly) agrees to 3e-11; the reviewer's 11 states to 2e-16.
- Paul, Nave, Ott (2009, ch. 3 and 14), the TDK ferrites data book (A_L, A_e, l_e definitions), CISPR 17:2011: cited. **The builder's CISPR 17 claims were put to a reviewer** (the 0.1/100 Ω condition) but whether the standard itself was read is not recorded.

## Known limits and open items
- Above a few MHz the manufacturer's measured |Z|(f) curve is better than any R–L–C fit (µ′ falls, µ″ rises).
- A 1 % default leakage and 10 pF are illustrative, not from a part.
- Two chokes in series (high-µ plus low-capacitance) are not modelled.

## Review history
- Several examples left the frequency in kHz so the data-line example showed "100000 kHz" → `fUnit: 'MHz'` for analyse-27t, dcdc, usb, lisn-30m; usb also sets `alUnit: 'nH/N²'`.
- A_L default displayed 4000 → µH/N².
- Lossless choke at exactly f_r showed a huge capped number (TΩ, 290 dB) → ∞ with advice.
- CISPR 17 0.1/100 Ω presented as different from 50/50 Ω for a series choke → page says they match.
- Solved L, N or A_L outside its field → guarded (and the core's OUT OF RANGE net added 2026-11-23).
- Harness mediums left on purpose: typed extremes with no answer (N < 1, L > 10 H); the low flag is a round trip at the A_L minimum.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23, mode-switch fixes 2026-11-23.
