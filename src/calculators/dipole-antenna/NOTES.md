# Dipole Antenna — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `antenna/dipole-antenna` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-dipole-antenna.test.ts`

## Purpose and scope
Free-space centre-fed thin-wire dipole: resonant length for a frequency (thickness-dependent), resonant frequency of a given length, or the feed impedance of any length, with directivity, pattern, feed-line SWR, SWR ≤ 2 bandwidth, skin-effect loss and efficiency. Ground, height, baluns and real-world end effects are theory notes only.

## Model and why
- Sinusoidal standing-wave current I(z) = I_m·sin[k(L/2 − |z|)]. Radiation resistance, directivity and pattern from Balanis §4.5–4.6 closed forms (Q, R_r, D₀ = 2F_max/Q); feed resistance R_in = R_m/sin²(kL/2) (lossless).
- Reactance from the induced-EMF self-reactance of that current on a wire of radius a (Carter 1932, as in Balanis §8.5), so the **shortening factor comes from where X crosses zero**, not from a chart: K = 0.934, 0.946, 0.965, 0.974, 0.980 for L/d = 50, 100, 1e3, 1e4, 1e5. The 468/f rule (0.951) is mentioned as a practical extra shortening.
- Si/Ci by series for x ≤ 4 and a continued fraction above (A&S §5.2, Numerical Recipes §6.9), about 1e-15.
- Solve-for: `len` (default), `f`, `xin` (analysis). Resonance is a target feed reactance X_in, default 0; L and f are solved by `invert` over 0.2–0.75 λ.
- Accuracy: independent Python integrates the far-field pattern for R_r and D and Simpson for Si/Ci; matches to 1e-4 relative at L/λ = 0.1, 0.5, 0.75, 1.25, 1.5, and Si/Ci to 1e-10. Balanis λ/2 check: 73.08 + j42.52 Ω, D₀ 1.641 (2.15 dBi), HPBW 78°. Short-dipole limit 20π²(L/λ)² and D = 1.5 checked.

## Deliberate choices — ask before changing
- **X_in target:** when ◎ L or ◎ f is chosen from an analysis whose reactance the 0.2–0.75 λ window cannot reach (short dipole −8.5 kΩ, near-full-wave +9.3 kΩ), the target is reset to resonance (X = 0) instead of NO SOLUTION. The λ/2 example keeps 42.5 Ω as its target so its round trip works. (builder, harness 2026-11-23)
- **X_in is snapped to 0** when analysing a resonant length (solver residue ~1e-14 Ω; anything below 1e-9 of |Z_in| is below model precision), and the target is shown when L or f was solved. (builder, 2026-11-23)
- **Antiresonance warning only near a whole number of wavelengths ≥ 1** (sin²(kL/2) < 0.1 and L/λ near 1, 2…); short dipoles have a small sin² too but that is the ordinary small-dipole regime. (reviewer, 2026-11-22)
- **NO SOLUTION reports the reachable X_in range** (evaluated at both window ends) instead of blaming wire thickness. (reviewer, 2026-11-22)
- Split-lobe note triggers on θ_max ≠ 90° (broadside stays strongest to about 1.44 λ), not "above 1.25 λ". Thick-wire warning threshold matches its text (L/d ≳ 100). L/λ exactly 0.005 is accepted (float epsilon). An exact whole number of wavelengths is a clear error, and its text avoids the word "null" (harness reads it as a missing value). (reviewer/builder)
- Theory quotes the exact Cin(2π) = 2.43765 values, Q = 1.21883, D₀ = 1.6409 (what the page outputs), not Balanis' rounded 1.2175 / 1.643. (reviewer, 2026-11-22)
- **f and L unit ranges** are wide but cannot hold every solved value in both directions (a solve keeps L·f near c/2); a typed extreme (f = 1 kHz → L ≈ 148 km) gets the core's out-of-range report: legitimate. (builder, 2026-11-23)
- Harness flags legitimate: "soft NO SOLUTION" states keep the last answer, so round trips from there fail; L shown as "404010 mil" after the user picked mil for a 10 m wire.
- R vs L/λ graph legend sits below the plot. Diagram: two arms, AC source, dashed standing-wave current, λ/2 comparison bar ("not to scale" when clamped), Z_in = R ± jX and feed-line Z₀ with SWR (red above 3). Solved: L, f or Z_in follows `solveFor`. (builder, 2026-11-22)

## Sources
- Balanis, *Antenna Theory* 3rd/4th ed. §4.3, 4.5, 4.6, 8.5: the **section numbers are cited from memory of the 3rd edition**; equation numbers deliberately left out. The λ/2 figures (73.08 + j42.52 Ω, 1.641) were checked numerically against the independent script.
- Carter, Proc. IRE 20(6), 1932; Abramowitz & Stegun §5.2; Press et al. §6.9: cited; no record they were opened.

## Known limits and open items
- Free space and ideal sinusoidal current; accuracy degrades for L/d below about 100 and near full-wave antiresonance (both warn).
- No ground, no end effect, no loading by feed line.

## Review history
- Spurious "full-wave antiresonance" warning for every short dipole (`feedFactor < 0.1` is also true for L/λ < 0.102): the built-in "Short dipole 1 m at 7 MHz" example said "a few hundred to a few thousand ohms" while R_in is about 0.1–2 Ω.
- NO SOLUTION blamed thick wire when X was outside the window: `{f:7e6, d:1e-3, xin:-1500}`, `{f:14.2e6, d:2e-3, xin:2000}`.
- "Main lobe splits above 1.25 λ" inaccurate; theory used Balanis' rounded Q and D₀; thick-wire warning fired below L/d = 50 while its text said 100; L/λ exactly 0.005 rejected.
- Resonant-length analysis showed X_in as 3e-14 Ω (60 round-trip flags).
- ◎ L or ◎ f from the short or near-full-wave example gave NO SOLUTION (unreachable reactance target).
- Graph legend covered traces.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (warning, messages, theory figures), diagram added 2026-11-22, mode-switch harness fixes 2026-11-23.
