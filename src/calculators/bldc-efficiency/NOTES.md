# BLDC Efficiency — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `motor/bldc-efficiency` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-bldc-efficiency.test.ts`

## Purpose and scope
Loss breakdown and efficiency of a BLDC/PMSM motor with its inverter: copper, iron, friction (or a no-load test), inverter conduction and switching, controller power. Solve the current for a torque, the torque for a current, or the top speed on the DC bus. Graphs: losses and efficiency vs torque, efficiency-map slices, losses vs speed. Drawing: power-flow diagram.
Not covered: field weakening (i_d = 0 only), thermal feedback on R, saturation, commutation overlap, torque ripple, cogging. The brushed model is `motor/dc-motor-speed`, imported read-only (`RPM`, `windingResistance`, K/torque/speed unit tables).

## Model and why
- **Current conventions are stated on the page** and change what the current means. Block (six-step): I = DC-link current, two phases in series, P_Cu = I²·R_LL, inverter conduction 2·I²·R_DS(on). Sinusoidal (FOC): I = phase RMS, wye winding, P_Cu = 1.5·I²·R_LL, conduction 3·I²·R_DS(on). K_t is in the same convention as I (Krishnan 2010 ch. 2/9; maxon for the block data convention).
- Iron loss at constant flux: hysteresis ∝ f plus classical eddy ∝ f² (Bertotti 1988); excess loss is not separated. Friction: Coulomb + viscous, or from a no-load test (I₀ at n₀) with an eddy fraction.
- Inverter switching loss linearised: ½·V_dc·I·f_sw·(t_r + t_f) per switching leg; for FOC the mean |i| is (2√2/π)·I_rms (Mohan §2-3). Conduction per Infineon's MOSFET-loss note (Graovac et al. 2006).
- Voltage limit: block V_dc·m = K_t·ω + I·(R_LL + 2R_DS); sinusoidal V_ph,rms = |E + (R_ph + R_DS)I + jω_e L I| against V_dc/√6 (SVPWM), E_ph = K_t·ω/3.

## Deliberate choices — ask before changing
- Solve options: current (default), torque for a current, top speed. The efficiency map slices at 25–75 % of the zero-torque top speed, up to 90 % when the point is beyond the limit, and is omitted when nothing is reachable.
- The best-efficiency torque search **respects the voltage limit**; when even zero torque is unreachable (5000 rpm on 48 V) it says so and shows no best point (reviewer fix, 2026-11-23).
- **Not added:** a K_v route for sinusoidal drive. The hobby-K_v to K_t,rms factor (about 1.225/K_v) depends on the EMF shape and on how K_v was measured, so it is not clean. Block mode keeps its K_v input. The coordinator asked the reviewer to judge this; the reviewer's verdict was "ship" (2026-11-23).
- K_t and K_v are relabelled "Torque/amp" and "Speed/volt" because the solved label was cut to "Torque con…".
- Out-of-range solved current, torque and K_t give specific errors.
- A drive switch while solving "torque for a current" switches to solving the current, because the current's meaning changes between phase RMS and DC link (sine → block returns the drone example's 10 A). A top-speed solve writes the current back so ◎ T afterwards returns the same 0.64 N·m.
- Warnings: modulation above 100 % (V_dc cannot drive the point), above 95 % (no control margin), extrapolation beyond 3 × n_ref (coefficient form) or 2 × n₀ (no-load form), winding above 155 °C, electrical frequency above f_sw/10, and a note when L_LL = 0 makes the top speed optimistic.
- Defaults: 48 V, 200 W-class PMSM on FOC at 3000 rpm, R_LL 0.2 Ω, K_t 0.12 N·m/A, 4 pole pairs, 0.64 N·m (reason for the numbers not recorded). Examples: top speed, the maxon check (η = (1 − √(I₀/I_A))²), a drone motor (K_v 920 rpm/V, 6S, 10 A block), light load, and an over-voltage edge case.
- The reference calculator's P_mech = I₀²·R is wrong and was **not copied** (builder). The reference calculator's K_v/R_TT/I₀ hobby inputs are covered by the drone example.

## Sources
- maxon "Key information" η_max formula: reproduced to 1e-12 and by a test on the 24 V line (ties this page to `dc-motor-speed`).
- Krishnan 2010; Bertotti 1988; Mohan 3rd ed. §2-3 eq. 2-6; Infineon (Graovac, Pürschel, Kiep) 2006; Holmes & Lipo. Which of these were read from the originals is not recorded (the builder's report only lists them); treat the exact equation numbers as unverified.
- Python implementation (210 points, 6.5e-15) and the reviewer's (238 points, 2e-15) agree; the reviewer checked conventions (P_Cu = 1.5·I²R_LL, E_ph = K_t·ω/3, V_dc/√6, mean |i|).

## Known limits and open items
- Iron-loss scaling is a two-term model; extrapolation warns.
- No temperature feedback: winding R is taken at the entered ϑ_W.
- Controller power is a constant input.

## Review history
- Solved I = 7.9e9 A at n_ref = 1e-3; T = 1e7 N·m with K 100 and I 1e5; K_t = 1000 written back from K_v 1e-3 (max 100). Now specific errors.
- Best-efficiency torque ignored the voltage limit: 5000 rpm over-voltage showed 0.977 N·m at 91.6 % though E_ph 20.9 V exceeds 19.6 V; the efficiency map was empty above the limit. Fixed.
- Mode-switch harness: drive switch with "torque for a current"; top-speed solve left a stale current; empty map above the voltage limit. All fixed (3 remaining highs were the core rounding bug).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23, harness 2026-11-23.
