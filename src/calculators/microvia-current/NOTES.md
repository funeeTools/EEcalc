# Microvia Current Capacity — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `pcb/microvia-current-capacity` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `diagram.ts`, `tests/calc-microvia-current.test.ts`

## Purpose and scope
Current for a temperature rise through N laser-drilled microvias (conformal-plated ring or copper-filled), the feeding trace's limit, and the IPC-T-50 / IPC-6012 geometry checks. Solve for I (analysis), the smallest whole N, the drill D (target end) or ΔT.

Not covered: stacked-via thermal coupling, fabricator-specific ratings, microvias as signal paths (see the other via pages).

## Model and why
**Hybrid model, chosen by the user on 2026-11-25** ("Hybrid, as proposed"; coordinator's option B plus A's figure as a labelled comparison). There is no published microvia ampacity model or data: IPC-2152 covers through-vias (its contents list Fig. A-11, which the builder could not read), Brooks & Adam's data are through-holes, and vendor articles give no numbers. So the page combines:
- **IPC-2221 guardrail**, labelled a convention and not a temperature prediction: barrel (ring A = π·t·(D − t), or filled A = π·D²/4) rated as a conductor of the same area on the IPC-2221A Fig. 6-4 fit, I = k·ΔT^0.44·A^0.725, at both k (0.048 external, 0.024 internal). N vias are rated by combined area, so capacity grows as N^0.725 (conservative).
- **Barrel conduction rise**: DC resistance ρ(T)·h/A, uniform heating, ends at the pads, ΔT = P_via·θ/8 (Incropera §3.5); K_Cu = 385.
- **Feeding trace rise**, rated on the same IPC-2221 fit as the Trace Width page; usually the real limit.
- **Geometry checks**: IPC-T-50 (2013 and later) microvia = blind, AR ≤ 1:1, depth ≤ 0.25 mm (older definition: hole ≤ 0.15 mm); capture and target pads larger than the hole; plating against the IPC-6012 blind/buried table (12 µm average, 10 µm minimum, Class 2).

## Deliberate choices — ask before changing
- **The hybrid model itself** (user, 2026-11-25). Do not replace it by option A or C without asking.
- **The feeding trace uses IPC-2221, not IPC-2152**, because the repo has no IPC-2152 model; a real 2152 figure needs a sourced fit (builder report, coordinator, 2026-11-25). The via guardrail defaults to the internal curve.
- A design current no N, D or ΔT in range meets shows the closest the range gets, in red, with the reason, never a red error from a ◎ click (§5a, builder).
- **The D solve is floored at h** so AR ≤ 1:1, with a note, and never goes red from the defaults (review fix 1).
- A pad smaller than the hole is its own warning ("pads smaller than hole"), not an error; the pads do not enter the current model (review fix 2).
- The status line names the worst problem in order: cannot be built or over capacity, then warnings (thin plating, J above 100 A/mm², "not a microvia"), else OK (review fix 3).
- 100 A/mm² is a **rule of thumb** for plated copper (electromigration, voids), labelled as not an IPC limit; unconfirmed.
- The "one-via" example reproduces the reference calculator's worked numbers (D 100 µm, t 18 µm, 75 µm deep, 10 °C: 7.187 mil², 276.2 mA; 2 vias 456.5 mA; 1 A needs 6) as a cross-check only; the reference calculator is not ground truth.
- Top view: a filled via-in-pad is drawn as a mask-open land, as in the section (coordinator edit, 2026-11-25). PCB material kit (user, 2026-11-24).

## Sources
- IPC-2221A §6.2 and Fig. 6-4 fit (shared with `trace-width-current`), Incropera §3.5, IEC 60028: as on the via pages.
- **Unconfirmed** (coordinator's closing list, 2026-11-25): IPC-6012 Class 3 microvia plating (the page quotes fabricators' reproductions of the Class 2 table and says to check Class 3), the exact IPC-T-50 revision letter, the 100 A/mm² figure. IPC-2226, IPC-2152 and Brooks & Adam are cited, not read here.

## Known limits and open items
- Capacity is a guardrail, not a measured rating; a fabricator's microvia table (option C) would be the better source if the user obtains one.
- The question "what does the reference calculator use" was answered in chat on 2026-11-25; the answer is not in the transcript excerpts.
- Stacked microvias: the theory says rate the narrowest one; thermal coupling between levels is not modelled.

## Review history
- Harness highs on ◎ D and ◎ ΔT (unreachable currents) → closest value in red with reason.
- D solve gave AR > 1:1 (the defaults' D solve) → floored at h.
- Pads smaller than the hole (260 µm drill, solve for N): the solved N was labelled "closest" (failure tone) → its own warning.
- Status did not name thin plating (t = 8 µm), J > 100 A/mm² (ΔT 100 °C, t 18 µm, 0.5 A), or a via deeper than wide (h 0.3 mm, d 0.35 mm) → named.
- Mode-switch low: D in inches reads 0.00098 in (no smaller prefix).

## Changelog
- 0.1.0 (2026-11-26) — first numbered version. Before that: stopped 2026-11-25 for lack of a sourced model; hybrid chosen by the user 2026-11-25; built, reviewed and fixed 2026-11-25.
