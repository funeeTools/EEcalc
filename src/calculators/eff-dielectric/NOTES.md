# Effective Dielectric Constant — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/effective-dielectric-constant` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-eff-dielectric.test.ts`

## Purpose and scope
εeff, phase velocity, delay per length and guided wavelength for five line structures (bare microstrip, mask-coated microstrip, embedded microstrip, stripline, grounded CPWG), with dispersion for the bare microstrip. Solve options: analysis, εr from a measured delay per length, εr from a measured εeff. Graphs: εeff vs f and vs W/H. Also gives Z₀ where the shared model can.
Not covered: coupled-line mode velocities (the pair pages show them), loss, dispersion of the covered and coplanar structures.

## Model and why
- Static εeff is imported unchanged from `controlled-impedance/model.ts` `analyse` (Hammerstad & Jensen thickness-corrected microstrip; Wan–Hoorfar + Bahl–Stuchly cover increment; stripline εeff = εr exactly; CPWG Ghione–Naldi/Simons). See that page's notes for their accuracy.
- Dispersion (bare microstrip only): Kirschning & Jansen, Electronics Letters 18(6), 1982, `epsEffKJ` from `microstrip/model.ts`, applied to the thickness-corrected static value as the Microstrip page does. Stated 0.6 % for 0.1 ≤ W/H ≤ 100, 1 ≤ εr ≤ 20, **H/λ₀ ≤ 0.13 (f·H ≤ 39 GHz·mm)**. The other structures are quasi-static: the page shows the bare-microstrip curve beside them for scale.
- v = c/√εeff, t_pd = √εeff/c, λg = c/(f√εeff). εr from a measured value uses a bracketed Brent search on εr = 1…100 (εeff rises monotonically with εr).

## Deliberate choices — ask before changing
- **Stripline always returns εeff = εr and shows Z₀ as "—" with a note** when the impedance model cannot take the copper (builder: the harness found that switching to stripline with thin copper threw an error).
- **A structure or material change resets `solveFor` only when the value really changes** (reviewer, 2026-11-25). `sync` records the last structure/material in a WeakMap; a fresh API state has no record and counts as unchanged. Reason: `eeCalc.compute(id, {solveFor:'erE', eeff:5, structure:'ms'})` used to drop the measured value silently and return εr = 4.2, εeff = 3.081; it now gives εr = 7.204 with εeff = 5.000. Picking a new laminate in the UI still applies its εr and returns to analysis. Keep this behaviour.
- A different structure is analysed from εr, not solved from the old measured value (§5a); a measured value belongs to one line.
- **Kirschning–Jansen limit H/λ₀ ≤ 0.13** (reviewer's recollection, adopted after the builder confirmed it; "unconfirmed" at review time) appears in the warning, notes, theory and model header; the εeff-vs-f graph draws red dashed lines at that limit and at the TE₁ surface-wave onset. The two labels sit close together at 1.6 mm FR-4.
- Drawing, one-scale (§7b, user): everything to scale; a wide strip runs past both edges with outward W arrows and a gap past the edge gets an outward G arrow; the hint names the case and says whether heights are to scale; a short stack is centred vertically. Traces are rectangular until the etch-profile choice is made (user, §7b).

## Sources
- **Verified against a published number:** Pozar, Microwave Engineering 4e, Example 3.7 (εr 2.20, W/d 3.081 → εe 1.87, thin strip) within 1 %.
- Kirschning & Jansen 1982 and Yamashita et al. 1979: dispersion agrees with the Yamashita formula within 2.5 % (builder's own check; paper not read by a reviewer).
- Hammerstad & Jensen 1980, Wan & Hoorfar 2000, Ghione & Naldi 1987, Simons 2001: through the imported models. Python re-implementation: 270 states, 6e-14. Reviewer confirmed the formulas match exactly.

## Known limits and open items
- Only bare microstrip disperses; mask, embedded and CPWG εeff are static and rise with frequency in reality.
- No dispersion model for stripline is needed (homogeneous), but there is no loss or roughness effect on delay.
- On 2026-11-24 the coordinator noted that `controlled-impedance` already outputs εeff and could absorb this page; it was built separately on 2026-11-25. No later decision recorded.

## Review history
- Measured value silently dropped when set together with the structure or material in one call (`{solveFor:'erE', eeff:5, structure:'ms'}` → εr 4.2, εeff 3.081; RO4350B's εr not applied) → reset only on a real change.
- Wide CPWG (W = 5 mm, G = 2 mm) was drawn "W and G shrunk to fit" → runs past the edges per §7b.
- Wide traces left the top half of the drawing empty → stack centred vertically.
- Dispersion graph ran to 100 GHz (f·H 160 GHz·mm, past the TE₁ onset near 25 GHz) with nothing marking where the model stops → red dashed limit lines.
- Harness: switching to stripline with thin copper threw → stripline always returns εeff = εr.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (AI-control bug, wide CPWG drawing, K–J limit), fixed 2026-11-25.
