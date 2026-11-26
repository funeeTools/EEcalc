# Buck Converter — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/buck-converter` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-buck-converter.test.ts`

## Purpose and scope
Step-down power stage at one operating point: duty with conduction drops, inductor for a ripple target, peak/RMS currents, output and input ripple, loss budget, load-step C_out, CCM/DCM boundary. Synchronous or diode rectifier.
Not covered: core loss, C_oss and reverse-recovery loss, dead time, capacitor ESL, multiple V_in corners (the user runs the corners), control-loop compensation. DCM ignores the resistive drops except as described below. `outputRipple` and `Segment` are imported by the boost-converter and flyback-converter models, so changing their signatures breaks those pages.

## Model and why
- The inductor current is piecewise linear; the duty comes from volt-second balance with high-side R_on, DCR and either low-side R_on or the diode V_F (Erickson & Maksimović ch. 3).
- Output and input ripple are computed **exactly on that waveform** (capacitor charge plus ESR drop, extremes found per piece), not by adding the two textbook terms. SLVA477 eq. 12 (ΔI_L/(8 f C)) and eq. 13 (ESR·ΔI_L) come out as the two limits and are shown separately.
- Diode buck at light load enters DCM (ch. 5): ramp-up D1, ramp-down D2, zero; resistive drops use the interval-average current i_pk/2, so DCM and CCM meet continuously at the boundary. I_out(i_pk) is monotonic and solved with Brent.
- A synchronous buck stays in forced-PWM CCM with negative inductor current at light load and the page warns (builder).
- Losses: conduction, switching ½·V_in·I·(t_r+t_f)·f at valley (turn-on) and peak (turn-off) current, gate Q_g·V_drv·f, capacitor ESR. Load-step C_out per SLVA477 eq. 14, for both overshoot and undershoot.
- Accuracy: reference simulations agree to about 5e-4 worst case; the model uses average current for resistive drops, the simulation the instantaneous current.

## Deliberate choices — ask before changing
- Solve options: L, ripple % (analysis), f_sw, C_out. The ripple and ΔV_out boxes turn green when computed; clicking the green ΔV_out box switches to solving C_out (builder, 2026-11-22).
- The L and f_sw solves pick the CCM root, and ripple ratio is monotonic in L across the boundary (reviewer fix, 2026-11-22).
- ◎ C_out with ΔV_out equal to ESR·ΔI_L returns the smallest C that reaches it with a note, not NO SOLUTION; below that floor it is an error (mode-switch pass, 2026-11-23).
- Defaults are a 12 V to 3.3 V, 3 A, 500 kHz, 30 % ripple synchronous stage with a 44 µF / 5 mΩ output bank (reason not recorded). The 20–40 % ripple starting point is cited to SLVA477 in the field help.
- Warnings: duty above 90 %, on-time under 100 ns, DCM or negative current, efficiency under 70 %.
- The loss-breakdown table is deliberately **not** row-toned: it splits one design into parts, so no row passes or fails (coordinator, 2026-11-23).
- Diagram follows the rectifier option (switch or Schottky) and turns D, ΔI_L and C_out red on the matching warnings (builder, 2026-11-22; the user asked for diagrams on all pages the same day).
- Harness leftovers kept as legitimate: subscript label overlaps in the diagram, and round-trip flags from no-solution states where L or C_out shows "—" while the state keeps the old number.
- The reference calculator was not used for this page.

## Sources
- TI SLVA477 rev. C (Hauke), eqs. 1–14. Reproduced exactly with ideal parts in the tests.
- Erickson & Maksimović ch. 2–5; Balogh TI SLUA618 (gate loss); Mohan et al. Whether the PDFs were read is not recorded; the builder's checks were Python simulations, not document reads.
- Independent checks: cycle-by-cycle Python circuit simulation (sync CCM, diode DCM) and a brute-force sampled-waveform check (RMS, ripple, loss to about 1e-6). The reviewer's piecewise-exponential simulation covered 11 states (CCM sync, diode, DCM, negative current, all four solve modes), worst 5.3e-4.

## Known limits and open items
- Single V_in; use the highest V_in for ripple and peak current and the lowest for maximum duty.
- Inductance is taken at the operating current (no saturation model); ceramic C_out derating is the user's input.
- Not modelled: items in the scope list above.

## Review history
- Light-load mode boundary inconsistent: a diode buck's duty jumped between CCM and DCM with resistive drops. Fixed (continuous D1 + D2 → 1).
- Load-step C_out covered overshoot only. Now takes the undershoot bound when it governs (D > 0.5).
- Making ΔV_out a result again after solving C_out made L the unknown. Fixed.
- Solved values could leave their field limits (deep DCM ripple, tiny ΔV_out). Clamped by the range guard.
- Mode-switch harness, 2026-11-23: 0 high, 21 medium, all explained.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (DCM boundary, undershoot C_out), diagram added 2026-11-22, mode-switch harness 2026-11-23.
