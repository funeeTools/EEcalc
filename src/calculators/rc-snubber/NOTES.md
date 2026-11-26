# RC Snubber — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/rc-snubber` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-rc-snubber.test.ts`

## Purpose and scope
Dissipative RC snubber across a switch or rectifier to damp switch-node / diode ringing: parasitic L and C from the two-measurement method (or entered directly), R_s and C_s, resistor power, and the resulting overshoot.
Not covered: RCD clamps (`power/rcd-clamp-snubber`), turn-off (dv/dt) snubbers for thyristors/IGBTs, lossless snubbers, the snubber's effect on the switch's turn-on loss.

## Model and why
- Parasitics: C_p = C_add/((f₀/f₁)² − 1), L_p = 1/((2πf₀)²C_p), Z₀ = √(L_p/C_p) (SLVA255 eq. 1–3, Todd SLUP100).
- Snubber: R_s = k·Z₀, C_s = n·C_p; k and n are inputs (defaults 1 and 4) so the design is a forward formula and every mode round-trips.
- P_R: ½·C_s·V² per hard edge, independent of R_s. Inductive node (default): one hard edge, the inductor commutates the other ⇒ ½·C_s·V²·f (SLVA255). "Both edges hard" ⇒ C_s·V²·f (Todd), also shown as the bound. Resistor rating = 2 × P_R.
- Damping: exact step response of a V step through L_p into C_p ∥ (R_s + C_s). Normalised by ω₀ the denominator is k·n·x³ + (1+n)x² + k·n·x + 1, so the overshoot depends only on (k, n). Poles: real root by bisection, deflation chosen to avoid cancellation for |r| > 1, residues summed. Peak by a two-segment scan (fine over the first 40 rad, coarse over three slow periods) plus golden-section polish.
- Lossless loop: the unsnubbed overshoot is 100 %; real boards have some damping, so overshoot numbers are upper bounds.

## Deliberate choices — ask before changing
- **P_R basis is a setting** (reviewer, 2026-11-26): ½·C·V²·f for an inductive hard-switched node (default), C·V²·f when both edges are hard. The reference calculator uses C·V²·f. The page notes that part of the hard-edge energy heats the switch.
- Method switch carries L_p/C_p over (two → L,C) and back (f₀ from L,C; f₁ from C_add), so A → B → A is unchanged.
- "Ringing device" select (switch / diode) changes the drawing only.
- Solve modes: `rs` design (inputs n, k), `cs` power budget (input P_R, k → C_s, n), `pr` analysis (inputs R_s, C_s → P_R, n, k). Result keys `n` and `k` are state paths so the solved ratios are written back (fixed harness round-trip flags, 2026-11-26).
- E-series table (E6…E96, default E24) brackets R_s and C_s; rows judged by overshoot vs the ideal design (+5 / +15 points) and, in budget mode, by P_R ≤ budget. Fields keep the ideal values.
- Warnings: f-shift too small ((f₀/f₁)² − 1 < 0.5) or too large (> 15); n < 2; k outside 0.3–3; 3τ > t_on,min; P_R > 3 W. Resistor rating shown at 2× P_R (common 50 % derating).
- Kept harness flags: `error-after-edit` (medium) when a typed f₀ or f₁ makes f₁ ≥ f₀ — a typed contradiction, red by §5a (comment in compute). `graphs-vanished` (low) after typed extremes that give NO SOLUTION.
- Switching-frequency units have no GHz (unreadable-value flag).
- Departures from the reference calculator: added the "known L and C" input, the k ratio, the power-budget and analysis solves, and the overshoot model/graphs; the reference calculator's 2τ ≤ t_on,min check became 3τ (95 % settling).
- Defaults: 12 V buck node, 180 MHz → 95 MHz with 1 nF (C_p ≈ 386 pF, L_p ≈ 2 nH), 500 kHz, n = 4, k = 1.

## Sources
- TI SLVA255 (Falin, 2006): **verified** from the PDF — eq. 1–3, the 217 MHz / 300 pF / 113 MHz example (5.4 nH, 7.3 Ω with the ½-frequency assumption), ½·C·V_pk²·f.
- Todd, SLUP100 (Unitrode SEM-900): **from memory** (TI login wall) — R = Z₀, C_s = 3–4·C_p, P = C·V²·f.
- Erickson & Maksimović, Mohan et al. ch. 27: from memory, background only.

## Known limits and open items
- The excitation is an ideal voltage step; a current-fed turn-off edge or a diode's recovery current gives a different (usually larger) initial overshoot.
- Snubber-loop ESL and R_s inductance are ignored; C_s voltage coefficient is ignored (C0G assumed).
- Possible additions: RCD/turn-off snubber link, effect of C_s on switch turn-on loss (½C_sV² dumped into the switch in hard-switched legs).

## Review history
- 2026-11-26 independent review (numerics matched Python). Fixed:
  - P_R = C·V²·f overstated an inductive node ×2 and called SLVA255's ½ "one edge" → edges setting, both values shown, theory rewritten, switch turn-on share noted.
  - 400 V rectifier example drawn as a MOSFET → diode drawn; C_p junction dot drawn after the capacitor.
  - two → known L,C reverted to stale 2 nH / 400 pF → values carried over (test).

## Changelog
- 0.1.0 (2026-11-26) — first release: two-measurement parasitic extraction, R = k·Z₀, C = n·C_p, P_R = C·V²·f, exact overshoot; solves design, power budget, analysis.
