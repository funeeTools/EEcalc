# Capacitor Energy — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/capacitor-energy` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-capacitor-energy.test.ts`

## Purpose and scope
- Stored energy and charge.
- Usable energy between V₁ and V₂.
- Hold-up time of a constant-power load (DC/DC converter), including ESR loss.
- Series/parallel banks of identical cells.
- Solves C or V₁ for an energy or hold-up target.
Out of scope: charging circuits (rc-time-constant, inrush), leakage and self-discharge, cell balancing design.

## Model and why
- E = ½CV², Q = CV (A&S §6.2).
- The hold-up uses a **closed form derived here** for constant power P' = P/η through ESR R:
  - The current takes the low-current root, i = (v − √(v² − 4RP'))/2R.
  - t = (C/2P')·[F(V₁) − F(V_c,end)], with F(v) = v²/2 + (v·s − a·ln(v+s))/2, s = √(v²−a), a = 4RP'.
  - The cut-off V₂ is at the terminals, so V_c,end = V₂ + P'R/V₂.
  - A solution exists only if V₂² ≥ P'R (the maximum-power point).
  - It reduces to C(V₁²−V₂²)/2P' when R = 0.
- **Why derived, not cited:** app-note formulas use an average current with a fixed ESR drop, which is approximate. This form follows directly from KVL.
- The Python check uses a different closed form, integrating over the terminal voltage: t = (C/P)[v²/2 − PR·ln v]. It is also checked against RK4.
- Solve C for a hold-up target is exact, because t ∝ C. Solve V₁ bisects the same closed form.
- Bank: C_bank = n_p·C/n_s, ESR_bank = n_s·ESR/n_p. C and ESR are per cell.

## Deliberate choices — ask before changing
- **E and t_hold are both solved fields and both possible targets** (the rc-time-constant τ pattern). The `target` select appears when solving C or V₁.
- **◎ on C or V₁:**
  - Keeps a hold-up target only if one can be met; otherwise it switches to an energy target.
  - ◎ on t_hold where no hold-up exists (ESR limit, or V₁ below the cut-off) leaves the page on the analysis, whose warning explains why (reviewer, 2026-11-26).
- **When the hold-up is 0 or at the ESR limit,** t_hold shows "0"/"—" and the state keeps the last target. The page never writes 0 or a stale value as a target.
- **Current at V₂ = 0 is unbounded.** It shows as "unbounded", and the current trace is omitted (it once showed "Infinity A").
- **Time units are SI-prefixed seconds (ks, Ms), not min/h,** so the core can move a solved value to a readable prefix. The displayed text still uses min/h. Energy stops at fJ, because the core has no atto prefix.
- **Field ranges are wide on purpose** (E up to 1e21 J, t_hold up to 1e40 s). Every computed output must fit its field, or the core refuses it.
- **Default:** 470 µF on a 24 V rail, 5 W at 90 % down to 18 V, ESR 50 mΩ, giving 10.6 ms (a typical bulk-capacitor hold-up).
- **Departures from the reference calculator:** adds hold-up with ESR, banks, and solving for C or V₁. Charge time is optional (average I and P only). Their draggable point is not copied.
- **Kept harness flags:**
  - High: ◎ on t_hold in the ESR-limit example once errored. It is now a no-op on the analysis, so this is expected to be gone.
  - Medium: `unreadable` below 1 fJ / 1 fs at the field minima.
  - Medium: `error-after-edit` for typed targets out of range.

## Sources
- **Alexander & Sadiku, 6th ed., Example 6.1 and Practice Problem 6.1:** from memory. The numbers are certain; the example numbering may differ by edition.
- **IEC 62391-1:2015:** cited for supercapacitor ratings only.
- **Python cross-check:** 156 cases, ≤ 6e-16; E_ESR closed form; RK4 integration.

## Known limits and open items
- C and ESR are constant: no voltage or temperature dependence of supercap C or ESR, and no leakage.
- Optional: a self-discharge input; a constant-current load option.

## Review history
- A&S 6.1 example (V₂ = 0) showed "Infinity A". Fixed.
- ESR-limit example → ◎ C gave a red error. Now falls back to the energy target.
- ◎ t_hold restored a hidden 10 ms target. Now stays on the analysis.
- The `supercap` example label said "2 × 10 F" while solving 2.27 F per cell. Relabelled.
- The bank box caption overlapped the ESR label. Bank data moved into the C label.

## Changelog
- 0.1.0 (2026-11-26): first release. ½CV², usable energy V₁→V₂, constant-power hold-up through ESR, cell banks, solve C or V₁.
