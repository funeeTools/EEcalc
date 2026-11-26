import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Mixer spurs — how this calculator works',
    lead:
      'A mixer is a nonlinear device, so besides the wanted sum or difference it produces every combination of LO and input harmonics. This page lists all products up to a chosen order, finds the ones that fall into the output (IF) band where no filter can remove them, and lists the input frequencies that the mixer would convert into that band, such as the image and the half-IF response, which the filter in front of the mixer must reject. It covers down- and up-conversion, high- and low-side LO, and a fixed or tuned LO.',
  },
  sections: [
    {
      title: 'Products of a mixer',
      html: `<p>Driving a mixer with an LO at $f_{LO}$ and a signal at $f_{in}$ produces output at</p>
$$f_{m,n} = \\left|\\,m\\,f_{LO} \\pm n\\,f_{in}\\,\\right|$$
<p>for $m, n = 0, 1, 2, \\ldots$, with order $m + n$. The wanted product is $m = n = 1$: the difference for a down-converter (and for an up-converter with the LO above the output), the sum for an up-converter with the LO below. Everything else is a spur: $m = 0$ gives harmonics of the input, $n = 0$ the LO and its harmonics (LO leakage), and products with both $m, n \\ge 1$ are the m×n spurs listed in mixer data sheets (Henderson &amp; Camargo). Balanced mixers suppress products with even $m$ or $n$, but never completely, so all orders are listed.</p>`,
    },
    {
      title: 'Frequency plan and solving',
      html: `<p>The wanted relation ties the three frequencies together:</p>
<ul>
<li>down-conversion, high-side LO: $f_{LO} = f_{in} + f_{out}$; low-side: $f_{LO} = f_{in} - f_{out}$;</li>
<li>up-conversion, low-side LO: $f_{LO} = f_{out} - f_{in}$ (sum product); high-side: $f_{LO} = f_{out} + f_{in}$ (spectrum inverted).</li>
</ul>
<p>Click ◎ on $f_{LO}$, $f_{out}$ or $f_{in}$ to make it the unknown; the solve is the exact inverse of the line above. The page refuses combinations that contradict the chosen direction or LO side (for example a high-side LO that ends up below the input).</p>`,
    },
    {
      title: 'Spurs in the output band',
      html: `<p><strong>Fixed LO (block conversion).</strong> The whole input band $[f_{in} - B_{in}/2,\\ f_{in} + B_{in}/2]$ is present at once. A product $m f_{LO} \\pm n f$ is linear in $f$, so as $f$ sweeps the band it covers an interval $n B_{in}$ wide (folded at zero by the absolute value). If that interval touches the output band, some input frequency in the band creates a spur that the IF filter passes.</p>
<p><strong>Tuned LO (channel receiver).</strong> The LO follows the channel so that the wanted output stays at $f_{out}$; substituting $f_{LO}(f) = f \\pm f_{out}$ makes each spur a straight line in the channel frequency. The spur chart plots these lines across the tuning range against the output channel: where a line crosses the channel, that spur lands on the wanted signal. The $n$-th harmonic of a channel of width $B_{out}$ is $n B_{out}$ wide, so the test widens each line by $n B_{out}/2$ (equivalently, it refers the IF bandwidth to the input as $\\pm B_{out}/2n$).</p>
<p>Rows turn red when a spur overlaps the band, yellow when it comes within the margin $\\Delta$ of an edge, and green otherwise.</p>`,
    },
    {
      title: 'Spurious responses at the input',
      html: `<p>Turning the question round: which input frequencies $f$ give $|m f_{LO} \\pm n f|$ inside the output band? Solving for $f$,</p>
$$f = \\frac{m\\,f_{LO} \\pm f_{out}}{n}$$
<p>with $n \\ge 1$ (Rohde, Whitaker &amp; Zahnd). The most important are the <strong>image</strong> ($m = n = 1$, the other side of the LO, $2 f_{out}$ away from the wanted input; if a low-side LO lies below the IF, the image folds through zero and appears at $|f_{LO} - f_{out}|$, $2 f_{LO}$ away), the <strong>half-IF</strong> response ($m = n = 2$, $f_{out}/2$ from the wanted input towards the LO) and <strong>IF feedthrough</strong> ($m = 0$, $n = 1$: an input already at the output frequency). These lie outside the input band in a good plan, and the filter before the mixer must attenuate them; a response inside the input band cannot be filtered at all. For an up-converter the matching concern is the other sideband at $|f_{LO} \\mp f_{in}|$, $2 f_{in}$ from the wanted output ($2 f_{LO}$ when the LO is below the input), removed by the filter after the mixer.</p>`,
    },
    {
      title: 'Spur levels',
      html: `<p>This page gives frequencies only. How strong each spur is depends on the mixer topology, the LO drive and the input level, so use the m×n table in your mixer’s data sheet, measured at your drive levels. One general rule helps when scaling such a table: an m×n spur’s level relative to the wanted output changes by about $(n-1)$ dB for every dB change of the input level, so high-$n$ spurs fall quickly when the input is backed off (Henderson &amp; Camargo). Products with $n = 1$ (LO harmonics mixing with the signal) do not improve with lower drive.</p>`,
    },
    {
      title: 'Practical notes',
      html: `<ul>
<li><strong>Choose the IF first.</strong> A higher IF moves the image ($2f_{out}$ away) and the half-IF response ($f_{out}/2$ away) further from the band, easing the input filter. For block conversion, keep $2 f_{out}$ well above $B_{in}$.</li>
<li><strong>Wide blocks fill the band with m = n spurs.</strong> $m f_{LO} - m f$ spans $m B_{in}$ around $m f_{out}$; with $B_{in}$ comparable to $f_{out}$ the 2×2 product reaches into the IF band (the 2.4 GHz example).</li>
<li><strong>Try the other LO side.</strong> It moves every spur line; it is often the cheapest fix.</li>
<li><strong>Not modelled:</strong> spurs caused by two input signals (intermodulation), LO phase noise and reciprocal mixing, and spurs created inside the LO synthesiser.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ol>
<li>B. C. Henderson and E. Camargo, <em>Microwave Mixer Technology and Applications</em>, Artech House, 2013.</li>
<li>D. M. Pozar, <em>Microwave Engineering</em>, 4th ed., Wiley, 2012, ch. 13 (mixers: frequency conversion, image response).</li>
<li>U. L. Rohde, J. C. Whitaker and H. Zahnd, <em>Communications Receivers: Principles and Design</em>, 4th ed., McGraw-Hill, 2017 (spurious responses of the superheterodyne).</li>
</ol>`,
    },
  ],
};
