# Zener Diode — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/zener-diode` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-zener-diode.test.ts` (fuzz helper `tests/fuzz-gen3.ts`)

## Purpose and scope
Sizes a shunt zener regulator: Vin → R → node with zener and load. You give an input range, a load range and a zener, and the page returns R (or the largest load R can carry, or the worst-case zener current), worst-case powers, regulation and E-series parts. Not covered: series-pass (emitter-follower) regulators, TL431/LM4040 references, temperature coefficient, ripple and AC behaviour.

## Model and why
- Piecewise-linear zener (Sedra & Smith 7e §4.4): V_Z = V_Z0 + r_z·I_Z, where V_Z0 = V_ZT − r_z·I_ZT is the line through the datasheet point (V_ZT at I_ZT) with slope Z_ZT. Below I_Z = 0 the zener is off and V_out = max(Vin − R·I_L, 0).
- The load is a current sink between I_L,min and I_L,max. A resistive-load model was rejected: designers think in terms of load current.
- Every corner of V_in {min, max} × I_L {min, max} × V_Z {−tol, +tol} is evaluated: 8 rows in the Tables tab. This replaced the reference calculator's single-point check, which ignores the no-load zener power.
- Design rule: R = (Vin,min − V_Z,hi(I_Z,min)) / (I_Z,min + I_L,max). This is exact in closed form, so a solved value fed back reproduces the target; no Brent search is needed.
- Line regulation is r_z/(R + r_z); output resistance is R∥r_z.
- Validity: the line holds for I_Z from a few tenths of I_ZT upward. The page warns below 10 % of I_ZT and below I_ZK.

## Deliberate choices — ask before changing
- Three solve options. 'izMin' (worst-corner zener current for a given R and load) is the analysis option. Builder, after the harness found that a preset with V_Z above Vin left a red error, because 'ilMax' cannot serve as an analysis.
- I_Z,min = 0 is allowed as an input. The analysis writes 0 on dropout, and a following ◎ must not throw "> 0". The knee warning explains why 0 is a poor target.
- Tiny analysis residues (below 1e-12 × I_R) are written as 0, so the page does not show unreadable 1e-18 A values.
- When solving for R, the page picks the next E-series value **down**, so I_Z only rises. The table and warnings use that standard part.
- The power warning fires at ½ P_D: datasheet ratings assume ideal heat sinking (builder rule of thumb, stated as such).
- Default: 12 V ±10 % → 1N4733A, 0–20 mA load, I_Z,min 5 mA. This gives R = 230 Ω (220 Ω E24) and P_Z 190 mW.
- Harness flags kept on purpose (explained in a def.ts comment):
  - A red error after ◎ R or ◎ I_L,max when Vin cannot reach V_Z. This is the user's explicit request (§5a).
  - Round-trip "failures" from a dropped-out analysis. I_Z clamps at 0 there, so the state cannot be inverted.
- The dropout and "I_Z < I_Z,min" warnings cannot fire in the r and ilMax modes; they are for the analysis mode.

## Sources
- Sedra & Smith, *Microelectronic Circuits* 7e §4.4: the model and the 6.8 V / r_z = 20 Ω / R = 0.5 kΩ example (V_O 6.827 V, 38.5 mV/V, 19.2 Ω). The book figures are from memory; the arithmetic is reproduced in a test.
- Vishay 1N4728A–1N4761A, doc 85816 rev 2.7: V_Z, I_ZT, Z_ZT, I_ZK and Ptot 1.3 W (leads at ambient 4 mm from the body). **Verified** from the downloaded PDF.
- onsemi BZX84C2V4LT1 rev 24: V_Z min/nom/max, Z_ZT at 5 mA, knee at 1 mA, 250 mW on FR-5. **Verified** from the PDF.
- Horowitz & Hill 3e: background only; the section number is not checked.

## Known limits and open items
- The tolerance is a symmetric ± band. For BZX84C it uses the wider side of the min/max columns, which is conservative.
- Most makers rate the 1N47xxA at 1 W; the preset uses Vishay's 1.3 W, and the help says so.
- Not modelled: temperature coefficient, self-heating, r_z growth near the knee (warned only), input ripple.
- Idea: an emitter-follower option.

## Review history
- The page had no analysis option, so a preset switch left a red error (defaults → 1N4742A 12 V). Fixed by adding the 'izMin' analysis.
- "Minimum zener current must be > 0" after the analysis wrote 0. Fixed by allowing ≥ 0.
- Diagram: on dropout, I_Z was not drawn red (reviewer). It is now hl.
- Diagram: the Vin and I_Z labels collided, the load label was clipped, and "3.4e+2 mA" was printed. Fixed after looking at the PNG snapshots.

## Changelog
- 0.1.0 (2026-11-26) — first release: shunt zener regulator with worst-corner design, regulation and E-series R.
