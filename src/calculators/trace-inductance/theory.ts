import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'PCB trace inductance — how this calculator works',
    lead:
      'Inductance belongs to a current loop, not to a piece of wire. A straight trace on its own has a <em>partial</em> self-inductance — its share of whatever loop it ends up in — which this page computes exactly for a rectangular cross-section. When the trace runs over a ground plane, the return current flows in the plane right underneath and the loop is closed and small; then the page gives the loop inductance from the microstrip line equations.',
  },
  sections: [
    {
      title: 'Partial self-inductance of a straight bar',
      html: `<p>Two parallel filaments of length $\\ell$ a distance $\\rho$ apart have the mutual inductance (Neumann’s integral, worked out by Rosa and Grover)</p>
$$M(\\rho) = \\frac{\\mu_0}{2\\pi}\\left[\\ell\\,\\operatorname{asinh}\\frac{\\ell}{\\rho} - \\sqrt{\\ell^2+\\rho^2} + \\rho\\right].$$
<p>A bar of width $W$ and thickness $T$ carrying uniform current is a bundle of such filaments, and its self-inductance is $M$ averaged over every pair of points in the cross-section (Ruehli’s partial inductance). Writing $\\ell\\operatorname{asinh}(\\ell/\\rho) = \\ell\\ln(2\\ell/\\rho) + \\ell\\ln\\frac{1+\\sqrt{1+\\rho^2/\\ell^2}}{2}$ splits the average into three parts:</p>
$$L = \\frac{\\mu_0}{2\\pi}\\Big[\\ell\\ln\\frac{2\\ell}{R_g} - \\ell + \\bar\\rho + \\ell\\,\\langle g\\rangle\\Big]$$
<ul>
<li>$R_g$ is the geometric mean distance of the rectangle from itself (Maxwell, exact): $\\ln R_g = \\ln\\sqrt{W^2+T^2} - \\frac{W^2}{12T^2}\\ln\\!\\left(1+\\frac{T^2}{W^2}\\right) - \\frac{T^2}{12W^2}\\ln\\!\\left(1+\\frac{W^2}{T^2}\\right) + \\frac{2W}{3T}\\arctan\\frac{T}{W} + \\frac{2T}{3W}\\arctan\\frac{W}{T} - \\frac{25}{12}$; for a thin strip $R_g \\to 0.2235\\,W$.</li>
<li>$\\bar\\rho$ is the mean distance between two points of the rectangle (exact closed form; $W/3$ for a thin strip).</li>
<li>$\\langle g\\rangle$ is the average of a smooth function of $\\rho^2/\\ell^2$ that vanishes for long traces; the page integrates it with Gauss–Legendre quadrature over the triangular distribution of point offsets.</li>
</ul>
<p>The result equals the Hoer–Love closed form for rectangular bars to about 12 digits (that formula is exact too, but it subtracts huge terms and loses all precision in double arithmetic for a long thin trace). For $\\ell \\gg W+T$ it reduces to Grover’s well-known approximation</p>
$$L \\approx \\frac{\\mu_0\\ell}{2\\pi}\\left[\\ln\\frac{2\\ell}{W+T} + \\frac12 + 0.2235\\,\\frac{W+T}{\\ell}\\right],$$
<p>shown for comparison. Note the logarithm: doubling the width removes only a little inductance, while doubling the length more than doubles it. That is why “1 nH per mm” is a usable figure for thin traces.</p>`,
    },
    {
      title: 'Loop inductance over a ground plane',
      html: `<p>Over a plane, the trace and its image return current form a transmission line. Its inductance per length follows from the impedance and the effective permittivity, $L' = Z_0\\sqrt{\\varepsilon_{eff}}/c$. Since $Z_0\\sqrt{\\varepsilon_{eff}}$ is the impedance the same line would have in air, $L'$ does not depend on the laminate at all:</p>
$$L' = \\frac{Z_{0,air}(u_1)}{c},\\qquad L_{loop} = L'\\,\\ell$$
<p>with Hammerstad and Jensen’s $Z_{0,air}$ and copper-thickness correction $u_1 = W/H + \\Delta u_1$ (better than 0.2 % for $0.01 \\le W/H \\le 100$). Two classic simpler forms are shown alongside: Hammerstad’s 1975 pair, $L' = \\frac{\\mu_0}{2\\pi}\\ln\\left(\\frac{8H}{W} + \\frac{W}{4H}\\right)$ for $W \\le H$ and $L' = \\mu_0/[W/H + 1.393 + 0.667\\ln(W/H + 1.444)]$ for $W \\ge H$ (about ±1 %, zero thickness), and the parallel-plate limit $\\mu_0 H/W$, which ignores fringing and is only right for $W \\gg H$.</p>
<p>This is the inductance with the return current on the plane surface facing the trace, which is where it flows above a few hundred kHz. It leaves out the vertical parts of the loop — the vias or pads where current goes down to the plane — which add roughly 0.5–1 nH each for a 1.6 mm board and dominate when the trace is shorter than a few board thicknesses.</p>`,
    },
    {
      title: 'Solving for length or width',
      html: `<p>Click ◎ on the length to find the longest trace whose inductance stays below the value in the $L$ box, or on the width for the width that gives exactly that inductance. The page inverts the same forward equations with a bracketed Brent search, so feeding the answer back reproduces the target. Over a plane the length is simply $L/L'$.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><b>What to compare.</b> The partial inductance of an isolated trace is useful for building up a loop from segments (a gate-drive path, a decoupling loop drawn on paper) and for comparing layouts. The number that sets ringing and ground bounce is the loop inductance — keep the return path close.</li>
<li><b>A plane beats a wider trace.</b> A 20 mm, 0.5 mm wide trace has about 19 nH on its own; over a plane 0.2 mm below, its loop inductance falls to about 5 nH. Making the isolated trace ten times wider (5 mm) only brings it to about 10.6 nH, still twice the loop over the plane.</li>
<li><b>Frequency.</b> The isolated-trace value assumes uniform current (DC and low frequency). At high frequency the current crowds to the edges and the internal inductance disappears, lowering $L$ by a few percent. The over-plane value already assumes high-frequency current distribution.</li>
<li><b>Reactance</b> $X_L = 2\\pi f L$ is the impedance the inductance adds at the frequency entered: 10 nH is 6.3 Ω at 100 MHz.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>A. E. Ruehli, “Inductance calculations in a complex integrated circuit environment”, <i>IBM J. Res. Dev.</i> 16(5), 1972, pp. 470–481.</li>
<li>C. Hoer and C. Love, “Exact inductance equations for rectangular conductors with applications to more complicated geometries”, <i>J. Res. NBS</i> 69C(2), 1965, pp. 127–137.</li>
<li>F. W. Grover, <i>Inductance Calculations</i>, Van Nostrand, 1946 (Dover reprint), ch. 3 (straight conductors, geometric mean distances).</li>
<li>E. B. Rosa, “The self and mutual inductances of linear conductors”, <i>Bull. Bureau of Standards</i> 4(2), 1908, pp. 301–344.</li>
<li>E. O. Hammerstad and Ø. Jensen, “Accurate models for microstrip computer-aided design”, IEEE MTT-S Int. Microwave Symp. Digest, 1980, pp. 407–409.</li>
<li>E. O. Hammerstad, “Equations for microstrip circuit design”, Proc. 5th European Microwave Conf., 1975, pp. 268–272.</li>
<li>B. Ghosh, “Random distances within a rectangle and between two rectangles”, <i>Bull. Calcutta Math. Soc.</i> 43, 1951, pp. 17–24 (mean distance).</li>
</ol>`,
    },
  ],
};
