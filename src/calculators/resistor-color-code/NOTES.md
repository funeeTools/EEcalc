# Resistor Color Code — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/resistor-color-code` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-resistor-color-code.test.ts`

## Purpose and scope
Read or make the colour bands of leaded resistors (3–6 bands: digits, multiplier, tolerance, TCR), read SMD markings, and check the value against the IEC 60063 E-series (E6–E192).
Out of scope: capacitor and inductor colour codes, military reliability bands, the obsolete body-end-dot code, and capacitor SMD codes.

## Model and why
- Colour table per IEC 60062:2016. It includes pink (×0.001) and the yellow (±0.02 %) and grey (±0.01 %) tolerances added in 2016.
- Decode: mantissa × 10^mult, computed through decimal-safe `toPrecision(12)` rounding.
- Encode: round to 2 or 3 significant digits with the exponent adjusted. A value that needs more digits is coded rounded, with a warning.
- SMD markings:
  - 3-digit and 4-digit codes.
  - R/K/M/G as the decimal point (IEC letter code: 4R7, 4K7).
  - EIA-96 (index into E96 plus a multiplier letter Z/Y=R/X=S/A/B=H/C/D/E/F).
  - 0, 00, 000 for a zero-ohm jumper.
- E192 is built by formula with the single exception at index 185 (9.20). E6/E12/E24/E48/E96 come from `core/eseries`.
- There is no def.solve. The modes are a `mode` select (decode / encode / smd). ◎ on R switches decode ↔ encode through solvedWhen/onSolve/onUnsolve.

## Deliberate choices — ask before changing
- **Value kept across mode switches** (builder):
  - decode ← encode/smd fills the band selects from R.
  - smd ← encode codes the value *as the bands code it*.
  - A value with no marking clears the code; it never keeps a stale one (reviewer, 2026-11-26).
- **No silent band-count jump** (reviewer, 2026-11-26).
  - Choosing 3/4 bands for a 3-digit value rounds it (49.9 → 50 Ω) and warns.
  - `roundedFrom` remembers the original value, so going back to 5/6 bands restores it.
  - The warning appears only while `roundedFrom` still matches the bands, so a stale flag cannot mislead.
- **Out-of-range encode is a warning, not an error.** It shows a NO CODE status. This keeps a band-count switch from ever turning the page red (harness fix).
- **"ddR" codes are ambiguous** (e.g. 47R). They are read as R-decimal (47 Ω), with a warning that gives the EIA-96 reading (3.01 Ω). The decoder tests the R-decimal pattern before the EIA-96 one on purpose.
- **SMD-equivalent bands:**
  - 3-character codes map to 4 bands ±5 %.
  - 4-character and EIA-96 codes map to 5 bands ±1 %.
  - The marking itself carries no tolerance; a note says so.
- **In encode mode the E-series check uses the typed value**, not the rounded one. The encode result key is `coded`, not `r`, so it is never written back over the input.
- **Drawing:**
  - Band and body colours are data (`BAND_RGB`, `BODY_RGB` in `model.ts`), outlined with a theme stroke.
  - The body is beige for 3/4 bands and blue (metal film) for 5/6.
  - SMD mode draws a chip with the printed code.
- **Departures from the reference calculator:**
  - Decodes 6 bands, the TCR band and SMD codes. Encodes any value, not only E12.
  - Replaces their E12 table with the IEC 60062 colour table plus an E-series "ladder" graph.
- **Kept harness flags:** low `big-jump` flags from band or band-count edits. Changing a colour changes the reading by design.

## Sources
- **IEC 60062:2016 colour table:** checked against Wikipedia's IEC 60062:2016 table (secondary); the standard itself was not read.
- **EIA-96 index and letters:** from memory (resistor makers' marking guides). The E96 values were cross-checked with an independently typed list in the Python reference.
- **IEC 60063 E-series and the E192 9.20 exception:** from memory and `core/eseries`.
- **Python cross-check:** independent rounding with `%.Ne`; 148 cases, all exact.

## Known limits and open items
- Pink and the 2016 tolerance colours are rare on real parts. Old charts differ.
- Not handled: the "m" milliohm notation and manufacturer-specific codes (e.g. Bourns 4-digit with letters).
- The colour rendering is approximate; brown/red/orange are easy to confuse.

## Review history
- `six` example (49.9 Ω) → 4 bands silently snapped back to 5. Now rounds with a warning, and 5 bands restores the value.
- Encode 4753 Ω → SMD kept the old "472", so A→B→A failed. Now codes the shown value ("482").
- Encode 0.0047 Ω → SMD kept "472" (4.7 kΩ). Now clears the code with a NO CODE warning.
- Encode 699 GΩ with 4 bands gave a red error. Now a warning that suggests 5 bands.
- SMD EIA-96 equivalent showed 4 bands ±5 %. Now 5 bands ±1 %.
- A 0 Ω jumper showed "±5 %". The tolerance is now hidden for 0 Ω.

## Changelog
- 0.1.0 (2026-11-26): first release. IEC 60062 band decode/encode (3–6 bands), SMD (3/4-digit, R/K/M, EIA-96) and the E6–E192 check.
