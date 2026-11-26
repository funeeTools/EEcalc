# PWM Motor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `motor/pwm-duty-cycle-motor` (directory `pwm-motor`) · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-pwm-motor.test.ts`

## Purpose and scope
A PWM-driven brushed DC motor: average voltage and current from duty, current ripple, CCM versus DCM, speed for a duty (or duty for a target speed, or load torque at a speed and duty), RMS current and losses. Three drives: low-side switch with a freewheel diode, sign-magnitude H-bridge with synchronous rectification, and locked anti-phase.
Not covered: switching losses (a note says they dominate above about 100 kHz), mechanical transients, Mohan's "unipolar" full-bridge scheme (it ripples at 2f and is not modelled), brushless motors (`motor/bldc-efficiency`). The motor model itself is `motor/dc-motor-speed`, imported read-only (`operatingPoint`, `motorFigures`, `windingResistance`, `RPM`, unit tables), so changes there affect this page.

## Model and why
- The speed is taken as constant within one PWM period (mechanical time constant much longer than the period). In each switch state the armature obeys L·di/dt = v − R_x·i − E, solved exactly: i(t) = I∞ + (i₀ − I∞)·e^(−t/τ), and the periodic steady state follows from i(T) = i(0), including discontinuous conduction in the low-side drive. Mean and RMS values are exact integrals.
- Small-ripple limit: ΔI = V_s·D(1 − D)/(L·f) for low-side and sign-magnitude, twice that for anti-phase (Mohan, Undeland & Robbins ch. 7: §7-3 step-down ripple, §7-6 full-bridge bipolar switching; ch. 13 motor drives).
- Torque balance K·Ī = T_L + K·I₀; Ī(ω) falls monotonically with ω, so the speed is a Brent root, and duty for a target speed is a root of Ī(ω, D) = T_L/K + I₀.
- A sign-magnitude bridge in CCM equals the dc-motor model driven by D·V_s through R + 2·R_on exactly (tested).

## Deliberate choices — ask before changing
- Solve options: speed (default), duty, load torque. Defaults are the maxon RE 40 (148867) motor with L = 0.0824 mH, low-side drive, 24 V, 50 %, 20 kHz, R_on 10 mΩ, V_f 0.5 V, 0.1 N·m load (reason for the L value and the other defaults not recorded).
- A topology switch with a torque solve analyses the speed instead of showing a red error; a duty solve keeps its target unless the new topology cannot reach it (mode-switch harness, 2026-11-23).
- Zero load solved back from its own speed is exactly 0; the speed at 100 % duty solves back to 100 %; anti-phase at 50 % shows a mean current of exactly 0, not "−8.67 fA".
- K_t and K_v are relabelled "Torque/amp" and "Speed/volt" (shared with BLDC). `sync` keeps K_v in step with K_t in the solved box (reviewer, 2026-11-23).
- Out-of-range solved speed or torque, and K_t, give specific errors naming the limit.
- A series choke L_x is an input; the ripple warning suggests raising f_PWM or adding L_x when ripple adds more than 10 % copper loss.
- Warnings and notes: audible PWM below 20 kHz, over 100 kHz (switching loss not modelled), winding above 155 °C, peak current above 80 % of the full-voltage stall current, anti-phase energy recirculation, sign-magnitude regenerative braking.
- Graph set: current waveform, speed vs duty (with the averaged model), ripple vs frequency. Drawing follows the drive option.
- The coordinator's brief said to reuse the dc-motor model by import and not to edit that directory.

## Sources
- Mohan, Undeland & Robbins, Power Electronics 3rd ed., ch. 7 and 13: cited from memory; section numbers in the code header are not recorded as checked against the book.
- Published example **checked**: LiU TSTE25 exam 2023-10-20, problem 2 (250 V, D 0.8, 0.2 mH, 30 kHz, Ī 5 A → ΔI 6.67 A, 8.33 / 1.67 A), reproduced by the test.
- maxon "Key information" and RE 40 148867 data: via the dc-motor page.
- Python shooting-method model (210 points, 2.9e-12 including 18 DCM points) and the reviewer's period-map and RK4 solutions (186 points, ≤ 2e-6; the worst point has τ/T ≈ 7e7).

## Known limits and open items
- No switching, dead-time or diode-recovery losses; no cable inductance beyond L_x.
- Mean speed is assumed steady: no electromechanical dynamics.
- Unipolar full-bridge switching is a separate scheme, not modelled.

## Review history
- No `sync`/`k`/`kv` result item, so the green solved K_v never followed K_t: K_t = 50 mN·m/A left K_v at 316.2 rpm/V (should be 191). Fixed (test).
- Solved values out of range: V_s 1e4 with K 1 mN·m/A gave n = 8.8e6 rad/s (max 1e6); V_s 5819 with K_v 0.65 gave T_L = 8.7e5 N·m (max 1e4). Now specific errors.
- A no-op `− (sg.vDiode ? 0 : 0)` in the model and a wrong attribution of the sign-magnitude drive to Mohan's "unipolar" scheme. Removed and reworded.
- Harness: a topology switch with a T_L solve was a red error; T_L = 0 solved back gave a red round-off error; speed at 100 % duty failed to solve back; anti-phase 50 % printed "−8.67 fA". All fixed. Remaining flags: stall-region round trips, legitimate.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed 2026-11-23 (K_v sync, range errors, attribution), harness 2026-11-23.
