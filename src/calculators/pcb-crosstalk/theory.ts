import { STRIP_KB } from './model';
import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'PCB crosstalk — how this calculator works',
    lead:
      'When a signal edge travels down one trace (the aggressor), the mutual capacitance and mutual inductance to a neighbouring trace (the victim) inject noise into it. Part of that noise travels backwards to the victim’s near end (NEXT), part forwards with the edge to its far end (FEXT). This page computes both from the coupled-line inductance and capacitance matrices of the pair — microstrip or stripline — for a given spacing, height, coupled length and rise time, and finds the spacing or length that meets a crosstalk budget.',
  },
  sections: [
    {
      title: 'Coupling from L and C',
      html: `<p>Per unit length, each trace has a self inductance $L$ and capacitance $C$ (including the capacitance to its neighbour), and the pair shares a mutual inductance $L_m$ and mutual capacitance $C_m$. They follow from the even- and odd-mode impedances and permittivities of the pair:</p>
$$L_{e,o} = \\frac{Z_{0e,o}\\sqrt{\\varepsilon_{eff,e,o}}}{c},\\quad C_{e,o} = \\frac{\\sqrt{\\varepsilon_{eff,e,o}}}{c\\,Z_{0e,o}},\\quad L = \\frac{L_e+L_o}{2},\\ L_m = \\frac{L_e-L_o}{2},\\ C = \\frac{C_e+C_o}{2},\\ C_m = \\frac{C_o-C_e}{2}$$
<p>Microstrip modes come from the Kirschning–Jansen coupled-microstrip equations (with Jansen’s thickness rules), the same model as the Edge-coupled embedded microstrip page without a cover; stripline modes from Cohn’s exact coupled stripline with his thickness correction, the traces centred with height $H$ to each plane.</p>`,
    },
    {
      title: 'Near-end crosstalk (NEXT)',
      html: `<p>The backward-coupling coefficient (Hall &amp; Heck; Bogatin) is</p>
$$K_b = \\frac14\\left(\\frac{L_m}{L} + \\frac{C_m}{C}\\right)$$
<p>As the edge moves along the coupled section, it keeps sending backward noise to the near end for a time $2TD$, where $TD = \\ell\\,t_{pd}$ is the delay of the coupled length $\\ell$. If $2TD$ exceeds the rise time, the near-end noise reaches a plateau of $K_b$ — it <i>saturates</i> — and a longer run only makes it last longer. If the run is shorter, it never gets there:</p>
$$\\text{NEXT} = K_b\\cdot\\min\\!\\left(1,\\ \\frac{2TD}{t_r}\\right),\\qquad L_{sat} = \\frac{t_r}{2\\,t_{pd}}$$
<p>So NEXT depends on the spacing and height (through $K_b$) and only on the length up to $L_{sat}$ — a few centimetres for a 1 ns edge in FR-4.</p>`,
    },
    {
      title: 'Far-end crosstalk (FEXT)',
      html: `<p>The forward noise travels with the edge and accumulates over the whole run, as a pulse about one rise time wide arriving with the edge:</p>
$$\\text{FEXT} = \\frac12\\left(\\frac{C_m}{C} - \\frac{L_m}{L}\\right)\\frac{TD}{t_r}$$
<p>The capacitive and inductive parts have opposite signs. In a <b>stripline</b> in one homogeneous dielectric they are exactly equal ($L_m/L = C_m/C$, both modes travel at $c/\\sqrt{\\varepsilon_r}$), so FEXT is zero. On <b>microstrip</b> part of the field is in air, the inductive coupling wins, and FEXT is a negative pulse that grows linearly with length and with $1/t_r$ — the main crosstalk problem on long outer-layer buses. Solder mask or a dielectric cover reduces it. The linear formula holds while the arrival-time difference of the two modes stays below the rise time; beyond that the pulse widens and grows more slowly than the formula says. In the modal picture the far-end noise is half the difference of the even- and odd-mode edges, so it can never exceed half the swing (modes fully separated); the page caps FEXT there.</p>`,
    },
    {
      title: 'Rule of thumb',
      html: `<p>Johnson and Graham give a well-known shape for how crosstalk falls with distance over a plane,</p>
$$\\text{crosstalk} \\approx \\frac{K}{1 + (D/H)^2}$$
<p>with $D$ the centre-to-centre spacing, $H$ the height above the plane and $K < 1$ a constant depending on rise time and length. It is a <i>rule of thumb</i> for the trend — move traces apart by a few $H$ and the coupling drops fast — not a calculation; the page draws it, scaled to match at your spacing, in the Crosstalk vs spacing graph for comparison, and uses the L/C model for every number.</p>`,
    },
    {
      title: 'Accuracy',
      html: `<p>The formulas are the weak-coupling, matched-termination results: valid while $K_b$ is small (below about 0.1–0.15) and with both ends of the victim terminated in its characteristic impedance. For the microstrip coefficients the page was compared with a 2-D finite-volume field solution of the same cross-sections: $K_b$ within −3 … +12 % for $S < 2H$ and −9 … +51 % for wider gaps (where the absolute coupling is small and the model mostly overestimates it, the safe side), and $K_f$ within −3 … +27 %, over 160 random cross-sections ($W/H$ 0.2–5, $S/H$ 0.1–5, $T/H$ up to 0.4, $\\varepsilon_r$ 3–4.8). Stripline coefficients use Cohn’s exact zero-thickness result, which the field solution confirms (within ${STRIP_KB.zero[0]} … +${STRIP_KB.zero[1]} %), with his thickness correction. That correction reads the coupling <b>low</b> once the copper has thickness: over ${STRIP_KB.cases - 10} cross-sections with copper ($T/b$ up to 0.2), $K_b$ was ${STRIP_KB.wide[0]} … +${STRIP_KB.wide[1]} % of the field value for $W/b \\ge 0.15$ and ${STRIP_KB.narrow[0]} … ${STRIP_KB.narrow[1]} % for narrower traces — the unsafe side, so the page warns and you should keep margin in a stripline budget.</p>`,
    },
    {
      title: 'How solve-for works',
      html: `<p>Choose the unknown with ◎ and the metric (NEXT or FEXT) the budget applies to:</p>
<ul>
<li><b>Crosstalk</b> (analysis): NEXT and FEXT of the layout as entered.</li>
<li><b>Edge gap S</b>: the smallest gap that keeps the chosen crosstalk at the budget, found by Brent’s method on the same forward model. If the budget is met at any gap, or at none, the page says which.</li>
<li><b>Coupled length</b>: the longest parallel run within the budget, in closed form. For NEXT this exists only when the budget is below the saturated value $K_b$; otherwise any length is fine.</li>
</ul>
<p>The Tables tab lists the gap needed for budgets from 0.5 % to 10 %.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Move the traces closer to their plane: halving $H$ cuts coupling at a given gap roughly by the $(D/H)^2$ law above — often easier than widening the gap.</li>
<li>Route long parallel buses on inner layers (stripline) to remove FEXT; on outer layers keep parallel runs short or the edges slow.</li>
<li>NEXT saturates: once the run is longer than $L_{sat}$, shortening it does not help — spacing does.</li>
<li>The "3W rule" (centre-to-centre at least 3 trace widths) keeps NEXT on typical FR-4 microstrip to a few percent; check it here for your stack-up.</li>
<li>Guard traces help only if they are stitched to the plane with vias every fraction of a rise-time length; an unstitched guard can make things worse.</li>
<li>Several aggressors add: budget for the worst-case sum of both neighbours.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>S. H. Hall and H. L. Heck, <i>Advanced Signal Integrity for High-Speed Digital Designs</i>, Wiley–IEEE Press, 2009, ch. 4 (crosstalk; NEXT and FEXT from $L_m/L$ and $C_m/C$).</li>
<li>E. Bogatin, <i>Signal and Power Integrity — Simplified</i>, 2nd ed., Prentice Hall, 2009, ch. 10 (crosstalk; saturation length, FEXT and homogeneous stripline).</li>
<li>H. W. Johnson and M. Graham, <i>High-Speed Digital Design: A Handbook of Black Magic</i>, Prentice Hall, 1993 (crosstalk over a ground plane, $1/(1+(D/H)^2)$).</li>
<li>M. Kirschning and R. H. Jansen, “Accurate Wide-Range Design Equations for the Frequency-Dependent Characteristic of Parallel Coupled Microstrip Lines”, <i>IEEE Trans. MTT</i>, vol. 32, no. 1, pp. 83–90, 1984.</li>
<li>S. B. Cohn, “Shielded Coupled-Strip Transmission Line”, <i>IRE Trans. MTT</i>, vol. 3, no. 5, pp. 29–38, 1955.</li>
</ol>`,
    },
  ],
};
