# Controlled Impedance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/controlled-impedance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `xs.ts` (shared drawing frame), `tests/calc-controlled-impedance.test.ts`

## Purpose and scope
Single-ended Z₀ of five PCB structures from one stack-up: bare surface microstrip, solder-mask-coated microstrip, embedded microstrip, centred stripline and grounded coplanar waveguide (CPWG). Solves for W, H, εr or the CPWG gap G (or analyses Z₀). Graphs: Z₀ vs W (all five types), vs H, vs mask/cover thickness; a table of the same stack-up across all five types.
Not covered: coupled pairs (other pages), offset stripline (`asymmetric-stripline`), dispersion (see `eff-dielectric`), etch profile.

## Model and why
- **Microstrip:** Hammerstad & Jensen 1980 with their thickness correction, reused from `microstrip/model.ts` (±0.2 %). Test pins the Microstrip page's reviewed value (3 mm on 1.6 mm FR-4 → 50.166 Ω).
- **Mask and embedded:** the bare H&J line plus a cover filling factor: Wan & Hoorfar 2000 multilayer q₂ (extending Svačina 1992), cover displaces air so εeff rises by Δq·(εc − 1) (Bahl & Stuchly 1980), Δq relative to the uncovered line; KiCad's cap Δq ≤ 1 − q_sub added. Same decomposition as KiCad's calculator.
- **Stripline:** Cohn 1954 exact K/K′ with Cohn fringing-capacitance thickness correction around Wheeler's thick strip (the isolated-strip limit of `stripline-diff/model.ts`).
- **CPWG:** Ghione & Naldi 1987 / Simons §2.4, plus a side-wall term ε₀T/G per gap (Cohn 1955 eq. 22; Garg & Bahl 1979). **Gupta's equivalent-width correction was tried and rejected** because it diverges once its Δ approaches G (builder).
- Stated accuracy against the builder's 2-D finite-volume solver (3-grid Richardson; exact stripline to 0.03 %), checked by an independent reviewer (agree within 0.02–0.22 %): microstrip ±0.2 %, mask +0.35…+2.1 % high, embedded +1.1…+2.8 % high, stripline ±0.3 %, CPWG +0.1…+2.4 % high for G ≤ H (+4.7 % at G = 3H, warned; +0.24…+0.34 % even at T = 0).

## Deliberate choices — ask before changing
- **Mask microstrip uses Wan–Hoorfar + Bahl–Stuchly as published, labelled as such, with no fitted coefficients** (coordinator, 2026-11-24, listed among the decisions to confirm with the user; no reply recorded). The model captures only about 34–84 % of the real mask effect and reads high. Rejected: correction factors fitted to the project's own solver.
- **Wan–Hoorfar step at W = H is blended away** (reviewer found it 2026-11-24): the published wide and narrow branches differ by +0.88 % at the default (65.447 → 66.022 Ω), so Z₀(W) was non-monotonic and a W solve could have three roots. The branches are blended with a smoothstep in ln u over W/H 0.91–1.1, documented as a smoothing of a published discontinuity. Test: Z₀(W) falls strictly over 2000 points.
- **Stripline copper limit:** warning above T/b 0.2 with the measured band −1.1…+0.6 %, refusal only above 0.45 (reviewer: the first 0.25 hard error blocked 1 oz on 2 mil). When that limit is what stops a W, εr or G solve, the error says so ("The copper is too thick for the dielectric … H must be at least …"), not "no W gives Z₀".
- A laminate preset while solving εr analyses the entered geometry instead of bouncing to Custom. A structure switch keeps the unknown visible (G exists only on CPWG).
- **Shared drawing frame `xs.ts`** (460 × 270, planes at one y, heights on the right, caption row, bottom-left legend, dashed field arrows) is used by `differential-pair`, `asymmetric-stripline`, `broadside-coupled`, `stripline-diff` and others. Keep its exports stable. Arrows are drawn in ink, not muted, so they show in dark mode.
- Style guide §7b (user): traces rectangular until the etch-profile choice is made; W and T on one scale. These drawings clamp widths and do not follow the one-scale rule yet (coordinator 2026-11-25).
- CPWG field is drawn across both gaps to the pours (reviewer 2026-11-24).

## Sources
- Hammerstad & Jensen 1980, Wan & Hoorfar 2000, Svačina 1992, Bahl & Stuchly 1980, Cohn 1954/1955, Wheeler 1978, Ghione & Naldi 1987, Simons 2001, Garg & Bahl 1979: formulas transcribed by the builder; none read by a reviewer. KiCad's transline code (2026) was consulted as a second transcription.
- **Verified against a published number:** Pozar Ex. 3.5 (4e): 50 Ω stripline, b = 3.2 mm, εr 2.2 → W ≈ 2.66 mm (Pozar's own fit ±1 %).
- Python re-implementation (1.7k points, 7.3e-13), builder's and reviewer's field solvers.

## Known limits and open items
- Mask coverage is partial and reads high (see above); no published model fixes that without fitting.
- Etch profile not modelled; no dispersion.
- On 2026-11-24 the coordinator suggested this page could absorb `asymmetric-stripline`, `dual-stripline` and `eff-dielectric` (it has a type dropdown and εeff output); the later pages were built separately. No decision recorded.
- `xs.ts` helpers may be promoted to core (coordinator idea, not done).

## Review history
- Z₀ jumped +0.88 % at W = H for mask/embedded (65.447 → 66.022 Ω at C/H = 0.1) → blended.
- Stripline H = 50 µm, T = 35 µm said "No W gives Z₀ = 50 Ω" although W ≈ 17 µm works in the forward model → real reason shown.
- T/b > 0.25 refusal too strict → warning/0.45.
- CPWG note claimed the T = 0 conformal map is exact (it reads +0.24…+0.34 %, +4.7 % at G = 3H) → text corrected.
- Mask caveat said 40–80 % captured, +0.5…+2.1 % → 34–84 %, +0.35…+2.1 %.
- Diagram: arrows crossed W labels, G and T collided on CPWG, mask label hit the W label, "T" straddled the mask step → moved.
- Harness: roundtrip when solving H with T at its maximum (copper 2.5× the dielectric) is non-monotonic and far outside the model (warned); "solve g" on a non-CPWG state is unreachable by design.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (W = H step, stripline copper limit, text and arrows), fixed 2026-11-24.
