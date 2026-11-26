# MOSFET Power Dissipation — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/mosfet-power-dissipation` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-mosfet-dissipation.test.ts`

## Purpose and scope
Losses and junction temperature of one MOSFET in a hard-switched converter leg (buck high side, boost low side, or the synchronous rectifier), with max current / max f_sw / required R_θ solves.
Not covered: logic-level load switches and relay drivers (`general/transistor-switch`), soft-switched / resonant converters, avalanche, linear-mode SOA, transient thermal impedance (pulsed loads).

## Model and why
- Trapezoidal CCM current: I_rms² = D_sw·(I² + ΔI²/12); turn-on at the valley, turn-off at the peak (Erickson & Maksimović).
- Switching: Balogh SLUA618A eq. 8 (V_pl = V_th + I/g_fs), eq. 11 (I_G2 with the mid-point gate voltage, I_G3 at the plateau), eq. 13–14 (½·V·I·t·f per edge). Turn-off uses the same intervals through R_off.
  - **Charges instead of C_iss·ΔV and C_rss·V** (builder, 2026-11-26): Q_gs2 = Q_gs − Q_g(th) and Q_gd from the datasheet are the integrals of the non-linear capacitances; SLUA618's capacitance form needs a C_rss value that varies 10× over the swing.
  - Q_gs2 and Q_gd are taken as constant (datasheet test point); the plateau moves with current via g_fs.
- C_oss: ½·(C_oss,eff + C_opp)·V²·f at hard turn-on — own stored energy plus Q·V − E for charging the opposite device (SR C_oss or diode C_j); equal FETs ≈ Q_oss·V·f (reviewer, 2026-11-26). Presets set C_opp = the same FET's C_oss,eff; the two Schottky examples keep that value as a stand-in for C_j (not from a diode datasheet). Q_rr·V·f from the opposite rectifier (Erickson ch. 4). Both dropped, with the turn-on term, when the valley current is ≤ 0 (forced-PWM negative current ⇒ ZVS).
- SR: conduction over 1 − D, body diode V_SD·t_dt·f·(I_pk + max(I_valley, 0)), no channel switching loss.
- Gate: SLUA618 eq. 10 split; only the R_G,int share is added to the die loss; total Q_g·V_drv·f is reported.
- T_J = T_A + R_θ·P(T_J) with R_DS(on) linear in T_J ⇒ closed form; runaway when R_θ·α·P_cond,25 ≥ 1. Other terms are temperature-independent (typical 25 °C charges).
- Accuracy: SLUA618 calls the edge model "crude"; the page says ±30 % on switching terms.

## Deliberate choices — ask before changing
- Departures from the reference calculator: the reference calculator uses user-entered t_r/t_f and I_D² (no duty, no ripple); here the edges come from gate charge and driver resistance, conduction uses I_rms with duty, and Q_rr, dead time and the R_G,int gate share are added. The reference calculator's min/max current and ambient corners were left out (one operating point; sweep graphs show the trend).
- Solve options: tj (analysis), iL, fsw (Brent on T_J(x) = target), rthJA / rthSA (closed form at the target T_J). The T_J field is the target in the non-analysis modes (buck-converter ripple pattern).
- Topology (buck/boost) and rectifier (FET/Schottky) selects change only the drawing and help; the equations are topology-independent.
- The Miller-plateau drive limit applies to the control switch only; the SR turns on at ZVS (reviewer).
- Thermal path switch maps rthJA ↔ rthSA (apply + sync), so ja → jc → ja returns the same page.
- iL search is capped at the gate-drive limit (V_th + I_pk/g_fs < V_drv); above it the FET cannot be fully enhanced and compute throws for typed values.
- T_J(I) has a step where the valley crosses zero (soft → hard turn-on); a target inside the step gives NO SOLUTION with an explanation instead of a false root.
- Solved values outside field ranges (T_J > 10 000 °C, R_θ outside 1e-3…1e6) return NO SOLUTION.
- Presets (4) fill the device fields; editing any of them switches to Custom (sync). Q_rr and R_θJC are filled but not compared (Q_rr belongs to the rectifier). R_θJA is filled only on the ja path when it is not the unknown.
- Defaults: 12 V → 3.3 V buck high side, 10 A ± 1.5 A, 500 kHz, CSD17578Q5A at 4.5 V spec / 5 V drive, 50 °C, R_θJA 50 → T_J ≈ 84 °C.
- Graph 3 ("Switching edges") shows the ideal v_DS / i_D trapezoids; for the SR it shows the dead-time body-diode step.

## Sources
- TI SLUA618A (Balogh) — eq. 8, 10–14: **verified** against the PDF (Nov 2026).
- TI CSD17578Q5A, CSD18540Q5B (SLPS488B), CSD19534Q5A datasheets — tables **verified** from the PDFs; α read from Figure 8 at 125 °C (graph reading, ±0.05 %/°C). C_oss,eff = Q_oss/V_test.
- Erickson & Maksimović 3rd ed. (I_rms, Q_rr loss), Mohan et al. (heat sinks) — from memory.

## Known limits and open items
- No published numeric worked example found for the full loss budget; checked by hand-computed SLUA618 steps and an independent Python (fixed-point T_J, bisection solves).
- Q_gd scaling with V_DS, C_oss energy non-linearity, common-source inductance, temperature dependence of V_th/g_fs and Q_rr are not modelled.
- DCM with a diode rectifier (valley = 0, node ringing) is treated like the boundary case.
- Possible additions: min/max corners (the reference calculator), transient Z_th for pulsed loads, a GaN preset (Q_rr = 0, Q_oss).

## Review history
- 2026-11-26 independent review (numerics matched Python to ≤2e-15, presets matched PDFs). Fixed:
  - C_oss loss omitted the opposite device's charge (imax-48v: 0.25 W → 0.50 W); added C_opp. Test: review regressions.
  - Zero gate-loop resistance gave P_sw = 0 silently → warning. Q_g(th) > Q_gs clamped silently → warning.
  - Drawing always showed a buck with a FET rectifier → topology/rectifier selects (boost, Schottky drawn); heat path now starts on the analysed FET's lead; node temperatures moved right of the ladder.
  - SR was blocked by the plateau limit (`role: 'sr', vdrv: 2, iL: 30` threw) → limit skipped for the SR.

## Changelog
- 0.1.0 (2026-11-26) — first release: conduction, gate-charge switching, C_oss, Q_rr, dead-time and gate losses with T_J-dependent R_DS(on); solves T_J, max I, max f_sw, required R_θJA / R_θSA.
