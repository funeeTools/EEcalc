import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Microstrip lines — how this calculator works',
    lead:
      'A microstrip is a copper strip on top of a dielectric with a ground plane underneath. Part of its field runs in the substrate and part in the air above, so it is not a pure TEM line: the wave sees an <em>effective</em> permittivity $\\varepsilon_{eff}$ between 1 and $\\varepsilon_r$. There is no exact closed-form solution, so practical design uses curve fits to rigorous numerical results. This page uses the Hammerstad–Jensen fits, which most microwave CAD tools use for quasi-static microstrip.',
  },
  sections: [
    {
      title: 'Static impedance (Hammerstad–Jensen)',
      html: `<p>With $u = W/H$, the impedance of a zero-thickness strip in air is</p>
$$Z_{0,air}(u) = \\frac{\\eta_0}{2\\pi}\\ln\\!\\left[\\frac{f(u)}{u} + \\sqrt{1+\\left(\\frac{2}{u}\\right)^2}\\right],\\qquad f(u) = 6 + (2\\pi-6)\\,e^{-(30.666/u)^{0.7528}}$$
<p>where $\\eta_0 = \\mu_0 c \\approx 376.73\\ \\Omega$. The dielectric enters through the effective permittivity</p>
$$\\varepsilon_{eff} = \\frac{\\varepsilon_r+1}{2} + \\frac{\\varepsilon_r-1}{2}\\left(1+\\frac{10}{u}\\right)^{-a(u)\\,b(\\varepsilon_r)}$$
$$a(u) = 1 + \\tfrac{1}{49}\\ln\\frac{u^4 + (u/52)^2}{u^4 + 0.432} + \\tfrac{1}{18.7}\\ln\\!\\left[1+\\left(\\frac{u}{18.1}\\right)^3\\right],\\quad b(\\varepsilon_r) = 0.564\\left(\\frac{\\varepsilon_r-0.9}{\\varepsilon_r+3}\\right)^{0.053}$$
<p>and $Z_0 = Z_{0,air}/\\sqrt{\\varepsilon_{eff}}$. Hammerstad and Jensen quote better than 0.01 % for $Z_{0,air}$ with $u \\le 1$ (0.03 % up to $u = 1000$), and 0.2 % for $\\varepsilon_{eff}$ over $0.01 \\le u \\le 100$, $\\varepsilon_r \\le 128$ — relative to the numerical reference they fitted. Real-world error is dominated by how well you know $\\varepsilon_r$, $H$ and the etched width.</p>`,
    },
    {
      title: 'Copper thickness',
      html: `<p>A strip of thickness $T$ behaves like a slightly wider thin strip. With $t = T/H$ the width correction in air is</p>
$$\\Delta u_1 = \\frac{t}{\\pi}\\ln\\!\\left[1 + \\frac{4e}{t\\,\\coth^2\\sqrt{6.517\\,u}}\\right],\\qquad \\Delta u_r = \\tfrac12\\left[1+\\operatorname{sech}\\sqrt{\\varepsilon_r-1}\\right]\\Delta u_1$$
<p>giving $u_1 = u + \\Delta u_1$ and $u_r = u + \\Delta u_r$. Then $Z_0 = Z_{0,air}(u_r)/\\sqrt{\\varepsilon_{eff}(u_r)}$ and $\\varepsilon_{eff} = \\varepsilon_{eff}(u_r)\\,[Z_{0,air}(u_1)/Z_{0,air}(u_r)]^2$. Thicker copper lowers $Z_0$: for a 50 Ω line on 0.2 mm prepreg, going from ½ oz to 2 oz copper changes $Z_0$ by roughly 2–3 Ω. The correction assumes a rectangular cross-section; real etched traces are trapezoidal, narrower on top.</p>`,
    },
    {
      title: 'Dispersion',
      html: `<p>As frequency rises, more of the field concentrates in the substrate and $\\varepsilon_{eff}$ climbs towards $\\varepsilon_r$. Kirschning and Jansen fitted this with</p>
$$\\varepsilon_{eff}(f) = \\varepsilon_r - \\frac{\\varepsilon_r - \\varepsilon_{eff}(0)}{1+P(f)}$$
<p>where $P$ is a function of $u$, $\\varepsilon_r$ and the normalised frequency $f_n = f\\cdot H$ in GHz·mm (accuracy ~0.6 % for $0.1 \\le u \\le 100$, $1 \\le \\varepsilon_r \\le 20$, $H/\\lambda_0 \\le 0.13$). On a 1.6 mm FR-4 board the shift is a few percent by 5 GHz; on thin RF laminates it is small below ~10 GHz. Wavelength, delay and loss on this page use $\\varepsilon_{eff}(f)$; $Z_0$ is quoted at its static value.</p>
<p>Above roughly $f_{TE1} = c / (4H\\sqrt{\\varepsilon_r - 1})$ the substrate supports a strongly coupled surface wave and the quasi-TEM picture breaks down — the calculator warns you.</p>`,
    },
    {
      title: 'Loss',
      html: `<p><strong>Dielectric loss</strong> (first-order, filling-factor form) weights $\\tan\\delta$ by the fraction of field in the substrate:</p>
$$\\alpha_d = \\frac{k_0\\,\\varepsilon_r(\\varepsilon_{eff}-1)\\tan\\delta}{2\\sqrt{\\varepsilon_{eff}}\\,(\\varepsilon_r-1)}\\ \\ \\text{Np/m},\\qquad k_0 = 2\\pi f/c$$
<p><strong>Conductor loss</strong> uses Wheeler's incremental-inductance rule: the field penetrates the copper by about a skin depth, so the loss equals the change in inductance when every metal wall recedes by a small distance $n$:</p>
$$\\alpha_c = \\frac{R_s}{2\\eta_0 Z_0}\\,\\frac{\\partial Z_{0,air}}{\\partial n},\\qquad R_s = \\sqrt{\\pi f\\mu_0/\\sigma}$$
<p>Here the strip loses $2n$ of width and thickness and the gap to ground grows by $2n$; the derivative is taken numerically on the same Hammerstad–Jensen formulas, so current on the top, bottom and edges of the strip and in the ground plane is all counted (for a parallel-plate line the rule reduces to $R_s/(Z_0W)$). The result is multiplied by the Hammerstad roughness factor $K = 1 + \\tfrac{2}{\\pi}\\arctan[1.4(\\Delta/\\delta)^2]$, which approaches 2 when the RMS roughness $\\Delta$ is much larger than the skin depth $\\delta$. The rule assumes copper several skin depths thick, and it is undefined for a zero-thickness strip (the loss diverges at its edges), so enter the real copper thickness. Multiply Np by 8.686 for dB.</p>`,
    },
    {
      title: 'Solving for width, height or εr',
      html: `<p>Click the ◎ beside any of $Z_0$, $W$, $H$ or $\\varepsilon_r$ to make it the unknown. The calculator keeps the forward equations above and finds the unknown numerically: it scans the allowed range for a sign change in $Z_0(x) - Z_{target}$ and refines it with Brent's method. Because $Z_0$ falls monotonically with $W$ and $\\varepsilon_r$ and rises with $H$, the solution is unique when it exists. Using the same equations in both directions means a solved width, put back in, gives exactly the target Z₀.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Ask the fabricator.</strong> Prepreg thickness after lamination and the resin content of FR-4 move $Z_0$ more than any formula error. Use their stack-up and their impedance coupons.</li>
<li><strong>Solder mask</strong> typically lowers surface microstrip $Z_0$ by 1–3 Ω; this tool models bare copper.</li>
<li><strong>Use design Dk, not process Dk.</strong> Rogers publishes a "design Dk" (e.g. 3.66 for RO4350B) extracted from real circuits; it is the right number for impedance work.</li>
<li><strong>Keep the reference plane continuous.</strong> A gap in the plane under the trace breaks the return path; no formula covers that.</li>
<li><strong>Tolerance.</strong> A ±10 % change in $W$ moves a 50 Ω line by roughly ±2–3 Ω — usually comparable to the fabricator's ±10 % impedance tolerance.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>E. Hammerstad, Ø. Jensen, "Accurate Models for Microstrip Computer-Aided Design," IEEE MTT-S Int. Microwave Symp. Digest, 1980, pp. 407–409.</li>
<li>M. Kirschning, R. H. Jansen, "Accurate model for effective dielectric constant of microstrip with validity up to millimetre-wave frequencies," Electronics Letters 18(6), 1982.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., §3.8 (microstrip, attenuation).</li>
<li>B. C. Wadell, <em>Transmission Line Design Handbook</em>, Artech House, 1991, §3.5.</li>
<li>IPC-2141A, <em>Design Guide for High-Speed Controlled Impedance Circuit Boards</em>.</li>
</ul>`,
    },
  ],
};
