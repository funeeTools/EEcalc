# LC Resonance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/lc-resonance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-lc-resonance.test.ts`

## Purpose and scope
f₀, L or C of an LC resonator; Z₀ = √(L/C), Q and −3 dB bandwidth of a series RLC or a parallel tank (coil resistance r_L, optional shunt R_p). Nearest E-series C and L with the f₀ each gives. Filter design (multi-pole) is on other pages.

## Model and why
- f₀ = 1/(2π√LC), Z₀ = √(L/C). The L and C solves are exact closed-form inverses.
- Series: Z = R + jωL + 1/jωC; Q = Z₀/R; BW = R/(2πL) exactly (Pozar §6.1, Alexander & Sadiku ch. 14).
- Parallel tank: Y = 1/R_p + jωC + 1/(r_L + jωL). Zero-phase frequency f_r = f₀√(1 − r_L²C/L), dynamic resistance R_p ‖ L/(r_L·C) (Boylestad).
- Tank Q and −3 dB points are found **numerically on the exact |Z(f)|** (golden-section peak search in log f, bisection for the half-power points) so they stay right at low Q. Formula Q is the energy definition at f₀: series Z₀/R; parallel 1/Q = r_L/Z₀ + Z₀/R_p.
- The f₀ target is the undamped f₀; f_r and the |Z| peak frequency are reported separately.
- Accuracy: worst 2.7e-8 against independent references (exact f₁/f₂ for series, numeric |Z| for parallel; a brute-force sweep, including a coil with Q ≈ 1.1).

## Deliberate choices — ask before changing
- **Overdamped (Q < ½) is a note, not "no peak".** A series RLC's |Y| (and a pure-R_p tank's |Z|) always peaks at f₀ with BW = R/2πL whatever Q is; Q < ½ only means the step response does not ring. A separate "no resonant peak" warning appears only when the numeric search finds none (lossy-coil tank); then f₁, f₂, BW and Q are null. (reviewer, 2026-11-22)
- Zero-phase pull is printed as an absolute value ("40.00 % below f₀"). (reviewer)
- Q and bandwidth are labelled "f₀/BW from the half-power points" (series) and "measured on the computed |Z(f)|" (tank), not "exact". (reviewer)
- The sweep has an even point count so f₀ itself is not sampled (a lossless circuit has |Z| = 0 or ∞ there), plus dense points across the resonance for high Q. (builder)
- Lossless circuits give Q = ∞ as `null`, never NaN.
- L can be solved up to 1 kH and C up to 10 F; the unit lists carry H, mF and F so such answers read well. Typed out-of-range values and "179930 fF" after the user picks fF are legitimate harness flags; the two "high" flags and "0.00012235 pF" were attributed to shared-core items, not this page. (builder, 2026-11-23)
- Warnings: parasitic-scale parts, f₀ above 1 GHz, overdamped, no zero-phase point when r_L ≥ √(L/C).
- Diagram "Circuit" (series loop, or tank with r_L and R_p only when set). Solved: f₀, L or C (read from `report.results`). Red: r_L and Q for lossy-coil warnings, small L or C, f₀ above 1 GHz. (builder, 2026-11-22)
- Graph marker labels at close −3 dB points were made to avoid each other (core change, 2026-11-23).

## Sources
- Pozar *Microwave Engineering* 4e §6.1; Alexander & Sadiku ch. 14; Boylestad *Introductory Circuit Analysis* (Resonance chapter). **Not checked against the books** (the builder says the Sadiku example is recalled from memory); the numbers were recomputed from the closed forms and checked by Python.
- Worked example 2 Ω, 1 mH, 0.4 µF (ω₀ = 50 krad/s, B = 2 krad/s, Q = 25) is a test. The 455 kHz IF tank test uses Python figures (f₁ 452165 Hz, f₂ 457852.6 Hz, f_r 454964 Hz, R_D 155.5 kΩ).
- The reference calculator: feature list only.

## Known limits and open items
- L and C are ideal (no self-resonance); the capacitor has no ESR; only the coil has loss in the tank.
- Series circuit has one resistance R; no source or load resistance.

## Review history
- Q < ½ warned "no real resonant peak" while the page displayed a peak and BW. Repro `{topology:'series', l:1e-6, c:220e-12, rs:200}` (BW 31.83 MHz, f₁ 3.279 MHz, f₂ 35.11 MHz) and `{topology:'parallel', rl:0, rp:10}`.
- Double sign: `{topology:'parallel', l:10e-6, c:1e-9, rl:80}` said "pulls ... -40.00 % below f₀".
- The "only one half-power point exists" warning could never fire (needed bw != null) → replaced by a one-sided check; f₂ no longer labelled "Upper −3 dB" when no peak exists.
- Large solved L and C showed as 1e6 µH / 1e6 µF → H, mF, F added.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (overdamped wording, double sign, half-power warning), circuit diagram added 2026-11-22, mode-switch harness 2026-11-23 (readable L/C units, graph label overlap).
