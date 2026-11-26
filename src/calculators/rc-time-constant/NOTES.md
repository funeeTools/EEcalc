# RC Time Constant — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/rc-time-constant` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-rc-time-constant.test.ts`

## Purpose and scope
RC charge or discharge between any two voltages (V₀ to V∞): τ, time to reach a threshold, voltage at a time, R or C for a design target, and the RC corner frequency with a low-pass/high-pass Bode plot. It is an ideal series RC; a loaded node is handled by the Thévenin workaround stated in the page notes, not modelled.

## Model and why
- v(t) = V∞ + (V₀ − V∞)e^(−t/τ), τ = RC; t(v) = τ·ln[(V₀ − V∞)/(v − V∞)]. Single-pole filter f_c = 1/(2πRC) (Horowitz & Hill §1.7).
- Every inversion is an exact rearrangement, so a solved R, C, t or V_th typed back reproduces the target.
- Ideal source, ideal capacitor (no leakage, ESR, dielectric absorption), no load on the node.
- Accuracy: the maths matches an independent reference to 1e-9 (200 random cases, every solve-for, both target types) and an RK4 integration of a 1 V → −2 V step to 1e-12.

## Deliberate choices — ask before changing
- **Solve-for set:** `t` (default), `vth`, `r`, `c`. For R and C a `target` select picks "V_th at time t" or "τ"; ◎ on the green τ makes τ the typed target. (builder)
- **Unreachable threshold** (wrong side of V∞, past it, or equal to V₀): t is `null` and the page warns. It is never NaN. The input box shows "—" but the state keeps its last t, so a round trip from that state "fails" on purpose. A threshold that cannot be designed for gives an error. (builder, harness flag kept 2026-11-23)
- **Asymptote warning beyond 3τ (95 %)**, to match the page's own advice "use a threshold below about 95 %". It had fired only past 99 %. (reviewer, 2026-11-22)
- **One rule for "Charging" vs "Discharge"** (does |V| grow, shrink or stay the same) drives the summary and the graph title, so `{v0:-5, vInf:0}` reads "Discharge" in both. (reviewer, 2026-11-22)
- **Unit lists include ps, GΩ, mF, F.** A solved C of 1 F had shown as "1e+6 µF". τ or t above 9999 s stays in s because no readable larger unit is meant; the harness "unreadable" flag there is legitimate (comment in def.ts). (builder, 2026-11-23)
- **t input is labelled "Time after step"**, with help covering both its meanings (result or given). (reviewer fix, 2026-11-22)
- Charging efficiency is stated as exactly 50 % from 0 V and (V∞+V₀)/(2V∞) in general, not "at best 50 %". (reviewer, 2026-11-22)
- E12/E24/E96 rounding of a solved R or C also shows the τ and time to V_th that value gives.
- The τ-multiples table and the "R = small / C = small / R > 10 MΩ" notes are reference/advice only. The table is deliberately not row-toned (reference data). (coordinator, 2026-11-23)
- Diagram "Circuit": step source → R → v_C(t) → C → GND. Solved: R or C; τ unless it is the target; V_th when solving it; t when solving t or when τ is the target. Red: R above 10 MΩ, V_th never reached or beyond 3τ, t shown as "never". (builder, 2026-11-22; labels set by coordinator)

## Sources
- Alexander & Sadiku ch. 7; Horowitz & Hill 3e §1.4 and §1.7; Nilsson & Riedel ch. 7; IEC 60063 (E-series). Standard textbook relations; no record that the books were opened, so **treated as from memory**. The numbers are checked by an independent Python reference (see above) and by the standard figures: 63.2 % at τ, 50 % at 0.693τ, 90 % at 2.303τ, 10–90 % rise 2.197τ, −3.01 dB and ±45° at f_c.
- The reference calculator was consulted only for its feature list.

## Known limits and open items
- No source resistance, load or leakage model; only the notes tell the user to add them.
- Thévenin load workaround is prose only (no load input).

## Review history
- Asymptote warning fired only past 99 % but advised staying below 95 % / 3τ → warning now beyond 3τ.
- Efficiency wording "at best 50 %" → exact statement.
- `{v0:-5, vInf:0}`: summary said "Discharge", graph title "Charging curve" → one rule.
- Capacitor note called −20/+80 % typical of electrolytics; that is Y5V/Z5U ceramics; aluminium electrolytics are about ±20 %.
- t input kept "Time to threshold" when V_th was the unknown → relabelled.
- Solved C = 1 F displayed as "1e+6 µF" → ps/GΩ/mF/F units added.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (warning threshold, labels, capacitor note), circuit diagram added 2026-11-22, mode-switch harness 2026-11-23 (readable units, expected-flag comments).
