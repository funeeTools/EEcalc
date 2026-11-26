# Embedded Resistor — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/embedded-resistor` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-embedded-resistor.test.ts`

## Purpose and scope
Buried planar resistors: thin film (OhmegaPly NiP, Ticer TCR NiCr, NCAS, CrSiO) and polymer thick-film (PTF) carbon ink. R = R_s · squares with meander corners, untrimmed tolerance from sheet and etch, TCR drift, power rating, narrowest width for a power, and a material table judged against the power. Solve for the straight length L (default), the width W, or the resistance. Default: 100 Ω from 25 Ω/□ OhmegaPly at W = 0.5 mm, 70 °C ambient, 50 mW.

Not covered: laser-trimming practice beyond the design target, ceramic thick film (e.g. DuPont Interra: no data found), current crowding at terminations.

## Model and why
- R = R_s·N, N = L/W + 0.56·n_c; the corner counts 0.56 squares because the current cuts it (Ohmega Design Guide v18). Area A = W·(L + n_c·W).
- Tolerance, worst case (Snogren Tables 3–4): etch moves W and L by +e⁺/−e⁻ (½ oz copper: +10/−5 µm, which reproduces Snogren's Table 4), and the sheet tolerance is added on top. A laser-trimmed design is drawn at R/(1 + tol⁺).
- R(T) = R(25 °C)·[1 + TCR·(T − 25)] (vendor RTC, MIL-STD-202 method 304).
- Power P = PD·A. For OhmegaPly NiP the page uses Ohmega's area-dependent curve PD = a·A^−0.87 mW/mil² for small elements, held at its 200 mil² value below that.

## Deliberate choices — ask before changing
- **The power rating follows the ambient**: the 25 °C and 80 °C Ohmega tables are interpolated (reviewer found P_max used the 25 °C table at the old 85 °C default, overstating it about 1.5×; builder fixed). The default ambient is now 70 °C; a a warning above 80 °C, the highest tabulated temperature.
- **±5 % kept for 10 Ω/□**: the 2023 selection guide (v7, the current document) says ±5 %; Design Guide v18 says ±3 %; the preset keeps ±5 % and the v18 figure is noted (reviewer raised it, builder decided).
- Small elements: the etch model is optimistic against Ohmega's measured data (8 × 8 mil at 25 Ω/□ measured a mean of 35 Ω and ±50 % where the page predicts +13 %). A warning for thin-film elements under 10 mil cites it (reviewer, 2026-11-25).
- The curve is held at 200 mil² below that size, not extrapolated: 200 mil² (20 × 10 mil) is the size the selection guide rates. For the NiP presets the rating is the larger of the curve and the large-element value.
- **PTF power density is borrowed** from Ohmega's 100 Ω/□ large-element value, because no vendor figure is published and Snogren says the thin-film rules apply; the page says so. PTF warns that untrimmed printed resistors hold about ±40 % in general (±20 % at best).
- **Left out on purpose** (builder): the reference calculator's trimmed-tolerance rule ("half, capped at ±5 %": unsourced) and ceramic thick film.
- Table values: "< 110" TCR is taken as +110; Ticer maximum power is the 40 °C figure.
- Tolerance prints the same number of decimals on both sides ("+6.59 % / −7.10 %").
- Drawing: inner-layer plan view with the `film` material between copper ends, and a lengthwise section that is not W × T to scale because the film is under 1 µm: film and copper use the §7b legible minimum and the drawing says so. The film runs under all the first-etch copper, not only W wide (reviewer). PCB material kit (user, 2026-11-24); the `film` colour was added 2026-11-25 and retuned by the coordinator after the reviewer saw it indistinct from copper in dark theme.

## Sources
- **Verified by the reviewer in Ohmega Design Guide v18:** corner 0.56 squares; the 37 + 16 × 0.56 = 45.96 squares example; the large-element densities 0.187/0.150/0.138/0.100/0.090 mW/mil² at 25 °C; coefficients 76.5/61.2/54.5/45.9/39.7 (25 °C) and 49.7/39.9/35.4/29.8/25.9 (80 °C); 5–10 mil overlap; 10 mil (PTH) and 5 mil (microvia) isolation distances.
- Quantic Ohmega Product Selection Guide 2023 (OhmegaPly and Ticer tables), MIL-STD-202 method 304, Snogren (IPC): used for the presets.
- **Not verified:** the Ticer NiCr, NCAS and CrSiO values and the Snogren tables had no accessible source for the reviewer.

## Known limits and open items
- Tolerance is a worst-case stack, not a distribution; PTF thickness variation and trimming are not modelled.
- Vendor power densities assume their test stack-ups.

## Review history
- P_max ignored temperature (default T_op 85 °C used the 25 °C table) → interpolated tables.
- 10 Ω/□ tolerance ±5 % against ±3 % in v18 → ±5 % kept and noted.
- Small elements under about 10 mil: model +13 % against Ohmega's measured ±50 % → warning.
- Plan view drew the film only W wide under the terminations → under all the copper.
- `pctS` showed "+10.0 % / −10.00 %" → same decimals.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed 2026-11-25 (temperature-dependent power, small-element warning, film drawing), fixed 2026-11-25.
