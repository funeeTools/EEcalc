# Skin Depth Percentage — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/skin-depth-percentage` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-skin-depth-percent.test.ts`

## Purpose and scope
How much of a trace's copper carries the current at frequency f: skin depth δ, the share of the current (or the ohmic loss) within a depth x, the copper actually used, and R_ac/R_dc. Solve for the share p (analysis), the depth x, or the frequency f. Default: 1 GHz, 5 µm depth, 0.3 mm wide 1 oz microstrip, copper at 25 °C (aluminium is also offered).

Not covered: the plain skin depth of a wire (`skin-depth`), the trace's full DC/AC resistance and heating (`trace-resistance`), roughness, edge crowding, proximity effect.

## Model and why
- δ = 1/√(π f µ₀µr σ), imported from `skin-depth/model.ts`; ρ(T) = ρ₂₀[1 + α₂₀(T − 20)] as on `trace-resistance` (IEC 60028 copper, IEC 60889 aluminium).
- Thick conductor (half-space), Ramo, Whinnery & Van Duzer §3.16: current share within x = 1 − e^(−x/δ), loss share = 1 − e^(−2x/δ). Inverses are closed form; f follows from the exact inverse of δ(f).
- Rectangular trace, two selectable R_ac/R_dc models: the **uniform δ layer** (default) imported from `trace-resistance` (`acArea`), and the **exact one-dimensional solution** (Dowell 1966, single layer), F(Δ) = Re[(1+j)Δ·coth((1+j)Δ)], Δ = T/δ for a plane on one side or T/2δ with planes on both. The share of copper used is R_dc/R_ac.

## Deliberate choices — ask before changing
- **The uniform-layer model is the default and is imported from `trace-resistance`, so this page never contradicts it** (coordinator brief 2026-11-25; tested to be identical). The exact model is the alternative.
- Largest gap between the two models is 8.56 % at Δ = 1 (reviewer, 2026-11-25); the theory says so.
- Changing "Share of" (current / loss) goes back to analysis, because p means something else after the switch.
- 100 % is a legal share in analysis (floating point reaches it) but not as a target: it needs infinite depth or frequency, so a round trip from such a state reports no solution (expected harness "roundtrip-error", low).
- Solved lengths in mil or in move to the imperial unit that reads 0.1–9999, because the core rescales a solved value only within one unit's SI prefixes (reads "0.00051 in" otherwise).
- Warnings: copper thinner than 3δ (half-space shares flatten); trace only a few skin depths wide; below −50 °C (tempco).
- The knee-frequency help quotes 0.5/t_r (Johnson & Graham), not 0.35/t_r, which is the 3 dB bandwidth (reviewer).
- Drawing: W and T on one scale with the plane(s) (the user's one-scale rule, style guide §7b), a skin band, a zoom shaded by |J|, and bars for the share and the copper used. PCB material kit (user, 2026-11-24).

## Sources
- **Reviewer re-derived and confirmed (2026-11-25):** δ = 66.1 µm at 1 MHz and 2.09 µm at 1 GHz; 35 µm equals δ at 3.61 MHz; both share formulas; Dowell with Δ = T/δ or T/2δ matches the m = 1 single layer; series 1 + 4Δ⁴/45 − … to 1e-15, F(1) = 1.08564; worked examples (99 % of the current within 6.27 µm at 2.4 GHz; 90 % of the loss in the top 3 µm from 656 MHz).
- Ramo et al. (3rd ed.), Dowell (Proc. IEE 113(8), 1966), Johnson & Graham §4.5, Bogatin ch. 9, IEC 60028, IEC 60889, Hammerstad–Jensen (roughness): cited; whether each was read is not recorded.

## Known limits and open items
- Both R_ac models ignore edge crowding, the return conductor and roughness; real microstrip is within tens of percent.
- Non-magnetic, isotropic metal with linear tempco (copper within ±2 % over −50 to +300 °C); anomalous skin effect ignored.
- Left out on purpose (builder, 2026-11-25): the reference calculator's 33 % / 50 % "δ/T target", because it is not a standard.

## Review history
- Theory said ENEPIG's thin layers avoid the nickel loss; ENEPIG keeps 3–6 µm electroless nickel, only nickel-free finishes (EPIG, immersion silver, OSP) avoid it → corrected.
- Theory said the layer-vs-exact gap is about 10 % → 8.56 % at Δ = 1.
- `f` help said knee = 0.35/t_r → 0.5/t_r.
- Diagram, W = 100 mm and T = 1 mm: "T = 1 mm" sat on the δ line mid-copper and the zoom leader crossed the "runs past both edges" hint → relabelled.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (three text nits, one label overlap), fixed 2026-11-25.
