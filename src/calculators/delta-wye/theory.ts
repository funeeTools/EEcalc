import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Delta–wye conversion — how this calculator works',
    lead:
      'Three branches connected in a triangle (delta, Δ, also drawn as a Π) and three arms meeting at a star point (wye, Y, also drawn as a T) can be made to look identical from their three terminals. This page converts either way, for resistors or for series R–L–C branches at one frequency, and checks the result by comparing the impedance between each pair of terminals.',
  },
  sections: [
    {
      title: 'The transformation',
      html: `<p>Label the terminals A, B and C. The delta has branches $Z_{AB}$, $Z_{BC}$, $Z_{CA}$ between them; the wye has arms $Z_A$, $Z_B$, $Z_C$ from each terminal to a common star point. Kennelly (1899) showed the two are equivalent when</p>
$$Z_A = \\frac{Z_{AB}Z_{CA}}{\\Sigma_\\Delta},\\quad Z_B = \\frac{Z_{AB}Z_{BC}}{\\Sigma_\\Delta},\\quad Z_C = \\frac{Z_{BC}Z_{CA}}{\\Sigma_\\Delta},\\qquad \\Sigma_\\Delta = Z_{AB}+Z_{BC}+Z_{CA}$$
<p>Each star arm is the product of the two delta branches that touch its terminal, over the sum of all three. The inverse is</p>
$$Z_{AB} = \\frac{\\Pi}{Z_C},\\quad Z_{BC} = \\frac{\\Pi}{Z_A},\\quad Z_{CA} = \\frac{\\Pi}{Z_B},\\qquad \\Pi = Z_AZ_B + Z_BZ_C + Z_CZ_A$$
<p>Each delta branch is the sum of the arm products over the arm <em>opposite</em> it. Both directions are exact: converting and converting back returns the original values.</p>`,
    },
    {
      title: 'Why it works, and the check on this page',
      html: `<p>Two three-terminal networks of linear parts are equivalent when they give the same impedance between every pair of terminals with the third one open. For terminals A and B:</p>
$$Z_A + Z_B = Z_{AB}\\parallel(Z_{BC}+Z_{CA}) = \\frac{Z_{AB}(Z_{BC}+Z_{CA})}{\\Sigma_\\Delta}$$
<p>Writing the same for B–C and C–A gives three linear equations in $Z_A$, $Z_B$, $Z_C$, whose solution is the formula above. The page computes these three terminal-pair impedances from both networks and shows them under <em>Check</em>; they must agree.</p>
<p>The equivalence holds only at the terminals. The currents and power inside the two networks are different, so a delta of resistors and its star do not heat the same way.</p>`,
    },
    {
      title: 'Balanced networks',
      html: `<p>With three equal branches the formulas reduce to</p>
$$Z_Y = \\frac{Z_\\Delta}{3},\\qquad Z_\\Delta = 3Z_Y$$
<p>This is the everyday case in three-phase power: a balanced delta-connected load of $12 + j9$ Ω per phase behaves like a star of $4 + j3$ Ω per phase, with the same power-factor angle (36.87°). The page marks a balanced network and shows this check.</p>`,
    },
    {
      title: 'Impedances at a frequency',
      html: `<p>Kirchhoff’s laws hold for phasors, so the same formulas apply to complex impedances. Each branch here is a series $R$, $L$ and $C$ with</p>
$$Z = R + j\\left(\\omega L - \\frac{1}{\\omega C}\\right),\\qquad \\omega = 2\\pi f$$
<p>Two cautions. First, the result is valid at the one frequency entered: the products and quotients of impedances usually have no fixed $R$, $L$, $C$ realisation that works at all frequencies. The graphs show how the equivalent moves with frequency. Second, mixing inductive and capacitive branches can give an equivalent with a <em>negative</em> real part. That is still a correct equivalent for network analysis, but it cannot be built from passive parts.</p>
<p>The conversion fails when $\\Sigma_\\Delta = 0$ (the delta loop is series-resonant) or when a star arm is zero (the star point coincides with a terminal, so the opposite delta branch would be infinite). The page says which.</p>`,
    },
    {
      title: 'Using it',
      html: `<ul>
<li><strong>Bridges.</strong> A Wheatstone bridge or any “non-series-parallel” network often becomes series-parallel after one Δ→Y step: convert one triangle, then combine what is left.</li>
<li><strong>Attenuators and matching.</strong> T and Π resistive pads are the same Y and Δ networks; the conversion moves a design from one form to the other.</li>
<li><strong>Three-phase loads.</strong> Convert a delta load to an equivalent star to work per phase with line-to-neutral voltages.</li>
<li><strong>Switching direction.</strong> Choosing the other direction, or clicking ◎ on a computed value, first writes the equivalent into the other side, so the network itself does not change. In impedance mode each branch is entered as its series equivalent at $f$ (R plus L or C). When a branch cannot be entered that way (a negative real part, or L or C beyond the box limits), or the other side has no equivalent to convert back (two zero star arms), the page stays on the present direction and says why.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>A. E. Kennelly, “Equivalence of triangles and three-pointed stars in conducting networks”, <em>Electrical World and Engineer</em>, vol. 34, pp. 413–414, 1899.</li>
<li>C. K. Alexander, M. N. O. Sadiku, <em>Fundamentals of Electric Circuits</em>, 6th ed., McGraw-Hill, 2017, §2.7 (wye-delta transformations), ch. 9 (impedance combinations) and ch. 12 (balanced three-phase loads).</li>
<li>P. Horowitz, W. Hill, <em>The Art of Electronics</em>, 3rd ed., Cambridge University Press, 2015, §1.2 (Thévenin equivalence of linear networks).</li>
</ul>`,
    },
  ],
};
