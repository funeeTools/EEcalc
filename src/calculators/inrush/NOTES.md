# Inrush Current & Overshoot — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/inrush-overshoot` · **Version:** 0.1.0 · **Files:** `model.ts`, `state.ts`, `circuit.ts`, `def.ts`, `theory.ts`, `index.ts`. There is no `tests/calc-inrush.test.ts`: the tests are in `tests/physics.test.ts` (against `python_reference.json`, from the user's original Python program) and `tests/regressions.test.ts`. Physics lives in `src/physics/` (`rlc.ts`, `capacitors.ts`, `conductors.ts`, `awg.ts`, `stimulus.ts`) and `src/core/sim/ode.ts`.

## Purpose and scope
**This is the user's own calculator**, ported on 2026-11-21 from their earlier Python/web app (`electronics-calculator/.../inrush.py`) as the fifth page of phase 1. It predicts peak current, peak capacitor voltage, overshoot, ζ, f₀, I²t and PASS/FAIL when a supply is hot-plugged or a surge is applied to one or more capacitor groups through leads, PCB traces, a connector and damping R. Stimuli: hot-plug step, step with rise time, IEC 61000-4-5 1.2/50 µs and 10/700 µs impulses.
Not covered: supply control loops, inductor saturation, non-RLC loads. It has no solve-for mode (it is a simulator, unlike the other pages).

## Model and why
- Branched RLC network: a shared feed (source, leads, series trace, connector, damping R) plus N capacitor groups, each with its own trace, solved with an adaptive ODE solver. A single linear branch with an ideal step uses the closed-form step response.
- Class II ceramic C(V): estimated from dielectric class, case size and rated voltage (volumetric efficiency sets the remaining C at rated V; a logistic curve maps 1 at 0 V to c_min at V_rated). The solver uses the **differential** capacitance dv/dt = i/C(v). It is an estimate, not a vendor curve; the page says so.
- ESR/ESL are estimated from case size and dissipation factor; wire and trace R, L include skin effect and internal inductance.
- ζ, f₀ and the "equivalent series RLC" results are small-signal, taking C at the applied voltage V_s. The simulated overshoot uses the full voltage-dependent curve. Labelled "small-signal, C at Vs".

## Deliberate choices — ask before changing
- **Open user decisions, never resolved (as of 2026-11-26).** The reviewers found these in the user's inherited physics on 2026-11-21 and the coordinator left them unchanged "for you to decide"; the project memory still lists them as open and no later transcript or code change settles them:
  1. Above the capacitor's rated voltage the ceramic C(V) curve falls too steeply (about 79 V predicted for a 20 V step on a 25 V part). The code still clamps the ratio only at 0.02. The page warns that C(V) is untrustworthy above rating.
  2. The low/high capacitance uncertainty band is simulated as **linear** capacitances (`linearClone`), so it does not bracket the main (nonlinear) result.
  3. ζ and f₀ use the differential C at V_s while the simulation uses the whole curve (labelled; possibly acceptable).
  Do not "fix" these silently: ask the user.
- Unverified: a reviewer's I²t for the mixed ceramic + electrolytic bank was 0.83 A²s against the page's 1.19; never reconciled.
- The 1.2/50 µs fit uses k = 1.0374 so the peak is exactly V_p; the Python original used 1.043 (peak 1.005·V_p). The test scales the reference by 1.0374/1.043 (builder, 2026-11-21).
- Polarity is judged by magnitude (negative steps FAIL against the limit). Fail voltage defaults 16 V on a 12 V step; the lowest rating in the circuit also limits.
- Surge-generator warning: if source + damping R is under about 2 Ω (1.2/50) or 30 Ω (10/700), the current is flagged as unrealistic, citing the generator impedances of IEC 61000-4-5 / ITU-T K.44.
- A simulation that stops before the end of its window is INCOMPLETE (or FAIL (INCOMPLETE)), never PASS.
- Capacitor-groups table rows are toned: green below 90 % of the voltage limit, yellow 90–100 %, red above the lower of the capacitor rating and the fail voltage. The 90 % band is the coordinator's choice (2026-11-23).
- Diagram is `circuit.ts` in compact form; the source label is V_s and was moved right because it was clipped (2026-11-22). Input rows follow the user's request for one wide line per input (2026-11-21).
- The phase-1 mode-switch harness: 0 high, 0 medium after the diagram clip fix (2026-11-23).

## Sources
- The user's original Python model (reference JSON in the tests). The dielectric, ESR and ESL tables are inherited from it; their original sources are not recorded.
- IEC 61000-4-5 and ITU-T K.44 for the impulses and generator impedances: from the reviewers' and the builder's knowledge, not recorded as read.
- Reviewers rebuilt the maths in Python (also `fc_inrush.py` in a scratchpad). Their code is not in the repo.

## Known limits and open items
- The three open decisions above.
- C(V) beyond rating is extrapolated; the page warns but still reports numbers.
- Slow ramps and very long impulses need a long window; very large windows are costly (harness runs cover fewer steps).

## Review history
- Slow ramps and long surge pulses ran out of solver steps and reported a wrong PASS: one case showed 13 V and PASS where the true peak was 50 V (FAIL). Fixed; regression test: a 1 s ramp reaches the full 12 V and passes.
- Negative polarity was ignored (`v: −12, vFail: 10` must FAIL). Fixed.
- The 10/700 µs wave had the wrong shape; now peak ≈ 1 and half value 700 µs after the virtual origin.
- The overdamped simulation window was too short. Fixed.
- Diagram labels "12 V"/"step" clipped at the left. Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: ported 2026-11-21, reviewed in two rounds and fixed 2026-11-21 (window, polarity, 10/700, overdamped window, generator-impedance warning), diagram 2026-11-22, row tones 2026-11-23.
