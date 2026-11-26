# I²C Pull-up — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `protocol/i2c-pullup` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-i2c-pullup.test.ts`

## Purpose and scope
Pull-up resistor window for an I²C line in Standard, Fast or Fast-mode Plus: R_p(min) from the sink condition, R_p(max) from the rise time and from input leakage, a recommended standard value with a rise-time margin, the maximum bus capacitance, and a bus waveform. Solve options: R_p (recommend, default), C_b (maximum capacitance for a given R_p), t_r (analyse a given R_p and C_b).
Not covered: High-speed mode and Ultra Fast-mode, current-source pull-ups and bus buffers (the theory only describes them), arbitration or clock stretching, multi-segment bus models. Values are per line (SDA and SCL).

## Model and why
- NXP UM10204 Rev. 7.0: R_p(max) = t_r/(0.8473·C_b), where 0.8473 = ln(7/3) for the 30 %→70 % crossing of an RC charge (eq. 1); R_p(min) = (V_DD(1 + tol) − V_OL)/I_OL (eq. 2). V_OL/I_OL come from Table 10 by mode and V_DD (0.2·V_DD at 2 mA when V_DD ≤ 2 V, otherwise 0.4 V at 3 mA, or 20 mA in Fm+); t_r and C_b limits from Table 11 (1000 / 300 / 120 ns; 400 / 400 / 550 pF).
- **Leakage limit (§7.4):** the 10 µA per-pin input current must not pull the high level below V_IH plus the 0.2·V_DD noise margin, i.e. below 0.9·V_DD, giving R_p(max,leak) = 0.1·V_DD,min/(N·10 µA). It matches UM10204 Fig. 47. The upper limit is the smaller of the rise-time and leakage limits.
- Recommendation: the largest standard value whose tolerance band still fits the window with a rise-time margin (default 20 %). If no value leaves the margin, it picks the fastest valid one and warns; if the window is empty it fails and names the limit that closes it plus the C_b the supply allows.

## Deliberate choices — ask before changing
- R_p(min) is evaluated at the **highest** supply (V_DD·(1 + tol)); the spec's own example uses it. The leakage limit uses the lowest.
- "Devices on the bus" N (default 4) feeds the leakage limit. 10 µA is the spec's worst case and the theory calls it conservative (reviewer fix, 2026-11-22).
- The sink condition is a select (state key `sink`: `spec`, `fm6`, `custom`) replacing an earlier boolean `specSink`. "Fast-mode 6 mA at 0.6 V" is Table 10 note [4] and is what makes a 400 pF Fast-mode bus possible (window 477–885 Ω, E24 680 Ω). It is rejected outside Fast-mode; choosing it selects Fast-mode, and leaving Fast-mode resets the sink to spec.
- If no standard value fits the window the page does **not** label a non-standard value as standard: it returns `ok: false` and names the first finer series or tighter tolerance that fits (E48 1.05 kΩ ±1 % for 330 pF). The one exception is a window that shrinks to a single point after ◎ (the §7.2.4 example): then it shows the nearest part (1.8 kΩ) with a warning and the finer-series tip (mode-switch harness, 2026-11-23).
- A settings switch (bus speed, sink, series, tolerance) keeps the R_p design if one still exists, otherwise analyses the entered R_p with an OUT OF SPEC status and reason, instead of a red "no pull-up" error. ◎ R_p from an out-of-spec analysis stays red, and typed numbers with no window stay red (style guide §5).
- Any sink with V_OL above 0.2·V_DD warns about the low-level noise margin. The "narrow window" warning fires only when the spec window itself is narrow (R_p max/min below 1.5); when only the margin cannot be met a separate warning says to lower the margin.
- C_b units stop at pF/nF/µF (no fF).
- The first graph is **Bus waveform** (RC edges over three clock cycles, 30→70 % takes t_r); rise time vs R_p and R_p window vs C_b (after UM10204 Fig. 41) are the second and third tabs (coordinator, 2026-11-23). Table rows: red outside the window, yellow inside the margin, green otherwise.
- Defaults: Fast-mode, 3.3 V ±5 %, 100 pF, N = 4, E12, 5 % resistors, 20 % margin → 2.2 kΩ, 186 ns, window 1.02–3.54 kΩ (reason for the choice not recorded).
- Switched pull-ups are described as switching in a second, smaller resistor during the rising edge (§7.2.4); only current-source pull-ups give a constant-slope edge (theory fix).

## Sources
- NXP UM10204 Rev. 7.0 (1 Oct 2021): the builder downloaded it and read Tables 10–11 and §7.1–7.2; the reviewer checked against it. **Verified**: the §7.2.4 example (5 V ±10 %, 0.4 V at 3 mA → 1.7 kΩ, 208.3 pF), the 0.8473 constant, and Fig. 41 end points (2.95 kΩ Sm 400 pF, 885 Ω Fm 400 pF, 258 Ω Fm+ 550 pF) are in the tests.
- Defaults and recommendations were checked against an independent Python script.

## Known limits and open items
- Wiring and pin capacitance are lumped into one C_b; there is no distributed-line model.
- Only one R_p per line: switched pull-ups are described in the theory, not modelled.
- The 10 µA leakage figure is the spec's worst case and may be conservative for real parts.

## Review history
- Rp(max) ignored input leakage: it recommended 39 kΩ on a small Standard-mode bus where at most about 16 kΩ is allowed. Added; 12 kΩ with N = 2 and 6.8 kΩ with N = 4, 39 kΩ fails.
- A 330 pF repro labelled a non-standard value as standard. Fixed (E48 suggestion).
- No Fast-mode 6 mA option; 400 pF buses had no answer. Added.
- Failure message suggested Fm+ drivers when already Fm+ or VDD ≤ 2 V; "narrow window" fired for a large margin alone. Fixed.
- Harness: Standard-mode 350 pF example → Fast-mode gave a red error; "Fast-mode 6 mA" sink with another bus speed gave a red error; §7.2.4 example → ◎ R_p had no answer. All fixed. Thirteen high flags across the app remain legitimate, including "no I²C pull-up works at 350 pF in Fast-mode" (real physics).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-22, reviewed and fixed 2026-11-22 (leakage limit, 6 mA sink, standard-value honesty), diagram 2026-11-22, row tones 2026-11-23, bus-waveform graph 2026-11-23, harness 2026-11-23.
