import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Skin effect — how this calculator works',
    lead:
      'An alternating current does not use the whole cross-section of a conductor: the changing magnetic field inside the metal induces eddy currents that push the current towards the surface. The current density decays exponentially with depth, and the skin depth δ is the depth where it has fallen to 1/e. This page gives δ and the surface resistance for any metal, and the exact AC resistance of a round wire from the Bessel-function solution, not a rule of thumb.',
  },
  sections: [
    {
      title: 'Skin depth and surface resistance',
      html: `<p>For a good conductor ($\\sigma \\gg \\omega\\varepsilon$, true for metals far into the infrared) the fields inside a thick, flat conductor vary as $e^{-z/\\delta}e^{-jz/\\delta}$ with</p>
$$\\delta = \\frac{1}{\\sqrt{\\pi f \\mu_0\\mu_r\\sigma}},\\qquad R_s = \\frac{1}{\\sigma\\delta} = \\sqrt{\\frac{\\pi f\\mu_0\\mu_r}{\\sigma}}\\ \\ \\Omega/\\square$$
<p>The surface resistance $R_s$ is the resistance of a square of conductor surface of any size, as if the current flowed uniformly in a layer one skin depth thick. For annealed copper ($\\sigma$ = 58 MS/m) δ ≈ 66 µm/√(f in MHz): 8.5 mm at 60 Hz, 66 µm at 1 MHz, 0.66 µm at 10 GHz.</p>
<p>The magnitude of the current density falls to $e^{-3}$ ≈ 5 % of its surface value at 3δ and to 0.7 % at 5δ. A plating or sheet several skin depths thick therefore behaves like solid metal: a layer 3δ thick has $R_s$ about 0.3 % above the bulk value, and a layer 5δ thick is within about 0.013 %. That is why a few micrometres of silver or gold are enough at microwave frequencies — and why the metal underneath (often nickel, which is lossy and magnetic) matters if the plating is thinner than that.</p>`,
    },
    {
      title: 'AC resistance of a round wire (exact)',
      html: `<p>In a straight round wire of radius $a$, the current density satisfies Bessel’s equation. The internal impedance per unit length is</p>
$$Z_i = \\frac{k}{2\\pi a\\sigma}\\,\\frac{J_0(ka)}{J_1(ka)},\\qquad k = \\frac{1-j}{\\delta},\\qquad \\frac{Z_i}{R_{dc}} = \\frac{ka}{2}\\,\\frac{J_0(ka)}{J_1(ka)},\\quad R_{dc} = \\frac{1}{\\pi a^2\\sigma}$$
<p>The real part is $R_{ac}/R_{dc}$ and the imaginary part is $\\omega L_i/R_{dc}$, where $L_i$ is the internal inductance (μ/8π = 50 nH/m at DC, falling as the current leaves the centre). This is the same result that older texts write with Kelvin functions ber and bei of $q = \\sqrt2\\,a/\\delta$. The calculator evaluates it with the power series of $J_0$ and $J_1$ up to $a/\\delta = 30$ and with the Hankel asymptotic expansion beyond that; both agree with a 90-digit Kelvin-function evaluation to about $10^{-11}$, and reproduce Terman’s classic table (for example $R_{ac}/R_{dc}$ = 1.078 at $q$ = 2, 2.043 at $q$ = 5, 3.799 at $q$ = 10).</p>
<p>Limits: at low frequency $R_{ac}/R_{dc} \\approx 1 + (a/\\delta)^4/48$; at high frequency $R_{ac}/R_{dc} \\approx a/(2\\delta) + 1/4 + 3\\delta/(32a)$.</p>`,
    },
    {
      title: 'Approximations, and how good they are',
      html: `<p>Two shortcuts are shown next to the exact value:</p>
<ul>
<li><strong>One-δ annulus</strong>, $R_{ac}/R_{dc} = a^2/(2a\\delta - \\delta^2)$: assume all current flows uniformly in a ring one skin depth thick. It is within 1 % for $a/\\delta \\gtrsim 3.5$, but up to about 5 % high near $a = 2\\delta$, and below $a = \\delta$ it is meaningless (the calculator then shows 1).</li>
<li><strong>Asymptote</strong>, $a/(2\\delta) + 1/4 + 3\\delta/(32a)$: within 0.1 % once $a/\\delta \\gt 3.5$ and 0.7 % at $3\\delta$, but 2–3 % off at $2\\delta$ and useless below that.</li>
</ul>
<p>The graph shows where each shortcut departs from the exact curve.</p>`,
    },
    {
      title: 'Solving for frequency',
      html: `<p>Give any one of the frequency, the skin depth or a target $R_{ac}/R_{dc}$; the other two are calculated (green). The skin depth inverts exactly, $f = 1/(\\pi\\mu\\sigma\\delta^2)$. A target $R_{ac}/R_{dc}$ is solved numerically: the ratio rises monotonically with $a/\\delta$, so the calculator brackets the root and refines it with Brent’s method, then converts $a/\\delta$ to frequency. Example: AWG 24 copper doubles its resistance at about 0.8 MHz.</p>`,
    },
    {
      title: 'What the model leaves out',
      html: `<ul>
<li><strong>Proximity effect.</strong> Neighbouring conductors (other turns of a coil, the return wire, a ground plane) crowd the current further and often dominate in transformer and inductor windings. Use Dowell’s method or field simulation there.</li>
<li><strong>Magnetic metals.</strong> Steel and nickel have μr of tens to thousands at low frequency, but it depends on alloy, stress, DC bias and field amplitude, and it falls towards 1 in the GHz range (ferromagnetic resonance). Treat results for μr &gt; 1 as estimates.</li>
<li><strong>Good-conductor assumption.</strong> The formula needs $\\sigma \\gg \\omega\\varepsilon_0$; the page warns when $\\sigma/\\omega\\varepsilon_0 < 100$ (poorly conducting materials at very high frequency), where it underestimates δ.</li>
<li><strong>Temperature.</strong> Conductivities are at 20 °C. Copper’s resistivity rises about 0.39 %/K, so δ grows about 0.2 %/K.</li>
<li><strong>Surface roughness</strong> raises the loss once the RMS roughness approaches δ (a factor up to about 2 by the Hammerstad model). At cryogenic temperatures and THz frequencies the anomalous skin effect and electron relaxation change the result.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>S. Ramo, J. R. Whinnery, T. Van Duzer, <em>Fields and Waves in Communication Electronics</em>, 3rd ed., Wiley, 1994, §3.16–3.17 (skin effect, surface impedance) and §5.12 (internal impedance of round wires).</li>
<li>S. A. Schelkunoff, “The electromagnetic theory of coaxial transmission lines and cylindrical shields,” <em>Bell System Technical Journal</em> 13 (1934), 532–579.</li>
<li>F. E. Terman, <em>Radio Engineers’ Handbook</em>, McGraw-Hill, 1943, sec. 2 (skin-effect resistance ratio of isolated round wires).</li>
<li>M. Abramowitz, I. A. Stegun, <em>Handbook of Mathematical Functions</em>, 1964, 9.1.10, 9.2.5–9.2.10, 9.9 (Bessel series, Hankel asymptotics, Kelvin functions).</li>
<li>Conductivities: <em>CRC Handbook of Chemistry and Physics</em> (electrical resistivity of pure metals, 293 K); IEC 60028 (International Annealed Copper Standard); <em>ASM Handbook</em> vol. 2 (aluminium, copper and stainless alloys).</li>
</ul>`,
    },
  ],
};
