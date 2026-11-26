# Wire Gauge — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/wire-gauge` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-wire-gauge.test.ts`

## Purpose and scope
- Converts between AWG, diameter and area (including IEC 60228 metric sizes).
- Gives the DC resistance of copper or aluminium at the conductor temperature, and the voltage drop and loss for a run.
- Solves for the smallest size that meets a drop limit, plus a building-wire ampacity guide.
Out of scope: AC skin effect (see the skin-depth pages), PCB traces (trace-width/trace-resistance pages), fusing (fusing-current), and derating for bundling or ambient.

## Model and why
- AWG per ASTM B258: d = 0.005 in · 92^((36−n)/39). 1/0..4/0 map to n = 0..−3. The formula is used unrounded (B258 tabulates to 0.0001 in).
- ρ(T) = ρ20·[1 + α(T−20)]:
  - annealed Cu: 1/58 Ω·mm²/m, α 0.00393 (IEC 60028);
  - Al 1350: 0.028264, α 0.00403 (IEC 60889).
- Drop: ΔV = I·ρ/A·ℓ·(2 for out and back, 1 for one conductor).
- Solid round conductor only. Stranding adds about 2 %; this is stated in a note, not modelled.

## Deliberate choices — ask before changing
- **Three size forms (AWG / area / diameter)** use the Smith-style "given" pattern: ◎ on a solved form makes it the typed one. Their limits span the same wires (AWG −20…60), so no form can solve another out of range.
- **Size solve:**
  - ◎ on ΔV makes it a limit.
  - The AWG form searches whole gauges 56 → 4/0 and the area form searches IEC 60228 0.5–300 mm²; both snap to a standard size.
  - The diameter form is exact.
  - ◎ on ΔV with a wire above 300 mm² or 4/0 switches to the diameter form instead of failing.
- **Ampacity scope** (builder, with the user's rule "only from a cited table"):
  - NEC Table 310.16: 75 °C and 90 °C columns only, whole AWG 14–4/0 Cu and 12–4/0 Al, plus the 240.4(D) small-conductor limits.
  - The **60 °C column and 16–18 AWG are left out** because I could not confirm them against a second source. The 75/90 °C values matched a 2017-NEC chart.
  - No ampacity for metric or chassis wiring: I found no clean source.
  - The reference calculator's 2.5 A/mm² rule of thumb was deliberately not copied.
- **IEC 60228 values are class 2 maxima** (the reviewer asked not to claim class 1). The page shows both the nominal-area R and the standard's maximum.
- **Drawing:**
  - Shows the wire and its ±2-gauge or adjacent-IEC neighbours on one scale, with a 1-2-5 scale bar.
  - Above 4/0 the neighbour is 250 kcmil. Sizes past 56 AWG or outside the IEC range are omitted.
  - Aluminium uses the `solder` kit fill (silver), not a new colour.
- **Default:** 12 V, 10 A, 2 × 3 m, 12 AWG gives 2.6 % against a 3 % limit, a realistic low-voltage DC run.
- **Kept harness flags:**
  - Medium `roundtrip` flags from the size solve snap to a standard size (explained in a comment in def.ts).
  - `unreadable` flags in kcmil and in, which have no SI prefixes.

## Sources
- **ASTM B258 table diameters** (4/0, 10, 12, 24, 36, 40 AWG): test, values from memory.
- **NEC Ch. 9 Table 8** (14/12/10 AWG Cu at 75 °C = 3.07/1.93/1.21 Ω/kft): test, from memory.
- **NEC 310.16 75/90 °C:** verified against Cerrowire's 2017-NEC chart.
- **IEC 60228 class 2 maximum resistances:** from memory, not checked against the standard.
- **Python cross-check:** 186 cases over all forms and both solves, ≤ 6e-16.

## Known limits and open items
- Optional: a NEC 60 °C column and 16/18 AWG, if verified.
- Optional: kcmil sizes beyond 4/0 in the size search.
- Optional: an IEC 60364-5-52 ampacity guide.
- The gauge graph's log y-axis shows "100m" for 0.1 %.

## Review history
- ◎ on ΔV with 400 mm² failed ("Even 300 mm²…"). Now switches to the diameter form.
- Gauge > 56 gave an empty length graph. The neighbour filter was fixed.
- The ΔV box showed 3 significant figures (digits: 4 in exponent form), flagged as a display mismatch. The digits override was removed.
- The ΔV field range refused large solved drops. The range is now 1e-30…1e30.
- Neighbour above 4/0 was drawn as "−5 AWG". Now 250 kcmil.
- IEC column was labelled class 1/2. Now class 2.

## Changelog
- 0.1.0 (2026-11-26): first release. AWG/mm²/diameter, Cu/Al resistance at temperature, voltage drop, size for a drop limit, NEC ampacity guide.
