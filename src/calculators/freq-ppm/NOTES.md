# Frequency ppm Tolerance — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/frequency-ppm-tolerance` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-freq-ppm.test.ts`

## Purpose and scope
- A converter: an offset given as ppm, Hz, % or an actual frequency, with the other three computed.
- A clock error budget: initial tolerance + temperature + ageing → the worst-case and RSS window, f_min/f_max, and drift in s/day and min/year.
- A link check: UART mismatch or USB device tolerance.

Load-capacitance pulling lives on `general/crystal-load-capacitance`.

## Model and why
- Each budget term is an interval in ppm. The worst case adds the intervals. RSS adds the centres and the half-widths in quadrature (correct for asymmetric terms such as the parabola).
- Temperature, as `range`: a ±b spec (AT-cut or oscillator), shown flat in the graph.
- Temperature, as `parabolic`: −β(T − T₀)² over [T_min, T_max]. It is one-sided: the high side is 0 only when T₀ lies inside the range.
- Ageing: A₁ for the first year plus A_n per later year, interpolated linearly within years. **Rejected:** The reference calculator's "first-year rate × years", which overstates long-term ageing. A log law was not used because no source was at hand; the theory says real ageing is roughly logarithmic.
- UART: δ_max = (½ − 1/OS)/(N − ½), derived from the sampling geometry (8N1, OS = 16 → 4.605 %). Both ends share it. The theory mentions STM32's 3.75 % as a practical figure.
- USB 2.0 §7.1.11 device tolerances: ±1.5 % low speed, ±0.25 % full speed, ±500 ppm high speed, judged on this clock alone.

## Deliberate choices — ask before changing
- No `def.solve`. The converter uses the given-as pattern (`given` plus solvedWhen/onSolve/onUnsolve); the computed boxes are solved results with digits: 12.
- Converter ranges are very wide (ppm up to 1e21, f up to 1e15). Only a negative frequency (ppm < −1e6) is an error: f = 10·f₀ is just a frequency, not a mistake. (builder, after the harness)
- β defaults to 0.034 ppm/°C², the commonly published figure. The ABS07 example uses its data-sheet typical value, 0.036.
- Default link is UART to a ±1 % RC clock (a common MCU case).
- Signed time strings use a typographic "−". Frequencies in hertz still use the shared `si()` ASCII minus.
- Drawing: bars with a value column at the right and ±k compact labels above 10⁴ ppm. A limit beyond 4× the window is shown as "off scale" text.
- Harness: the remaining medium "error-after-edit" flag is typed T_max < T_min, an input error. The low "big-jump" flags on link switches are expected.
- Left out: CAN bit-timing budgets (they need prescaler, segment and SJW settings, which is too much for this page) and Ethernet presets (their ppm values were not verified).

## Sources
- Abracon ABS07 data sheet (rev. 08-10-22): ±20 ppm, β −0.036 typ / −0.040 max, T₀ 20–30 °C, ageing ±3 ppm first year. **Verified** from the PDF.
- USB 2.0 §7.1.11 data-rate tolerances: from memory.
- STM32 reference-manual 3.75 % USART tolerance: from memory.
- Vig's tutorial: from memory.
- The 0.034 ppm/°C² figure: common knowledge, given in the brief; not checked against a specific document.

## Known limits and open items
- The parabola ignores the cubic term far from T₀ (a note warns beyond ±60 °C). The AT-cut cubic is not modelled.
- Ageing is linear within each year. A log ageing law needs a source before it is added.
- UART uses a fixed 8N1 / 16× case; other frame lengths and oversampling factors are not selectable.

## Review history
- Parabolic, T₀ 25 °C, 30–50 °C, init 0 → "+-0.073 s/day" → signed formatter with "−".
- USB presets did not say they are device values → labels, help and theory now say hosts and hubs need ±0.05 %.
- Ageing linear within the first year was not stated → said in the theory and help.
- Harness (builder): value labels overlapping the row names, and false "more than 100 %" converter errors → fixed.

## Changelog
- 0.1.0 (2026-11-26) — first release: ppm/Hz/%/f converter, initial + temperature + ageing error budget with drift, and UART/USB link check.
