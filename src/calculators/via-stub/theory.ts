import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Via stubs — how this calculator works',
    lead:
      'When a signal enters a through via on the top layer and leaves on an inner layer, the rest of the barrel hangs below the exit as an open-ended transmission line. At the frequency where that stub is a quarter wavelength long it shorts the signal path and cuts a deep notch in the channel. This page finds that resonance, compares it with the Nyquist frequency of the data rate, sizes the back-drill that pushes it out of the way, and plots the loss the stub adds.',
  },
  sections: [
    {
      title: 'Quarter-wave resonance',
      html: `<p>An open-circuited line of length $\\ell$ has input impedance $Z_{in} = Z_{via}\\coth(\\gamma\\ell)$. Without loss it is zero, a short across the signal path, whenever $\\beta\\ell = \\pi/2 + m\\pi$. With $\\beta = 2\\pi f\\sqrt{\\varepsilon_{eff}}/c$ the fundamental and its odd harmonics are</p>
$$f_{res} = \\frac{c}{4\\,\\ell\\,\\sqrt{\\varepsilon_{eff}}},\\qquad 3f_{res},\\ 5f_{res},\\ \\dots$$
<p>The field of a via stub lies almost entirely in the laminate, so $\\varepsilon_{eff}$ is close to the laminate Dk at the frequencies involved. A 1 mm stub in Dk 4 material resonates near 37 GHz.</p>
<p>The stub length comes from the stack-up. With $N_L$ evenly spaced copper layers, L1 on top, the exit layer $L_x$ lies $\\ell_{use} = H\\,(x-1)/(N_L-1)$ deep and the stub is $H-\\ell_{use}$, or whatever back-drilling leaves.</p>`,
    },
    {
      title: 'Capacitance at the stub end',
      html: `<p>A pad at the bottom of the stub, or the edges of the planes it passes, load the open end with a capacitance $C$. The resonance then moves to the lowest root of</p>
$$\\tan(\\beta\\ell) = \\frac{1}{\\omega C Z_{via}}$$
<p>which always lies below the quarter-wave value; the quarter-wave figure is therefore an upper bound. Enter $C_{end}$ to include it, for example a pad-to-plane estimate from the Via Calculator.</p>`,
    },
    {
      title: 'Nyquist frequency and margin',
      html: `<p>The Nyquist frequency holds most of the energy of a digital signal: $f_N = R_b/2$ for NRZ, and $R_b/4$ for PAM4, which sends two bits per symbol. The stub resonance must sit well above it. How far is a judgement call, set here as the margin $k$ in $f_{res} \\ge k\\,f_N$:</p>
<ul>
<li>Bogatin’s rule of thumb keeps the stub under about 300 mil divided by the bit rate in Gb/s, which works out at roughly $10\\,f_N$ for NRZ in Dk 4 material;</li>
<li>a channel bandwidth of about five times Nyquist is a common target for clean eyes;</li>
<li>2–3× is aggressive, accepted where the loss budget has room, and checked against the loss curve.</li>
</ul>
<p>The longest stub the margin allows, and the back-drill depth that leaves it, are</p>
$$\\ell_{max} = \\frac{c}{4\\,k f_N\\sqrt{\\varepsilon_{eff}}},\\qquad \\ell_{bd} = (H-\\ell_{use})-\\ell_{max}$$`,
    },
    {
      title: 'The loss notch',
      html: `<p>To see what the stub costs, the page cascades the ABCD matrices of the used part of the barrel (length $\\ell_{use}$, impedance $Z_{via}$) and the stub as a shunt admittance $1/Z_{in}$, between traces of impedance $Z_0$, with dielectric loss $\\alpha_d = \\pi f\\sqrt{\\varepsilon_{eff}}\\tan\\delta/c$. The insertion loss is $-20\\log_{10}|S_{21}|$. Near $f_{res}$ it dips into a notch whose depth is set by the loss tangent; its width grows as $Z_{via}$ falls. The page flags a stub that adds more than 1 dB at $f_N$, and marks the verdict in the resonance table.</p>`,
    },
    {
      title: 'Solving',
      html: `<p>Click ◎ on the residual stub to get the longest stub the margin allows, which is the back-drill target. Click ◎ on the data rate for the fastest rate the stub supports at that margin. Click the achieved margin to analyse the via exactly as entered. With an end capacitance the resonance is found by Brent’s method on the same equation, so every answer is consistent with the others.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li>Back-drilling removes the barrel from the bottom with a slightly larger drill. Depth control typically leaves 0.1–0.25 mm of stub; ask your fabricator what they hold, and design for the long end.</li>
<li>Routing the signal to a layer near the bottom, or using blind and buried vias, avoids the stub altogether.</li>
<li>Non-functional pads on the stub add capacitance and pull the resonance down; removing them helps a little.</li>
<li>For a differential pair the resonance is the same; use the pair impedances for $Z_{via}$ and $Z_0$, or the Differential Via page.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, §2.3 (terminated lines), §2.7 (lossy lines), §4.4 (ABCD matrices).</li>
<li>E. Bogatin, <em>Signal and Power Integrity — Simplified</em>, 3rd ed., Prentice Hall, 2018 (via stubs, rules of thumb).</li>
<li>H. Johnson, M. Graham, <em>High-Speed Signal Propagation: Advanced Black Magic</em>, Prentice Hall, 2003 (vias).</li>
<li>Polar Instruments, application note AP8204 (stub-length rule of thumb).</li>
</ol>`,
    },
  ],
};
