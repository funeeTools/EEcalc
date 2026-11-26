# Voltage Regulator Dropout — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/voltage-regulator-dropout` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-regulator-dropout.test.ts`

## Purpose and scope
Headroom check for a linear regulator: is the lowest instantaneous input (low line, ripple valley, or a battery at end of discharge) at least V_out + V_DO(I_out)? It also reports dissipation and efficiency. Thermal analysis stays on `power/ldo-thermal`; `ldoPower()` is imported read-only from there.

## Model and why
- V_in,req = V_out + V_DO(I); margin ΔV = V_in,min − V_in,req (TI SLVA079 dropout definition).
- Three dropout models:
  - `rdson`: V_DO ∝ I through one data-sheet point (MOS-pass LDO).
  - `points`: straight line through two data-sheet points, clamped at ≥ 0 (bipolar LDO).
  - `fixed`: constant (78xx, LM317).
- DC source: V_min = V_in(1 − tol) − V_pp/2. Battery: n·V_end (min), n·V_nom (typical), n·V_full (max).
- Every model is linear, so the solve inverses (I_out, V_out, V_in, V_end) are exact. `iForVdo` checks that its result lands on the unclamped part of the line.

## Deliberate choices — ask before changing
- **Departure from the reference calculator:** their V_in,min = V_out + V_do + I·R_DS(on) counts the dropout twice (V_do already is I·R_DS(on) at the spec point). Here the dropout is one modelled term. Their "recommended input = 1.1 × V_in,min" is dropped too: it is arbitrary. Use the margin target instead.
- The margin field is the analysis result and the target for every other solve (the same pattern as `ldo-thermal`'s Tj). Its range goes down to −1e12 so any analysis result fits.
- Fixed model: I_out appears as a second, non-solvable field with the same key, because a fixed dropout has no maximum load. A model switch to `fixed` while solving I_out moves the solve back to the margin.
- Two points at the same current fall back to the line through the origin, with a warning, instead of an error. This keeps setting switches clean.
- A falling two-point slope: solving for I_out is an error ("does not rise with load"); in analysis it is a warning.
- Battery chemistry presets (Linden): Li-ion 4.2/3.7/3.0, LiFePO₄ 3.65/3.2/2.5, NiMH 1.4/1.2/1.0, alkaline 1.6/1.5/0.9, lead-acid 2.4 (charging) / 2.0 / 1.75. V_full is the worst-case dissipation value (charger connected), not the open-circuit voltage.
- A solved V_end does not flip the chemistry to Custom (`sync` ignores V_end while it is the unknown).
- If n·V_full is below the required input, the status is BATTERY TOO LOW, with a warning.
- A margin residue below 1e-9 is set to 0, so a solved design never reads as "dropout".
- Harness: the remaining medium "error-after-edit" flags are typed targets that have no answer (a cell above 10 V, a supply above 1 kV, a negative margin target). These are intended.
- Left out: presets naming specific LDO parts (LM1117, AMS1117, MCP1700…), because their dropout specs could not be verified this session.

## Sources
- TI SLVA079 (Lee, 1999), dropout definition: from memory, not re-read.
- TI SLVA118A, P_D and η: via `ldo-thermal/model.ts`.
- Linden & Reddy, *Handbook of Batteries* 4e, cell voltages: from memory (typical values).
- USB 2.0 §7.2.1, VBUS ±5 %: from memory.
- Horowitz & Hill, ch. 9: from memory.

## Known limits and open items
- The input's own source resistance (cable, battery internal R) is not modelled; a note tells the user to subtract it first.
- No temperature dependence of the dropout: the user enters the hot worst case.
- A dropout-vs-current curve with more than two points is not supported.

## Review history
- Points (0.1 A, 10 mV), (1 A, 0.6 V); V_in 5 V, V_out 4.9 V, target 0.12 V → returned 54.2 mA but the margin came out at 100 mV → now an error.
- With a falling slope, the error message contradicted its own numbers → explicit "does not rise" error.
- Solving V_end gave 5.3 V/cell (> V_full) while the status said REGULATES → BATTERY TOO LOW.
- `liion-3v3` loaded as Chemistry "Custom" → sync fixed.
- Lead-acid 2.15 V was the open-circuit value → 2.4 V charging.
- Harness (builder): ◎ I_out on the fixed model, NaN in the drawing, two points at the same current, and the margin range were all fixed before review.

## Changelog
- 0.1.0 (2026-11-26) — first release: headroom margin with three dropout models, DC/ripple or battery source, solves for max load, max output, min supply and cut-off cell voltage.
