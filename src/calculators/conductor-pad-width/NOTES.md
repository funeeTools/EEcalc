# Conductor to Pad Width — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/conductor-to-pad-width` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `diagram.ts`, `index.ts`, `tests/calc-conductor-pad-width.test.ts`

## Purpose and scope
Width of the trace where it joins an SMD/BGA land relative to the land: the ratio W/D against a guideline, the widest trace or smallest land (solve W_max or D_min), the neck-down length, the copper exposed in the mask opening, and the thermal balance of the two lands of a two-terminal part (trace, relief spokes, or a direct pour on the other land).

Not covered: the maximum pad diameter and channel arithmetic that the reference calculator calls by a similar name (see `pcb/maximum-pad-diameter`), current capacity of the neck, teardrops as a modelled shape.

## Model and why
- **No IPC number exists** (builder, 2026-11-25). No conductor-to-land ratio was found in IPC-7351B or IPC-2221B, so the limit is a labelled vendor guideline: TI AN-1112 §4.1, trace at an NSMD land at most 2/3 of the land diameter (same rule in a TI GaN datasheet); Microchip WLCSP guide: trace in the exposed area under 100 µm, 75 µm preferred. The limit is editable (rule select plus custom k).
- Exact geometry: copper exposed in an NSMD opening. Rectangular land A = min(W, D + 2e)·e; round land by circular-segment integrals (tests check the circle against a 20 000-point quadrature). SMD lands expose nothing.
- Neck length L_neck ≥ e + δ_reg (mask clearance plus registration): this page's geometric minimum, **not a published figure**; the theory and a note say so.
- Thermal balance: copper width leaving each land (trace W, n spokes of w, or the land perimeter in a pour). Flags above 1.5 : 1.

## Deliberate choices — ask before changing
- **Built the topic the coordinator described, not the reference calculator's page** (builder report, 2026-11-25): the reference calculator's "conductor to pad width" is a channel calculator, W_max = (P − D − (N+1)C)/N. Its features are covered in `max-pad-diameter`.
- The 1.5 : 1 balance flag and the ±50 % tolerance are labelled rules of thumb (AtlasPCB blog, 2026), not standards.
- A typed limit k moves a target that sits on the old limit (default page with k = 50 % gives W_max = 300 µm); a target the user chose (say 40 %) stays put (reviewer bug, fixed 2026-11-25).
- Switching land shape keeps the other terminal's connection, so rect → round → rect restores it (reviewer, §5a A→B→A).
- Microchip example uses e = 0.05 mm = (0.330 − 0.230)/2 from their Table 6-1 (reviewer).
- Defaults: rectangular NSMD land 0.6 × 0.5 mm, e = 0.05 mm, registration 0.05 mm, W = 0.4 mm, other terminal a 0.4 mm trace; solve W_max at the TI limit.
- Drawing: top view of both lands with neck, gold exposed strip, spokes or pour, PCB kit materials. Lands are spaced so the routing trace clears the other land's trace or pour by 0.25 mm, and the W and L_neck labels sit left of the trace (or above the taper when it is very wide). Traces rectangular until the etch-profile choice is made (§7b).

## Sources
- TI AN-1112 (SNVA009AI, 2019) §4.1 item 3: **verified in the PDF** by the builder.
- TI LMG3522R050 datasheet (SLUSEY6A, 2024): seen only as a search quote, not read.
- Microchip "SMT Guidelines and PCB Best Practices" (WLCSP) §6, Table 6-1: used for the example and checked by a test (0.230 mm land, 0.075 mm trace = 32.6 %).
- Suntron 0402 tombstoning paper (Reno 2011): the exposed-copper and equal-connection argument.
- AtlasPCB 2026 blog: 1.5 : 1 and ±50 % (weak, labelled).
- The Eurocircuits tombstoning guide (≥ 0.25 mm of equal width from the pad edge) was suggested by the reviewer as a better source for the neck rule; the builder did **not** verify or cite it.

## Known limits and open items
- Neck-length rule has no published source.
- Thermal balance is a width ratio at equal thickness and length only; it is not a thermal simulation.

## Review history
- Default (◎ W) → Limit = Custom → typed k = 50: the target stayed 66.7 % and W_max 400 µm while the status said TRACE TOO WIDE. Fixed.
- Rect (other = trace) → round → rect left `other = 'none'`, losing the thermal-balance section. Fixed.
- "wide-wr" (W_r = 3 mm): the routing trace overlapped the other land's trace (looked like a short); the L_neck label sat over the other land's opening. Fixed.

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: built 2026-11-25, reviewed and fixed 2026-11-25 (typed-limit target, connection kept on shape change, diagram spacing, Microchip e).
