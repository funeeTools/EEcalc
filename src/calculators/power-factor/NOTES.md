# Power Factor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/power-factor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-power-factor.test.ts`

## Purpose and scope
P, Q₁, S, displacement and true PF of a load (single-phase or balanced three-phase), and the shunt capacitor that moves the displacement PF to a target (or the PF a given capacitor leaves). Line current before/after, capacitor voltage/current/var, C for unity, and an optional parallel-resonance check against the supply fault level. Not covered: active PFC design, harmonic filter tuning, unbalanced loads, per-phase three-phase power relations (→ `power/three-phase-power`).

## Model and why
- IEEE 1459-2010 with a sinusoidal supply voltage: S₁ = √(P² + Q₁²), D_I = S₁·THD_I, S = √(S₁² + D_I²), PF = cos θ₁/√(1 + THD²).
- Correction: Q_C = Q₁ − P·tan θ₂ (tan θ₂ < 0 for a leading target); C = Q_C/(k·ω·V²), k = 1 single-phase or Y bank on V_L, 3 for a Δ bank.
- The bank changes only Q₁; harmonic current I_H stays the same (stiff supply), so THD rises after correction.
- Resonance h_r = √(S_sc/Q_C) (IEEE 1531); warns within ±10 % of 5, 7, 11, 13 (plus 3, 9 on single-phase).
- Solve is closed form in both directions (Q_C is linear in C), so no root finder; round trips are exact to rounding.

## Deliberate choices — ask before changing
- **The PF input is the displacement PF** (builder, 2026-11-26). Capacitors correct only that; with THD = 0 it equals the PF that the reference calculator asks for. True PF is a result.
- **Load given as P, S or I** (select + ◎ on the computed ones, like the Smith page). All three are written back every compute, so switching form never changes the load. Field limits are 1e-40 … 1e40 so a computed form is refused only when the given one is typed near its own limit.
- **Target side select** (lag/lead) is shown only when solving C; in analysis `sync()` sets it from the achieved PF, so ◎ C after an overcorrected analysis returns the same C (round trip).
- **C = 0, not an error,** when the load already meets the target (note) or is leading (warning naming the reactor var). A harness round-trip flag from such a state (target typed, C clamped to 0) is legitimate.
- **C above 1 F** is NO SOLUTION (field max 1 F).
- **Harness flags kept (medium):** roundtrip after C was clamped to 0 (above); roundtrip at P ≫ Q_C (P ~ 1e20 W: Q_C lost to rounding); error-after-edit when the *given* P/S/I or target PF is typed at its min/max (computed forms fall outside 1e-40…1e40, or target 0). Low: unreadable C at absurd P (1e-22 W) and user-picked units.
- **Defaults** = the reference calculator's case (1 kVA, 0.8 → 0.95, 230 V 50 Hz → 20.28 µF): a single-phase motor/compressor-size load.
- **Departures from the reference calculator:** adds THD/IEEE 1459 split, three-phase Δ/Y banks, P/S/I load forms, analysis mode, current before/after, resonance check; graph of C vs target PF kept (non-draggable), plus current vs C.
- Diagram: one-line circuit (source, C, load block) + power triangle (P right, +Q up). P is stretched to ≥ 40 px when PF is tiny (hint says so).

## Sources
- IEEE Std 1459-2010 — definitions (from memory of the standard's sinusoidal-voltage case; not re-read).
- Alexander & Sadiku, *Fundamentals of Electric Circuits*, PF-correction example (4 kW, 0.8 → 0.95, 120 V 60 Hz → 310.5 µF): reproduced in tests; example number from memory.
- IEEE 1531 / IEEE 18 / IEEE 1036 — resonance formula and 110 % voltage rating (from memory).
- Arrillaga & Watson, *Power System Harmonics* — PF with distortion (from memory).
- Independent Python (`scratchpad/pb4/ref.py`, written from the equations, S₁ from √(S₁² − P²) rather than tan): 358 random states, max rel. error 2e-14.

## Known limits and open items
- No voltage distortion (THD_V = 0) and no voltage rise from the capacitor; no capacitor losses.
- Resonance check is the single-bank √(S_sc/Q_C) estimate; ignores load damping and other banks.
- Leading targets are not plotted on the C-vs-PF graph (lagging only).

## Review history
- Review 1 (2026-11-26): unity-PF load with a leading target (pfd 1, target 0.9 lead) warned "Overcorrected" — suppressed when a leading target is asked for.

## Changelog
- 0.1.0 (2026-11-26) — first release: displacement/distortion PF and shunt-capacitor correction, single- and three-phase.
