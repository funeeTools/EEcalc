# Current Divider — design notes

<!-- Read this before changing the calculator. Update it whenever you make a design choice.
     Version: the calculator's `version` in def.ts (SemVer: MAJOR.MINOR.PATCH). -->

**Id:** `general/current-divider` · **Version:** 0.1.0 · **Files:** `model.ts`, `def.ts`, `theory.ts`, `index.ts`, `tests/calc-current-divider.test.ts` (drawing: `series-parallel/diagram.ts`)

## Purpose and scope
1–8 resistive branches in parallel, fed by an ideal current source or by a voltage source through R_s. The page gives branch currents, shares and powers, and solves one branch R for a target share or a target current. It is kept distinct from the voltage-divider page: N branches, current drive, source loading. AC/complex branches are left out.

## Model and why
- I_j = V·G_j, with V = I/ΣG (current source) or V = V_s/(1 + R_s·ΣG) (voltage source). Shares G_j/ΣG do not depend on the source.
- Branch k is solved in closed form, with G_o the conductance of the other branches:
  - share s: G_k = G_o·s/(1−s)
  - current, current source: G_k = I_k·G_o/(I − I_k)
  - current, voltage source: G_k = I_k(1 + R_s·G_o)/(V − I_k·R_s)
- These forms were checked against a nodal solve in Python.

## Deliberate choices — ask before changing
- **Solve modes:** `out` (analysis), `rkShare`, `rkCurrent`; `solveIdx` is the watched or solved branch.
  - The share and I_k boxes belong to the watched branch. In analysis both are green.
  - ◎ on one of them makes it the target; ◎ on the other target box returns to analysis.
- **Targets do not carry over (§5a, reviewer).** ◎ on a different branch first seeds share and I_k from that branch's present values (`seedTargets`), so the solve returns its present R. Before this fix, it applied branch 1's target to branch 4 (a high harness flag).
- **A single branch** cannot take a share target; with a current source it cannot take a current target either. `solvableMode` makes that ◎ a no-op, `sync` falls back to analysis, and a note explains why.
- **Switching the source type returns to analysis** when the target was a current (its meaning changes).
- **Harness flags kept as legitimate.** The "error-after-edit" flags (about 11) are typed sources, targets or R_s (×10, min, max) that no positive R_k can meet: a share ≥ 100 %, I_k > I, or I_k > V/R_s. The messages state the limit. A comment in def.ts explains this.
- **Branch current |I_k| ≤ 100 kA** (the box range). A near-short branch on a stiff source fails with a message rather than tripping the core guard.
- **Warnings:** current-source compliance above 50 V (an arbitrary but realistic bench limit), and no 2512 chip at 2× margin.
- **Graph colours:** the swept branch is amber. The others avoid target green and limit red (reviewer).
- **Departures from the reference calculator.** The reference calculator has 2 resistors and a current source only. This page adds N branches, a voltage source with R_s, solving, E-series rounding and chip checks. The reference calculator's 1 A into 1 kΩ ∥ 2 kΩ default (667 V, 444 W) is kept only as the `compliance` warning example.
- **Defaults:** 10 mA into 1 k ∥ 2.2 k ∥ 4.7 k, watching branch 1.

## Sources
- Alexander & Sadiku 6e §2.6 (current division) and §2.9 (ammeter shunts); Horowitz & Hill §1.2.2. From memory.
- Ammeter example R_sh = R_m·I_m/(I − I_m): a 1 mA / 1 kΩ movement on a 1 A range needs 1.001 Ω. This is the standard formula; I did not verify a specific textbook example number.
- Copper TCR +0.39 %/K (theory note): standard handbook value, from memory.

## Known limits and open items
- Resistive branches only; complex branch admittances are mentioned in the theory only.
- The target always refers to the solved branch's own current. "Set R_j so that branch k gets X" is not supported.
- No branch tolerance analysis.

## Review history
- ◎ on another branch reused the old target: after adding two branches and clicking ◎ on #3, the page showed "R₃ would have to be 501 nΩ" (fixed with `seedTargets`; regression test added).
- ◎ on the only branch while it was solving gave the error "With a single branch…" (fixed: no-op plus a note).
- The theory said coil and shunt drift "in opposite directions"; reworded to "drift apart" (reviewer).
- The palette included the target green and limit red (fixed).

## Changelog
- 0.1.0 (2026-11-26) — first release: N-branch current division with current or voltage(+R_s) drive, solve a branch R for a share or current.
