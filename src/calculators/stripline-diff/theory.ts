import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Edge-coupled stripline — how this calculator works',
    lead:
      'Two traces side by side, centred between two ground planes, carry a differential signal as the odd mode of a coupled line. Because the dielectric fills the whole cross-section the line is pure TEM: both modes travel at $c/\\sqrt{\\varepsilon_r}$ and the impedances follow from electrostatics alone. This page uses Cohn’s exact conformal-mapping solution for infinitely thin traces, with his fringing-capacitance correction for real copper thickness, and solves for the width, the gap or the plane spacing that gives a target differential impedance.',
  },
  sections: [
    {
      title: 'Even and odd modes',
      html: `<p>Any signal on the pair splits into an <em>odd</em> mode (equal and opposite voltages, the differential signal) and an <em>even</em> mode (equal voltages, the common-mode signal). Each mode has its own characteristic impedance, $Z_{0o}$ and $Z_{0e}$. The impedances that interfaces specify are</p>
$$Z_{diff} = 2Z_{0o},\\qquad Z_{cm} = \\tfrac12 Z_{0e}$$
$$k = \\frac{Z_{0e}-Z_{0o}}{Z_{0e}+Z_{0o}}$$
<p>$Z_{diff}$ is what a differential receiver termination sees; $Z_{cm}$ is the impedance to both traces driven together against the planes; $k$ is the voltage coupling coefficient (the backward-coupling level of the pair used as a directional coupler). Without its partner, each trace would have the single-stripline impedance $Z_0$, which lies between $Z_{0o}$ and $Z_{0e}$.</p>`,
    },
    {
      title: 'Zero thickness: Cohn’s exact solution',
      html: `<p>For infinitely thin traces of width $W$, edge gap $S$ and plane spacing $b$, Cohn (1955) mapped the half-section conformally onto a parallel-plate capacitor. The result is exact:</p>
$$Z_{0e,0o} = \\frac{\\eta_0}{4\\sqrt{\\varepsilon_r}}\\,\\frac{K(k_{e,o}')}{K(k_{e,o})}$$
<p>with $k' = \\sqrt{1-k^2}$ and</p>
$$k_e = \\tanh\\frac{\\pi W}{2b}\\,\\tanh\\frac{\\pi(W+S)}{2b}$$
$$k_o = \\tanh\\frac{\\pi W}{2b}\\,\\coth\\frac{\\pi(W+S)}{2b}$$
<p>$K$ is the complete elliptic integral of the first kind, evaluated here with the arithmetic–geometric mean, $K(k) = \\pi/\\big(2\\,\\mathrm{AGM}(1,k')\\big)$, which converges to machine precision in a few steps. The complementary moduli are computed from closed forms in $e^{-\\pi W/b}$ so that wide traces ($k\\to1$) keep full precision. As $S\\to\\infty$ both moduli tend to $\\tanh(\\pi W/2b)$ and the two modes merge into the single stripline, $Z_0 = \\frac{\\eta_0}{4\\sqrt{\\varepsilon_r}}K(\\operatorname{sech}\\tfrac{\\pi W}{2b})/K(\\tanh\\tfrac{\\pi W}{2b})$.</p>`,
    },
    {
      title: 'Copper thickness: Cohn’s correction',
      html: `<p>Real traces are 17–35 µm thick, a noticeable fraction of a 0.3–0.6 mm plane spacing. Cohn handled thickness with capacitances normalised to the permittivity, $C/\\varepsilon = \\eta_0/(\\sqrt{\\varepsilon_r}Z)$. The fringing capacitance of one edge to one plane is (Cohn 1954)</p>
$$\\frac{C_f'(t)}{\\varepsilon} = \\frac{2y\\ln(y+1) - (y-1)\\ln(y^2-1)}{\\pi}$$
<p>with $y = 1/(1-t/b)$; for $t = 0$ it is $2\\ln2/\\pi$.</p>
<p>With $C_s(t)$ the thick single strip (Wheeler 1978) and $r = C_f'(t)/C_f'(0)$, the coupled capacitances are (Cohn 1955, eqs. 18, 20, 22)</p>
$$C_e = C_s(t) - r\\,\\big[C_s(0) - C_e(0)\\big]$$
<p>and for the odd mode, when $S \\ge 5t$ and when $S < 5t$:</p>
$$C_o = C_s(t) + r\\,\\big[C_o(0) - C_s(0)\\big]$$
$$C_o = C_o(0) + \\Delta C_s - 2\\,\\Delta C_f'/\\varepsilon + \\frac{2t}{S}$$
<p>where $\\Delta C_s = C_s(t)-C_s(0)$ and $\\Delta C_f' = C_f'(t)-C_f'(0)$. The idea: the partner trace changes the inner-edge fringing by the same fraction as for thin traces, scaled up by the thicker edge; when the gap is narrow, the side walls of the two traces also form a parallel-plate capacitor $\\varepsilon t/(S/2)$ to the odd-mode symmetry plane. Wheeler’s formula is used for both $C_s(t)$ and $C_s(0)$, so its own small error cancels and the result reduces exactly to the zero-thickness solution at $t = 0$. The single-trace $Z_0$ shown is the $S\\to\\infty$ limit of the same equations.</p>
<p>Some implementations (wcalc, KiCad) write eq. (22) with $\\varepsilon_r$ inside the fringing term and $\\eta_0$ outside; that mixes dielectric and air quantities and is only correct for $\\varepsilon_r = 1$. In the normalised form above every term carries the same $\\sqrt{\\varepsilon_r}/\\eta_0$.</p>`,
    },
    {
      title: 'Accuracy',
      html: `<p>The zero-thickness result is exact. The thickness correction is an approximation, and its error was measured against a 2-D finite-difference solution of Laplace’s equation (sparse direct solve on three grids with Richardson extrapolation; it reproduces the exact $t=0$ case and the thick isolated strip to 0.3 %). The grid covered 140 cross-sections: $t/b$ = 0.05, 0.1, 0.15, 0.2; $W/b$ = 0.15–1; $S$ = 1.5$t$–12$t$. The table gives the measured range of (this page − field solution)/field solution:</p>
<table class="kv" style="max-width:640px">
<tr><th></th><th>$S<5t$</th><th>$5t\\le S<8t$</th><th>$S\\ge 8t$</th></tr>
<tr><td>$W/(b-t)\\ge0.35$, $Z_{diff}$</td><td>−1.0 … +2.8 %</td><td>−0.1 … +3.5 %</td><td>−0.3 … +1.7 %</td></tr>
<tr><td>$W/(b-t)\\ge0.35$, $Z_{cm}$</td><td>−2.8 … −0.3 %</td><td>−1.1 … −0.4 %</td><td>−0.8 … −0.1 %</td></tr>
<tr><td>$W/(b-t)<0.35$, $Z_{diff}$</td><td>−0.5 … +3.9 %</td><td>+0.3 … +5.7 %</td><td>−0.1 … +2.9 %</td></tr>
<tr><td>$W/(b-t)<0.35$, $Z_{cm}$</td><td>−5.9 … −0.9 %</td><td>−2.9 … −0.4 %</td><td>−2.0 … 0 %</td></tr>
</table>
<ul>
<li>$Z_{diff}$ usually reads high, worst just above $S = 5t$, where eq. (20) ignores the side-wall coupling; it can also read slightly low. $Z_{cm}$ always reads low, worst for narrow traces with a tight gap (−5.9 % at W/b = 0.15).</li>
<li>The results show each band, widened outward to the next 0.5 %, beside $Z_{diff}$ and $Z_{cm}$, and the page warns when it exceeds ±2.5 %. Errors shrink towards $t = 0$.</li>
<li>Copper thicker than $t/b = 0.2$ is refused: it is outside the checked range, and the thin-strip correction gives meaningless results as $t\\to b$. Traces narrower than $W/b = 0.15$ get a warning that the error is unknown.</li>
<li>At $S = 5t$ the two odd-mode formulas do not meet, so $Z_{diff}$ jumps by a few percent there. When you solve for $S$ and the target falls inside that jump, the page says so.</li>
</ul>
<p>For a tolerance tighter than these bands, or with resin-rich layers and trapezoidal etch, use a 2-D field solver with the fabricator’s stack-up.</p>`,
    },
    {
      title: 'Solving for W, S or b',
      html: `<p>Only one set of forward equations is used. To solve for a dimension, the page scans $Z_{diff}(x)$ over $10^{-4}b$ to $100b$, limited to the 1 µm–50 mm range of the input fields (log-spaced), brackets every sign change of $Z_{diff}(x) - Z_{target}$ and polishes it with Brent’s method. A bracket is accepted only if the root reproduces the target to $10^{-9}$, which rejects the step at $S = 5t$. Feeding the solved value back in reproduces the target exactly.</p>
<p>$Z_{diff}$ falls as $W$ grows and rises with $S$ and $b$. With growing $S$ it approaches $2Z_0$ of a single trace, which it cannot exceed: if the target is above that, narrow the traces or open the plane spacing instead.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Use the real Dk.</strong> Stripline sits in prepreg and core whose Dk differ (glass/resin ratio). Use the fabricator’s value at your frequency; the impedance scales as $1/\\sqrt{\\varepsilon_r}$, so a 10 % Dk error is a 5 % impedance error.</li>
<li><strong>Tight or loose coupling.</strong> Tight coupling ($S \\lesssim W$) makes $Z_{diff}$ depend on the gap and gives better noise immunity and less radiation; loose coupling makes it depend on the width. Both work if the impedance is controlled.</li>
<li><strong>No far-end crosstalk.</strong> Because both modes travel at the same speed in a homogeneous dielectric, stripline has no far-end crosstalk and no mode conversion from the cross-section; microstrip has both.</li>
<li><strong>Keep the trace centred.</strong> An off-centre layer (asymmetric stripline) has lower impedance than the centred formula gives.</li>
<li><strong>Parallel-plate modes.</strong> Above $f = c/(2b\\sqrt{\\varepsilon_r})$ the planes can guide a parallel-plate mode; stitch them with ground vias.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. B. Cohn, “Shielded Coupled-Strip Transmission Line,” <em>IRE Trans. Microwave Theory Tech.</em>, vol. MTT-3, no. 5, pp. 29–38, Oct. 1955.</li>
<li>S. B. Cohn, “Characteristic Impedance of the Shielded-Strip Transmission Line,” <em>IRE Trans. Microwave Theory Tech.</em>, vol. MTT-2, pp. 52–57, July 1954.</li>
<li>H. A. Wheeler, “Transmission-Line Properties of a Strip Line Between Parallel Planes,” <em>IEEE Trans. Microwave Theory Tech.</em>, vol. MTT-26, no. 11, pp. 866–876, Nov. 1978.</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §4.6 (edge-coupled stripline).</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §3.7 (stripline) and §7.6 (coupled lines, even/odd modes).</li>
<li>B. C. Carlson, “Numerical computation of real or complex elliptic integrals,” <em>Numerical Algorithms</em> 10, 1995 (used for the independent check of $K$).</li>
</ul>`,
    },
  ],
};
