import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Dipole antennas — how this calculator works',
    lead:
      'A centre-fed dipole is a straight wire cut in the middle, where the feed line connects. On a thin wire the current is very nearly a sinusoidal standing wave that falls to zero at the tips. This page takes that current as given and computes the radiated power, pattern, directivity and feed resistance from closed-form integrals, then the feed reactance by the induced-EMF method. The resonant length, slightly shorter than half a wavelength by an amount that depends on the wire thickness, is found by setting that reactance to zero.',
  },
  sections: [
    {
      title: 'Current, pattern and radiation resistance',
      html: `<p>For a wire of total length $L$ along $z$, the assumed current is $I(z) = I_m \\sin[k(L/2 - |z|)]$ with $k = 2\\pi/\\lambda$. The far field gives the normalised power pattern</p>
$$F(\\theta) = \\left[\\frac{\\cos\\!\\left(\\tfrac{kL}{2}\\cos\\theta\\right) - \\cos\\tfrac{kL}{2}}{\\sin\\theta}\\right]^2$$
<p>with $\\theta$ measured from the wire axis. Integrating it over the sphere gives the radiated power $P = \\eta |I_m|^2 Q/(4\\pi)$, where</p>
$$Q = C + \\ln kL - \\mathrm{Ci}(kL) + \\tfrac12 \\sin kL\\,[\\mathrm{Si}(2kL) - 2\\mathrm{Si}(kL)] + \\tfrac12\\cos kL\\,[C + \\ln\\tfrac{kL}{2} + \\mathrm{Ci}(2kL) - 2\\mathrm{Ci}(kL)]$$
<p>$C \\approx 0.5772$ is Euler’s constant and Si, Ci are the sine and cosine integrals (evaluated here by series and continued fraction to machine precision). Then</p>
$$R_r = \\frac{\\eta}{2\\pi}Q,\\qquad D_0 = \\frac{2F_{max}}{Q},\\qquad R_{in} = \\frac{R_r}{\\sin^2(kL/2)}$$
<p>$R_r$ is referred to the current maximum $I_m$; $R_{in}$ is the same power referred to the feed current $I_m\\sin(kL/2)$. For $L = \\lambda/2$, $Q = \\tfrac12\\mathrm{Cin}(2\\pi) = \\tfrac12(2.43765) = 1.21883$, so $R_{in} = R_r = 73.08\\ \\Omega$ (with $\\eta_0 = 376.73\\ \\Omega$) and $D_0 = 2/Q = 1.6409$ (2.15 dBi). Balanis’s familiar 73 Ω and 1.643 are the same figures rounded ($D_0 = 120/73$). For a short dipole the same formulas approach $R_{in} \\approx 20\\pi^2 (L/\\lambda)^2$ and $D_0 = 1.5$.</p>`,
    },
    {
      title: 'Reactance and the resonant length',
      html: `<p>The induced-EMF method (Carter, 1932) computes the reactance of the same sinusoidal current on a wire of radius $a$:</p>
$$X_m = \\frac{\\eta}{4\\pi}\\Big\\{2\\mathrm{Si}(kL) + \\cos kL\\,[2\\mathrm{Si}(kL) - \\mathrm{Si}(2kL)] - \\sin kL\\,\\big[2\\mathrm{Ci}(kL) - \\mathrm{Ci}(2kL) - \\mathrm{Ci}(2ka^2/L)\\big]\\Big\\},\\qquad X_{in} = \\frac{X_m}{\\sin^2(kL/2)}$$
<p>At exactly $L = \\lambda/2$ the radius term is multiplied by $\\sin kL = 0$ and $X_{in} = 30\\,\\mathrm{Si}(2\\pi) \\approx 42.5\\ \\Omega$, so an exact half-wave dipole is inductive: $Z_{in} \\approx 73 + j42.5\\ \\Omega$. Shortening the wire makes the reactance pass through zero. Because the radius enters through $\\mathrm{Ci}(2ka^2/L) \\approx C + \\ln(2ka^2/L)$, the slope of $X_{in}$ with length depends on $\\ln(L/d)$: a thicker wire needs more shortening. With this model the resonant length is</p>
<table class="kv" style="max-width:640px"><tbody><tr><th>L/d</th><th>50</th><th>100</th><th>1 000</th><th>10 000</th><th>100 000</th></tr>
<tr><td>L/(λ/2)</td><td>0.934</td><td>0.946</td><td>0.965</td><td>0.974</td><td>0.980</td></tr>
<tr><td>R_in at resonance</td><td>60 Ω</td><td>62 Ω</td><td>66 Ω</td><td>68 Ω</td><td>69 Ω</td></tr></tbody></table>
<p>This is the end-effect shortening factor of the familiar handbook K-factor charts, here computed rather than read from a curve. The induced-EMF model keeps the sinusoidal current fixed whatever the wire thickness, so for fat elements (L/d below ~100) both the resonant length and the impedance become approximate; moment-method results (Balanis ch. 8) are then better.</p>`,
    },
    {
      title: 'Loss, efficiency and SWR',
      html: `<p>The wire’s skin-effect resistance per unit length is $R_s/(2\\pi a)$ with $R_s = \\sqrt{\\omega\\mu_0/2\\sigma}$. Integrating it over the sinusoidal current gives a loss resistance referred to the current maximum</p>
$$R_{L} = \\frac{R_s L}{4\\pi a}\\left(1 - \\frac{\\sin kL}{kL}\\right)$$
<p>(for $L = \\lambda/2$ this is Balanis’s $R_s L/(2P)$, $P = 2\\pi a$). The radiation efficiency is $e = R_r/(R_r + R_L)$ and the gain is $eD_0$. A copper HF wire dipole is typically 98–99 % efficient; a short or very thin dipole can be much worse. The SWR is computed against the feed-line impedance you enter, and the SWR ≤ 2 bandwidth is found by stepping the frequency with the length fixed.</p>`,
    },
    {
      title: 'Solving for length or frequency',
      html: `<p>Click ◎ on $L$, $f$ or $X_{in}$. With $L$ or $f$ as the unknown, the calculator finds where $X_{in}$ equals the target (0 for resonance) by scanning $0.2\\lambda \\le L \\le 0.75\\lambda$ and refining the sign change with Brent’s method. That span holds only the first series resonance. With $X_{in}$ as the unknown, both $L$ and $f$ are inputs and the page analyses any length up to 5λ: the impedance-vs-length graph shows the resonances near λ/2 and 3λ/2 and the high-impedance antiresonances near λ and 2λ.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Cut long, then trim.</strong> Insulated wire, end insulators, nearby objects and the ground all lower the resonant frequency. The common 468/f(MHz) ft rule (0.951·λ/2) is a few percent shorter than this free-space result for that reason.</li>
<li><strong>Height above ground</strong> changes the feed resistance of a horizontal dipole substantially: it swings above and below the free-space value as the height grows and falls steeply below about 0.2 λ. The ground also reshapes the elevation pattern. This page models free space.</li>
<li><strong>Use a balun.</strong> Coax connected straight to a balanced dipole lets common-mode current flow on the shield, which skews the pattern and the SWR.</li>
<li><strong>50 or 75 Ω?</strong> A resonant thin dipole is 63–70 Ω, giving SWR ≈ 1.3–1.4 on 50 Ω and ≈ 1.1 on 75 Ω.</li>
<li><strong>Fatter elements are broader-band.</strong> Doubling the diameter widens the SWR ≤ 2 bandwidth noticeably; try it on the frequency graph.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>C. A. Balanis, <em>Antenna Theory: Analysis and Design</em>, 3rd/4th ed., Wiley: §4.3 (small dipole), §4.5 (finite-length dipole: pattern, radiation resistance, directivity, input resistance), §4.6 (half-wave dipole), §8.5 (induced-EMF self-impedance), §2.14 (ohmic loss of a dipole).</li>
<li>P. S. Carter, “Circuit relations in radiating systems and applications to antenna problems,” <em>Proc. IRE</em>, 20(6), pp. 1004–1041, 1932.</li>
<li>M. Abramowitz, I. A. Stegun, <em>Handbook of Mathematical Functions</em>, §5.2 (sine and cosine integrals).</li>
<li>W. H. Press et al., <em>Numerical Recipes</em>, 2nd ed., §6.9 (cisi: continued fraction for Si and Ci).</li>
</ul>`,
    },
  ],
};
