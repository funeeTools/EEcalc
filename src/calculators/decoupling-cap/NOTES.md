# Decoupling Capacitor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/decoupling-capacitor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-decoupling-cap.test.ts`

## Purpose and scope
A capacitor bank against a target impedance Z_t = V·ripple/ΔI over a band: groups of N capacitors (package, C, ESR, ESL), mounting inductance from pad traces and vias, a spreading inductance L_sp and a plane capacitance C_p at the load. Shows |Z| of the bank and each group, anti-resonance peaks judged against Z_t, and the capacitor count. Solve for the check Z_t (analysis, default 1.8 V, 5 %, 1 A → 90 mΩ), the largest load step ΔI, or the fewest N in one group (list ◎).

Not covered: the regulator output impedance, bulk electrolytics' frequency-dependent ESR, the package and die, and the plane cavity (see `plane-impedance`; the coordinator recommended linking the two pages rather than merging them, 2026-11-24). DC bias derating is left to the user (the page says to enter the effective C).

## Model and why
- Z_t = V·ripple/ΔI (Smith, Anderson, Forehand, Pelc, Roy, IEEE Trans. Adv. Packaging 22(3), 1999).
- One mounted capacitor is a series R–L–C: ESR + jω(ESL + L_mnt) + 1/(jωC); N alike in parallel divide by N. The bank is all groups in parallel, reaching the load through L_sp, in parallel with C_p (Smith & Bogatin 2017, ch. 7–9).
- Mounting inductance: each pad-to-via trace is a microstrip loop, L_tr = 2ℓ·Z₀,air(w/h)/c, using Hammerstad–Jensen in air (imported from `microstrip`); the via pair is a two-wire loop (µ₀h/π)·acosh(s/d_v) (Paul 2010 §5.4), whose s ≫ d form is Smith & Bogatin's "10 pH/mil · ln(s/r)".
- Anti-resonances come from the model itself, not a formula: each is a local maximum of |Z| on the band.

## Deliberate choices — ask before changing
- **Band search refines every local maximum** (reviewer bug, 2026-11-24). Each group's mounted SRF and the L/N–N_jC_j and L–C_p parallel-resonance estimates seed dense sample clusters; every local maximum is refined by golden section. Do not go back to a single grid with refinement only around the grid maximum.
- N solve: doubling search then bisection, because adding capacitors of one value lowers the bank impedance across the band; the result is checked (N passes, N − 1 fails). NO SOLUTION when the spreading inductance alone puts a floor above Z_t, with the reason; L_mnt is still shown then.
- ΔI answers "the largest step this bank supports", so it equals the entered ΔI only when the bank sits on its target. The harness round-trip flag from any other state is by design.
- The solved group is tracked by identity (`solveGroup`, as in `nf-cascade`), so removing a group above it does not move the unknown.
- **Via assumption** (reviewer nit, builder stated it): both vias are taken h long down to the nearer plane; the deeper via's run through the plane cavity belongs to L_sp.
- Pad pitch per package (approximate IPC-7351 land pattern) gives a warning when the via spacing s is below 0.9× the pitch of every part, and a note when only the larger packages do not fit. The FPGA example's via spacing was changed from 0.8 to 0.95 mm to suit its 0402s.
- ESL presets (0201 0.25, 0402 0.4, 0603 0.55, 0805 0.7, 1206 1.0 nH) are typical intrinsic values, order of magnitude from manufacturers' impedance data, ±30 %; the datasheet SRF is the better source, ESL = 1/((2πf_SRF)²C).
- Typed band edges in the wrong order, or vias wider than their spacing, are red errors on purpose.
- PCB material kit (user, 2026-11-24): a mounted MLCC in section with solder, pads, mask, traces and vias, current loop shaded.

## Sources
- Smith et al. 1999, Smith & Bogatin 2017, Paul 2010, Hammerstad–Jensen 1980, Novak & Miller 2007, Johnson & Graham ch. 8: cited. Not stated whether the books were read.
- **Reviewer checked:** L_mnt against own code to 5e-10; the via-pair formula reduces to Bogatin's rule. Defaults give 0.44 nH (0.24 traces + 0.20 vias), 0.84 nH total for an 0402 at 8 mil, inside the commonly published 0.3–1.5 nH mounted range. Exact table values were not checked.
- Builder's Python: 168 states with dense grids and brute-force counts agree (worst |Z| within 1.5e-6).

## Known limits and open items
- No DC-bias, temperature or ageing derating of the capacitance.
- No distributed plane model; L_sp is an input.
- Reverse-geometry and multi-terminal parts (50–150 pH) are only mentioned in the theory.

## Review history
- Narrow anti-resonance missed (240-point grid refined only at its maximum). 4 groups (2 × 41.9 µF / 1.33 mΩ; 40 × 2.6 µF / 423 mΩ; 2 × 386 pF / 1.87 mΩ; 2 × 241 pF / 339 mΩ), L_sp 10.4 pH, C_p 0, band 134 kHz–791 MHz, Z_t 147.9 mΩ: solve said N = 54 meets target, true worst 179.7 mΩ at 195 MHz; correct N = 84 (83 gives 148.70 mΩ, 84 gives 147.72 mΩ). Regression test, plus 60 random low-ESR banks against 40 000-point scans.
- Via-in-pad spacing smaller than the pad pitch was accepted → warning.
- NO SOLUTION header showed "L_mnt —" although L_mnt does not depend on N → shown.
- "vias Ø" label crossed the s dimension in an older build → fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-24, reviewed 2026-11-24 (missed peak, nits), fixed 2026-11-24.
