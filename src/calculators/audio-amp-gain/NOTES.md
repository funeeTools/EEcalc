# Power Amplifier Gain — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `audio/power-amplifier-gain` (directory `audio-amp-gain`) · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts` (circuit drawn there; no `diagram.ts`), `tests/calc-audio-amp-gain.test.ts`

## Purpose and scope
Gain, sensitivity and output power for a rated power into a speaker, single-ended or BTL, split or single supply: peak voltage and current, required supply rails, class-B supply power and dissipation, the gain-network R_g. Sensitivity can be typed in V, dBu or dBV; gain in V/V or dB. It is a sizing tool for a sine rating, not a distortion or thermal simulator.

## Model and why
- V_out,rms = √(P·R), V_pk = √2·V_out,rms, I_pk = V_pk/R, A_v = V_out/V_in (TI LM3886 data sheet SNAS091C eq. 7, 8, 10).
- Rail ≈ (V_pk + V_od)(1 + regulation)(1 + high line) (LM3886 eq. 9), generalised to BTL (two halves, each V_pk/2, each with dropout) and to capacitor-coupled single supply: SE split ±(V_pk+V_od); SE single 2(V_pk+V_od); BTL single V_pk+2V_od; BTL split ±(V_pk+2V_od)/2.
- Ideal class B (no quiescent current): P_S = V_S·2·I_pk/π per conducting rail pair, P_D = P_S − P_out, P_D,max = 2V²/(π²R) (Sedra & Smith §12.3).
- dBu is re √0.6 V (0.7746 V), dBV re 1 V.
- Accuracy: reviewer's Python over 99–180 points, 4.8e-7 to 8e-9 (limited by their numerical integration); closed forms agree to 1e-15; class-B supply power checked by integrating supply current for all four topology/supply combinations.

## Deliberate choices — ask before changing
- **Stage gain below 1 needs an attenuator.** A non-inverting stage cannot go below 1 and a follower gives exactly 1. For BTL at 1.5 V/V total, each half needs 0.75 V/V: the page says "none: stage gain < 1", gives the attenuation (−2.50 dB) and warns "bridge would give 2 V/V". Single-ended 0.8 V/V is handled the same way. (reviewer, 2026-11-23)
- **With an available rail V_S, supply-side figures use that rail** (drive limited to the smaller of the rated swing and its clip level), else the required loaded rails. (reviewer, 2026-11-23)
- **Worst-case dissipation is the maximum over every drive level up to clipping (0 … clip)**, not only up to the rated power: 10 W / 8 Ω on ±60 V gives 2V²/(π²R) = 91.2 W, not 50.4 W, so heatsinks are not undersized. It is also capped at clipping when the dropout is large (found by the Python check). (reviewer, 2026-11-23)
- **dBu and dBV limits are the 1 µV … 1 kV range converted exactly** (dBu −117.782 … +62.2185, dBV −120 … +60), not round numbers. A value typed as the rounded limit is just outside and refused: the harness "display-mismatch" high is that artefact. (builder, 2026-11-23)
- **Solved gain, sensitivity or power outside the input field's limits return `ok:false`** with a message rather than writing an impossible number. (reviewer rule, 2026-11-23)
- **LM3886 example** reproduces the data sheet's 17.9 V, 4.5 A, A_V ≥ 12.6, 973 mV and 8.2 kΩ, and is labelled "±21.9 V; datasheet prints ±21.0 V": 17.9 + 4 = 21.9, so the printed ±21.0 V looks like a data-sheet arithmetic inconsistency. (reviewer, 2026-11-23)
- Theory rail table is a list, not a wide table, so it fits at 375 px. (reviewer, 2026-11-23)
- Remaining flags legitimate: vinDbv −9.6e-16 vs 0 round-trip at zero; two typed numbers; the stacked "R_g" label overlapping a "—" value in an error state only (cosmetic, core schematic).
- Warnings: gain below 1 or above 200 per stage (LM3886 range 20–200, stable for ≥ 10), sensitivity above +24 dBu, microphone-level sensitivity, load below 2 Ω (and R/2 below 2 Ω in a bridge), available rail too low, absolute maximum supply. The default design gives none (tested).
- Circuit tab: non-inverting stage, plus a slave inverter for BTL. (builder)

## Sources
- TI LM3886 data sheet SNAS091C: **verified from the PDF** by the reviewer (eq. 9 with V_od = 4 V, gain range 20–200, stable for gain ≥ 10, 84 V limit; example numbers).
- Sedra & Smith 7e §12.3, D. Self *Audio Power Amplifier Design* 6e, IEC 60268-5 (impedance not below 80 % of rated): cited, no record they were opened (**from memory**). IEC 60268-2 / AES for dBu and dBV.

## Known limits and open items
- Ideal class B with no quiescent current; resistive load only (theory says real speakers differ).
- Crest-factor ("programme") power is a simple ratio; no thermal model or SOA check.

## Review history
- BTL, solve V_in, gain 1.5 V/V: R_g showed "open (unity-gain follower)" yet a follower builds gain 2 (33 % high); no warning fired because it tested `a`, not `aHalf`.
- With V_S given, P_D,max and the dissipation graph still used the required ±44 V rails, not ±35 V.
- Worst-case dissipation not capped at clipping (Python check); then, on generous rails, capped at the rated power instead of the clip level (10 W / 8 Ω on ±60 V showed 50.4 W, true 91.2 W).
- Theory rail table overflowed at 375 px.
- Solved gain, sensitivity or power written back outside field limits.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (BTL attenuator, available rails, limits), second review fixes 2026-11-23 (worst-case dissipation, LM3886 note), mode-switch harness 2026-11-23 (comment only).
