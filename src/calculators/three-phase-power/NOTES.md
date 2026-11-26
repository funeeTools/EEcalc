# Three Phase Power — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/three-phase-power` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-three-phase-power.test.ts`

## Purpose and scope
Balanced Y or Δ load: line ↔ phase voltages and currents, P/Q/S from V_L, I_L and PF, per-phase impedance (R, X, L or C equivalent, Y-equivalent of a Δ), kVA ↔ current. Optional unbalanced 4-wire Y: neutral current and sequence components from three current phasors. Not covered: unbalanced Δ loads, unbalanced voltages, harmonic (triplen) neutral current, capacitor correction (→ `power/power-factor`).

## Model and why
- Y: V_ph = V_L/√3, I_ph = I_L; Δ: V_ph = V_L, I_ph = I_L/√3; S = √3·V_L·I_L, P = S·cos θ, Q = S·sin θ (+ lagging).
- Z_ph = V_ph/I_ph ∠θ; Δ → Y equivalent Z/3.
- Solve I_L, V_L, PF: closed-form inverses (everything is linear in each unknown), so no root finder.
- Neutral: I_N = I_a + I_b + I_c; Fortescue I₀, I₁, I₂ with a = 1∠120°, ABC sequence.
- Instantaneous power graph: p_x = 2·V·I·cos(ωt + φ_x)·cos(ωt + φ_x − θ); the sum is P (tested).

## Deliberate choices — ask before changing
- **Solve options** (builder, 2026-11-26): analysis `p` (P, Q, S from V_L, I_L, PF), `il` and `vl` from a power target, `pf` from P. The target is P or S via `pBy` (S needs no PF: kVA → amps). P and S fields are green whenever computed; ◎ on a computed one makes it the target (switches to solving I_L if needed).
- **PF solve uses P only**; the lag/lead select stays the user's (it cannot be inferred from P, V, I).
- **Out-of-range answers** (I_L outside 1 µA–1 MA, V_L outside 1 V–2 MV, PF > 1) are NO SOLUTION with the needed value in the message, never written back.
- **PF = 0 or P = 0 as a target** is a typed-input error (a purely reactive load has no P to solve from); fuzz test accepts only these refusals.
- **Harness flags kept (medium):** only error-after-edit for typed P = 0, S = 0 or PF = 0 while solving I_L/V_L. Phasor labels move beside their arrow when they would sit on an earlier label (fixed V_ab/I_a, I_N/I_a overlaps); θ sits beside its arc; phasor labels use greedy placement (first free spot: past the tip, beside the tip or mid-arrow).
- **Unbalanced section is Y-only**; it is ignored (kept) while Δ is selected. Angles are absolute, relative to V_an (example: lagging 0.9 currents at −25.84°, −145.84°, 94.16°).
- **Defaults** = the reference calculator case (400 V Y, 10 A, 0.85 lagging → 5.889 kW): a mainstream 400 V small-motor load.
- **Departures from the reference calculator:** adds solve-for I_L/V_L/PF, kVA mode, per-phase Z, neutral current and sequence components, instantaneous-power graph, phasor drawing. Graph "Power vs current" kept (not draggable).
- Diagram: comb-style Y (three Z to a star bus, neutral drawn only in 4-wire mode) or Δ triangle; phasors with V and I on separate scales (Δ shows V_ab…, I_ab… and dashed line current I_a at −30°).

## Sources
- Alexander & Sadiku, *Fundamentals of Electric Circuits*, ch. 12 — line/phase relations, power; Example 12.3 (V_an = 100 V into Δ of 8 + j4 Ω → I_a = 33.54 A) reproduced in tests; example number and answer from memory.
- Glover, Sarma & Overbye, *Power System Analysis and Design*, ch. 2 and 8 (from memory).
- Fortescue (1918) — symmetrical components.
- Independent Python (`scratchpad/pb4/ref.py`, complex phasor arithmetic): 240 random states over all four solve options, max rel. error < 1e-13.

## Known limits and open items
- Sinusoidal balanced voltages assumed; unbalanced mode gives only the neutral/sequence currents, not per-phase powers.
- Triplen harmonics in the neutral are noted, not computed.

## Review history
- Review 1 (2026-11-26): Δ phasors I_bc, I_ca unlabelled and θ label far from its arc — all currents labelled, θ beside the arc (registered so current labels step aside).
- Review 1 (2026-11-26): unbal on → Δ → Y lost the neutral section — `conn` no longer clears `unbal` (ignored while Δ).

## Changelog
- 0.1.0 (2026-11-26) — first release: balanced Y/Δ power, solve I_L/V_L/PF, per-phase Z, 4-wire neutral current.
