import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'The Smith chart, reflection and L-network matching',
    lead:
      'The Smith chart is a plot of the reflection coefficient $\\Gamma$ in the complex plane, overlaid with the grid of impedances that produce each $\\Gamma$. Because moving along a lossless line only rotates $\\Gamma$, and adding a series reactance or shunt susceptance moves along a circle of the grid, matching problems become geometry. This page computes every quantity exactly and draws the same steps you would draw by hand.',
  },
  sections: [
    {
      title: 'Reflection coefficient and the chart',
      html: `<p>For a load $Z_L$ on a line (or instrument) with real reference impedance $Z_0$:</p>
$$\\Gamma = \\frac{Z_L - Z_0}{Z_L + Z_0} = \\frac{z - 1}{z + 1},\\qquad z = \\frac{Z_L}{Z_0} = r + jx$$
<p>Curves of constant $r$ map to circles centred at $\\left(\\frac{r}{1+r}, 0\\right)$ with radius $\\frac{1}{1+r}$; constant $x$ maps to circles centred at $(1, 1/x)$ with radius $1/|x|$. The centre is a perfect match, the rim $|\\Gamma| = 1$ is lossless (pure reactance), the right end is an open, the left end a short. The upper half is inductive, the lower half capacitive. The orange grid is the same chart for admittance $y = 1/z$, rotated 180°.</p>`,
    },
    {
      title: 'VSWR, return loss and mismatch loss',
      html: `<p>All three depend only on $|\\Gamma|$:</p>
$$\\text{VSWR} = \\frac{1+|\\Gamma|}{1-|\\Gamma|},\\qquad RL = -20\\log_{10}|\\Gamma|,\\qquad ML = -10\\log_{10}\\left(1-|\\Gamma|^2\\right)$$
<p>Return loss is a positive number of dB (a "return loss of −20 dB" is a sign slip; $S_{11} = -20$ dB is the same statement). Mismatch loss is the drop in delivered power relative to the power a matched load would receive from the same source: VSWR 2 reflects 11 % of the incident power, a mismatch loss of 0.51 dB. A constant-VSWR circle is drawn through the load.</p>`,
    },
    {
      title: 'Moving along a transmission line',
      html: `<p>A lossless line of impedance $Z_\\ell$ and electrical length $\\theta = \\beta\\ell$ transforms the load to</p>
$$Z_{in} = Z_\\ell\\,\\frac{Z_L + jZ_\\ell\\tan\\theta}{Z_\\ell + jZ_L\\tan\\theta}$$
<p>When $Z_\\ell = Z_0$ this is a clockwise rotation of $\\Gamma$ by $2\\theta$ about the centre ("towards the generator"), so a half wavelength (180°) brings you back to the load. With $Z_\\ell \\neq Z_0$ the path is still a circle but not centred on the chart; at $\\theta = 90°$ it becomes the quarter-wave transformer $Z_{in} = Z_\\ell^2/Z_L$. Lines here are lossless and non-dispersive; enter the electrical length at the design frequency (physical length × 360° / guided wavelength).</p>`,
    },
    {
      title: 'L-section matching',
      html: `<p>Two reactive elements can match any load with $R > 0$ to $Z_0$ at one frequency. If $r > 1$ (inside the $r = 1$ circle) only the shunt-at-load form works; if $g > 1$ (inside the $g = 1$ circle) only the series-at-load form works; otherwise both do. With $Z_L = R_L + jX_L$ (Pozar §5.1):</p>
<p><em>Shunt element at the load</em> (needs $R_L^2 + X_L^2 \\ge Z_0R_L$):</p>
$$B = \\frac{X_L \\pm\\sqrt{R_L/Z_0}\\sqrt{R_L^2+X_L^2-Z_0R_L}}{R_L^2+X_L^2},\\qquad X = \\frac{1}{B} + \\frac{X_LZ_0}{R_L} - \\frac{Z_0}{BR_L}$$
<p><em>Series element at the load</em> (needs $R_L \\le Z_0$):</p>
$$X = \\pm\\sqrt{R_L(Z_0-R_L)} - X_L,\\qquad B = \\pm\\frac{\\sqrt{(Z_0-R_L)/R_L}}{Z_0}$$
<p>Positive $X$ is an inductor $L = X/\\omega$, negative a capacitor $C = -1/(\\omega X)$; positive $B$ is a capacitor $C = B/\\omega$, negative an inductor $L = -1/(\\omega B)$. Every solution is listed in the Tables tab with a check that it really brings $|\\Gamma_{in}|$ to zero.</p>`,
    },
    {
      title: 'Choosing between solutions',
      html: `<ul><li><strong>Bandwidth.</strong> The solution whose path stays closer to the real axis (lower node Q) is broader. Compare the curves in the Match bandwidth graph.</li>
<li><strong>DC path and harmonics.</strong> A series C blocks DC; a shunt L provides a DC return; a low-pass form (series L, shunt C) also attenuates harmonics of a transmitter.</li>
<li><strong>Realisable values.</strong> Very small capacitors (< 0.5 pF) or inductors (< 1 nH) are dominated by parasitics; pick the other solution or add a line section.</li>
<li><strong>Wider bandwidth</strong> needs more sections (multi-section L, or a Chebyshev transformer) — the Bode–Fano limit bounds what any network can do for a given load Q.</li></ul>`,
    },
    {
      title: 'References',
      html: `<ul><li>P. H. Smith, "Transmission Line Calculator," <em>Electronics</em>, Jan. 1939.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., §2.3–2.5 and §5.1.</li>
<li>Keysight Application Note 5965-7917E, <em>Understanding the Fundamental Principles of Vector Network Analysis</em>.</li></ul>`,
    },
  ],
};
