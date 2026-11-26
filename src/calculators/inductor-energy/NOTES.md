# Inductor Energy — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/inductor-energy` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-inductor-energy.test.ts`

## Purpose and scope
- E = ½LI² and λ = LI.
- The time for a voltage step through R to ramp the current to I (RL step).
- Turn-off of the stored energy into a clamp.
- A saturation check against I_sat.
- Solves L, I or V.
Out of scope: core loss, L-versus-I curves, converter ripple (buck-converter page), relay armature dynamics.

## Model and why
- Ramp: i(t) = (V/R)(1 − e^(−tR/L)), and t = −(L/R)·ln(1 − IR/V) (A&S §6.4 and §7.6). R = 0 gives the straight ramp LI/V. `expm1`/`log1p` are used for accuracy at small R.
- Turn-off: L·di/dt = −(V_coil + i·R_off):
  - t_off = τ·ln(1 + x) with x = I·R_off/V_coil;
  - the coil energy that reaches the clamp is L·I²·(x − ln(1+x))/x². A series expansion is used for x < 1e-3 to avoid cancellation.
- All solves are closed-form rearrangements:
  - L for a time target, I(t), and V = IR/(1 − e^(−tR/L));
  - L = 2E/I² and I = √(2E/L).
- The E-series table for a solved L shows the bracketing pair plus one nearest preferred value on each side.

## Deliberate choices — ask before changing
- **Two clamp arrangements** (reviewer bug, 2026-11-26):
  - *Across the coil* (diode, or diode + zener). V_cl is the reverse voltage across the coil, the supply is out of the loop, and the switch sees V + V_cl.
  - *Zener/TVS across a low-side switch.* The input is V_Z. The coil sees V_Z − V, the zener absorbs V_Z·∫i dt (the coil's share × V_Z/(V_Z−V), the rest from the supply), and the switch sees V_Z.
  - The first version wrongly reported the coil's share only. V_Z ≤ V warns.
- **R_off** (optional, blank = R) is the decay-loop resistance. A clamp across the coil carries the current through the winding only, not the switch, sense resistor or source.
- **The drawing follows the arrangement:**
  - across the coil: high-side switch, with a diode across L, or a diode in series with a zener;
  - zener across the switch: low-side switch with the zener across it.
- **◎ handling:**
  - ◎ on L with I ≥ V/R falls back to the energy target.
  - ◎ on t when I is unreachable solves V, not L.
- **I_sat check:** fail above I_sat (SATURATES status), a note above 80 %, and the energy at I_sat is reported.
- **No turn-off unless V_cl is given** (optional field), which keeps the default page simple.
- **Default:** 10 µH, 2 A from 12 V through 50 mΩ, I_sat 3 A, giving 1.67 µs and 20 µJ (a generic power inductor; no part is named, to avoid unverified datasheet claims).
- **Departures from the reference calculator:** their "target %" and "required rise time" inputs are covered by the time target and ◎ solves. Clamp and turn-off are added. Their "I×L saturation check" is replaced by a real I_sat comparison.
- **Kept harness flags:**
  - Medium `unreadable` below 1 fJ / 1 fs at the 1 pA minimum (the core has no atto prefix).
  - `error-after-edit` for typed targets that are unreachable.

## Sources
- **A&S Practice Problem 6.8 (1 mH, 60 mA → 1.8 µJ):** from memory; the problem number may differ by edition.
- **Turn-off values:** verified against an independent RK4 integration in Python (≤ 1.1e-13).
- **Python cross-check:** 220 cases, ≤ 3e-16 for the ramp and solves.

## Known limits and open items
- L is constant up to I_sat (no roll-off curve); no core loss; relay coils change L as the armature moves.
- Optional: a MOSFET avalanche-energy check; an L(I) curve input; a TVS clamping-voltage-vs-current model.

## Review history
- `zener` example: the page reported 185.9 µJ. A 24 V zener across the switch really absorbs 371.7 µJ. Fixed with the clamp arrangement.
- A bare zener was drawn across a 12 V coil (it would conduct during the on-time). Redrawn per arrangement.
- ◎ L in the relay example at I = 40 mA (≥ V/R) gave a red error. Now falls back to the energy target.
- ◎ t in a never-reached state solved L and errored. Now solves V.
- The E12 table skipped 33 µH (bracket rounding). Now uses nearestE.
- The clamp label overflowed the right edge. Now "clamp / value".

## Changelog
- 0.1.0 (2026-11-26): first release. ½LI², λ, RL ramp time, turn-off into a coil or switch clamp, I_sat check, solve L/I/V.
