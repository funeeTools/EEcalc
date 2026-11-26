# Mixer Spur Calculator — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `rf/mixer-spur-calculator` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-mixer-spur.test.ts`

## Purpose and scope
Frequency planning for a mixer: which m·f_LO ± n·f_in products land in (or near) the wanted output band, and which input frequencies (image, half-IF, IF feedthrough) would land in the output band and must be filtered before the mixer. Down- or up-conversion, high- or low-side LO, fixed (block) or tuned (channel) LO. Solves for f_LO, f_out or f_in.

Not covered: spur **levels** (see below), intermodulation between two input tones, mixers with internal filtering or image-reject architectures.

## Model and why
- Products f = |m·f_LO ± n·f_in|, order m + n ≤ N (2 to 11, default 5), the wanted 1×1 product excluded. The wanted sign is the sum only for up-conversion with a low-side LO; otherwise the difference (`wantedSign`).
- Fixed LO: the whole input band is present at once, so each product sweeps an interval over the band. Tuned LO: one channel at a time, the LO moves so the wanted output stays at f_out, and the n-th harmonic of the channel is taken as n·B_out wide (builder).
- Input-referred responses are the intervals of input frequency that map into the output band, one per (m, n, sign) branch, at the centre-channel LO.
- Every reported frequency is folded to a positive physical one (a low-side LO below the IF gives the image from the sum product at |f_LO − f_out|).
- Row tones: red = inside the output band, yellow = closer than the edge margin Δ to a band edge, green = clear. Status IN BAND / CHECK / CLEAR follows.

## Deliberate choices — ask before changing
- **Frequencies only, no spur levels** (builder, reported 2026-11-23): no generic, citable double-balanced-mixer level table was found. The page notes the (n − 1) dB per dB rule and points to the mixer's own m×n table.
- Default is the 902–928 MHz ISM band block-converted to a 70 MHz IF with a high-side LO at 985 MHz, spurs to order 5, edge margin 10 MHz (builder).
- The direction switch swaps the f_in/f_out boxes with their bandwidths, units and ◎ so the plan stays valid (the wanted-product relation gives the same LO either way). If the frequencies are already in the new order it keeps them (mode-switch regime, style guide §5a).
- Changing the LO side sets the solve-for back to f_LO.
- A tuned plan that would need a negative LO is refused, not clamped.
- Order field limited to whole numbers 2–11; below 5 a note warns that spur tables usually go to 5–7 (reason for 5–7: builder, not sourced further).

## Sources
- Henderson & Camargo, *Microwave Mixer Technology and Applications* (2013): m×n products, spur charts. Pozar 4th ed. ch. 13: mixer frequency relations, image. Rohde, Whitaker & Zahnd, *Communications Receivers* 4th ed. (2017): image, half-IF, IF feedthrough. Cited in model.ts; the reports do not say whether the books themselves were opened (**verification not recorded**).
- No published worked example exists. The test uses the FM relations from Rohde et al.: 100 MHz input, 10.7 MHz IF, LO 110.7, image 121.4, half-IF 105.35 MHz.
- Builder's independent Python brute-force scan (180 points, 60 per solve): solved frequency within 8.5e-14, spur distances exact, in-band counts matched, 10 M probes of the response intervals with no miss.

## Known limits and open items
- Levels are not modelled (see above); no intermod or LO-harmonic leakage into the input band beyond the product list.
- The input-response table is evaluated at the centre-channel LO only.
- The reviewer's 16-finding list (mixer, power-density, clock-jitter, angle-units) was not preserved in the transcript excerpts; the regressions below are taken from the tests.

## Review history
- Folded image: low-side LO below the IF (f_in 100 MHz, f_out 70 MHz, low side → f_LO 30 MHz) reported a negative image; now 40 MHz, and the image-band overlap warning still fires (100/99 MHz, 6 MHz band).
- Up-converter other-sideband note said "= 2·f_in" when the LO is below the input (140 MHz → 200 MHz, low side); now says 2·f_LO.
- Tuned up-converter shows the LO range low → high (989 MHz … 991 MHz); a negative LO is refused.
- Mode-switch harness: Direction switch from the defaults and from every example gave a red error → swap with plan kept; LO-side switch with the GPS example solving f_out was a red error → now solves the LO.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-23, reviewed and fixed the same day (folded image, other-sideband note, tuned LO range), mode-switch fixes (direction and LO side).
