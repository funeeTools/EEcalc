# Battery Charge Time — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/battery-charge-time` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-battery-charge-time.test.ts`

## Purpose and scope
Time to charge a battery to full (charger termination) or to a target SoC: CC/CV for Li-ion and LiFePO₄,
bulk/absorption/float for lead-acid, constant current for NiMH/NiCd. Charger input power, linear-charger
dissipation, energies and overall efficiency. Solves time, charge current or capacity. Not covered: JEITA
temperature windows, −ΔV detection, pulse/fast-charge algorithms, cell balancing.

## Model and why
- First-order equivalent circuit (OCV + R; Plett, BMS vol. 1): OCV linear from V₀ (empty) to V_CV (full).
  CC until V = V_CV, then I(t) = I₀e^(−t/τ), τ = R·C/(η_c·(V_CV − V₀)). CV onset SoC = 1 − η_c·I·τ/C.
- **τ is the input** (not R): it is what a datasheet charge curve shows, τ ≈ (1 − SoC_cv)/C-rate hours.
- Constant current: t = ΔSoC·C/(η_c·I).
- Alternative rejected: the reference calculator's "t_CV ≈ 0.25·t_CC above 80 %" rule — no source, and it makes the CV time grow
  with lower current, the opposite of real cells. The RC model gives the right trends (CV onset falls with
  C-rate, CV time grows only logarithmically, a time floor set by the taper).
- Checked against a Python RK4 integration of the ODE (not the closed form) at 58 random states: max 4e-8.
- Accuracy: first-order; expect roughly ±20 % unless τ is fitted to the cell (stated on the page).

## Deliberate choices — ask before changing
- τ presets (builder, 2026-11-26, **estimates, unverified**): Li-ion 0.3 h (CV at ~85 % at 0.5 C, ~70 % at 1 C),
  LiFePO₄ 0.1 h, VRLA 1.2 h (bulk ends ~70 % at 0.25 C, Battery University BU-403 rule from memory).
- NiMH/NiCd η_c = 70 % → 14.3 h at 0.1 C (makers' 14–16 h); the IEC 61951-2 rated charge (16 h) is η 62.5 % (test).
- Chemistry preset resets the cell count (form writes the new chemistry before `apply`; reviewer, 2026-11-26).
- Lead-acid uses the CC/CV model with V_CV = absorption voltage; "OCV" there is a modelling device. Stored energy uses a real OCV ending at 2.13 V/cell (from memory).
- No voltage curve for NiMH/NiCd (none modelled honestly); energy uses a mean charge voltage, stored energy 1.2 V/cell.
- Solving I or C on the flat (CV-limited) stretch returns the smallest current / largest capacity.
- Chemistry switch resets solveFor to time (targets don't carry over between profiles).
- Warnings: Li-ion > 1 C, VRLA > 0.3 C, NiMH > 0.3 C (termination) / > 0.5 C (fast), linear P_D > 1 W, V_in too low.

## Sources
- Plett, Battery Management Systems vol. I (2015) — OCV + R model: from memory.
- Linden & Reddy 4th ed. — charge methods, efficiencies: from memory.
- IEC 61951-1/-2 (0.1 C, 16 h), Yuasa NP manual (2.40–2.50 V cyclic, 2.25–2.30 V float, ≤ 0.25 C): from memory.
- Li-ion/LiFePO₄ V_CV and end voltages imported from `regulator-dropout/def.ts` CELLS.

## Known limits and open items
- Linear OCV: no plateau; V-vs-t during CC is illustrative. Temperature not modelled.
- Linear-charger thermal fold-back not modelled (warned). A "fit τ from a datasheet point" helper could follow.
- No published worked example for CC/CV time found; tests use the IEC NiMH rule and the Python ODE.

## Review history
- Review 1 (2026-11-26): nimh-std → Li-ion → ◎ C → Charge to soc gave "No capacity gives 9 h 57 min" (target 100 % > SoC_end, which is independent of I and C): now pre-checked with the specific message; Charge to = soc clamps socT below SoC_end (80 %, or back to full).
- Review 1: sla → Li-ion kept ns = 6 (form writes the new chem before `apply`): ns now reset from the preset (Li-ion 1, LiFePO₄ 4, NiMH/NiCd 4, lead 6).
- Review 1: nimh-std, ◎ I_chg, cap = 0.036 C → root on the 1 µA bracket end reported as no solution: bracket ends now checked.
- Review 1: chemistry → NiMH/NiCd silently kept socT = 80 %: now charges to 100 %.
- Review 1: lead-acid stored energy used OCV up to 2.45 V/cell (~10 % high): stored OCV now ends at 2.13 V/cell.
- Review 1: theory `\;` lost its backslash; IEC 61951-2 wording corrected (16 h rated = η 62.5 %; preset 70 % → 14.3 h).
- Kept harness flags: roundtrip on the CV-limited flat stretch (smallest I / largest C returned); "under a second" / "stops at 7 %" after a chemistry or target switch only with extreme typed values (C ≈ 0.1 mAh at 1.75 A, τ ≈ 100 h).

## Changelog
- 0.1.0 (2026-11-26) — first release: CC/CV, lead-acid 3-stage and NiMH/NiCd charge time with charger losses; solve time, current or capacity.
