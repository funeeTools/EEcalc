# Battery Life — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `power/battery-life` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-battery-life.test.ts`

## Purpose and scope
Runtime of a battery-powered device from a duty-cycled load profile (up to 8 phases), through no regulator, an LDO
or a switching converter, with capacity derating and self-discharge. Solves runtime, required capacity, or the
maximum average load current for a target runtime. Not covered: voltage-vs-time discharge curves, regulator
dropout detail (→ `power/regulator-dropout`), charging (→ `power/battery-charge-time`).

## Model and why
- t = C·DoD·f_T·f_age·f_P / (I_bat + I_sd). Closed form, one forward model; C and I_avg,max by `invert()` (Brent).
- Battery current: none I; linear I + I_q; switching V_load·I/(η·V_bat,nom) + I_q (power balance at nominal voltage).
- Peukert (Peukert 1897; Linden & Reddy) f_P = (I_ref/I)^(k−1) with I_ref = C/H, **capped at 1 below I_ref**.
- Self-discharge: constant drain C·r_sd/month (month = 30.44 d). The reference calculator uses 720 h; difference 1.5 %.
- Accuracy: as good as the capacity, derating and self-discharge inputs; the model itself is bookkeeping.

## Deliberate choices — ask before changing
- Peukert capped at 1 below the rated current (builder, 2026-11-26): the law over-credits slow discharge.
- Peukert on the average current, not per phase (builder): simple, noted on the page as optimistic for pulses.
- k = 1 for every preset except lead-acid (builder): Peukert is a lead-acid fit; for alkaline/coin the help says
  enter the capacity at your current instead. No invented k values.
- Temperature and ageing are user-entered percentages, not curves (builder): no well-sourced generic curve.
- Departure from the reference calculator: adds regulator, Peukert, temperature/ageing derating, solve-for C and I_avg,max, a
  runtime-vs-current graph and the drawing; the reference calculator's "cutoff SoC" is our "usable depth" (= 100 − SoC_min).
- Default: 2 × AA alkaline, no regulator, MCU 4 mA 2 %, radio 25 mA 0.5 %, sleep 8 µA → 474 d.
- Warning thresholds: peak > 10·C/H (pulse capacity), I_q > 25 % of drain, runtime > 10 years, LDO rail above
  N·V_end. Duties ≠ 100 % → warning if over, note if under.

## Sources
- Peukert's law and its form with rated time H: Linden & Reddy, Handbook of Batteries 4th ed. — from memory.
- Self-discharge rates per chemistry (alkaline 2–3 %/yr, Li-ion 1–3 %/mo, NiMH 15–30 %/mo, LSD 3–6 %/yr,
  VRLA ~3 %/mo, CR2032 ~1 %/yr): Linden & Reddy and maker handbooks — **from memory, not re-verified**.
- Capacities: Energizer E91 (~2.5 Ah at 25 mA), CR2032 225 mAh, Yuasa NP7-12 7 Ah @ 20 h — from memory.
- Cell voltages: imported from `regulator-dropout/def.ts` CELLS (coin cell 3.0/2.0 V and VRLA 2.0/1.75 V local).
- Regulator I_q examples: MCP1700 1.6 µA, TPS7A02 25 nA datasheets — from memory.

## Known limits and open items
- No battery voltage curve: the switching-regulator current uses the nominal voltage (rises at end of discharge).
- Self-discharge is linear; real NiMH loses more in the first days, Li-primary less over decades.
- Coin-cell pulse derating is a warning, not a model. A per-phase Peukert or a pulse-capacity input could follow.
- Verified examples: Peukert 100 Ah/20 h/k 1.2/10 A → 8.7055 h (textbook form); no maker worked example found.

## Review history
- Review 1 (2026-11-26): lead → other chemistry kept ns = 6 (form writes the new chem before `apply`): each preset now sets its cell count.
- Review 1: LSD NiMH self-discharge 1.5 %/month was first-generation: now 0.4 %/month (≈ 5 %/yr, current cells).
- Review 1: alkaline preset ended at 0.9 V while E91 capacity is rated to 0.8 V: preset now 0.8 V (local, not from regulator-dropout's 0.9 V application cutoff).
- Numerics and Peukert confirmed by the independent review (Python/RK4 ≤ 5e-8).

## Changelog
- 0.1.0 (2026-11-26) — first release: runtime / capacity / current budget from a load profile with regulator, derating, Peukert and self-discharge.
