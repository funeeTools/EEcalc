import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Flyback converter — how this calculator works',
    lead:
      'A flyback is an isolated buck-boost: the switch stores energy in the transformer’s magnetizing inductance during the on-time, and the secondary delivers it to the output while the switch is off. This page sizes the power stage in steady state — turns ratio, primary inductance, peak and RMS currents, switch and rectifier voltage stress, output ripple, transformer energy and the RCD clamp loss — following Fairchild AN-4137 and the averaged treatment of Erickson & Maksimović, with the current and drain waveforms drawn for the low-line corner.',
  },
  sections: [
    {
      title: 'Turns ratio, reflected voltage and duty cycle',
      html: `<p>While the secondary conducts, the output plus the rectifier drop is reflected to the primary as</p>
$$V_{OR} = N\\,(V_{out}+V_F),\\qquad N = N_p/N_s$$
<p>Volt-second balance on the magnetizing inductance, $V_{in} D = V_{OR}(1-D)$, gives the continuous-conduction (CCM) duty and its inverse, the turns ratio for a chosen maximum duty at the lowest input (AN-4137 steps 3–4):</p>
$$D = \\frac{V_{OR}}{V_{in}+V_{OR}},\\qquad N = \\frac{V_{in,min}\\,D_{max}}{(1-D_{max})(V_{out}+V_F)}$$
<p>which is Erickson’s $M(D) = D/(N(1-D))$ for the flyback (§6.3.4). $N$ trades switch stress against current: a larger $N$ lengthens the duty, lowers the primary current and the rectifier’s reverse voltage $V_{out} + V_{in,max}/N$, but raises the drain voltage $V_{in,max} + V_{OR}$ plus the clamp overshoot. The <em>Stress vs N</em> graph shows this trade-off.</p>`,
    },
    {
      title: 'Primary inductance and ripple factor',
      html: `<p>The input power $P_{in} = P_{out}/\\eta$ flows through the magnetizing inductance. AN-4137 describes the primary current by its value in the middle of the on-time ramp and a ripple factor:</p>
$$I_{EDC} = \\frac{P_{in}}{V_{in,min} D_{max}},\\qquad K_{RF} = \\frac{\\Delta I_p}{2 I_{EDC}},\\qquad \\Delta I_p = \\frac{V_{in,min}D_{max}}{L_p f_{sw}}$$
$$L_p = \\frac{(V_{in,min}D_{max})^2}{2\\,P_{in}\\,f_{sw}\\,K_{RF}},\\qquad I_{p,pk} = I_{EDC}\\,(1+K_{RF})$$
<p>$K_{RF} = 1$ is the CCM/DCM boundary (BCM): the current starts each cycle at zero, and $L_p$ is the critical inductance $L_{crit}$. AN-4137 suggests about 0.25–0.5 for a universal-input design and 0.4–0.8 for a 230 V-only design; smaller $K_{RF}$ needs a larger transformer. The energy the gapped core must store is $\\tfrac12 L_p I_{p,pk}^2$, while the energy actually transferred each cycle is $P_{in}/f_{sw} = \\tfrac12 L_p (I_{p,pk}^2 - I_{p,min}^2)$.</p>
<p><strong>Discontinuous conduction.</strong> With $L_p < L_{crit}$ the current falls to zero before the next cycle. The peak and duty then no longer depend on $N$:</p>
$$I_{p,pk} = \\sqrt{\\frac{2P_{in}}{L_p f_{sw}}},\\qquad D = \\frac{I_{p,pk}L_p f_{sw}}{V_{in}} = \\frac{D_{bcm}}{\\sqrt{K}},\\qquad D_2 = \\frac{V_{in}D}{V_{OR}}$$
<p>Here this page reads $K_{RF}$ as $L_{crit}/L_p$, which equals the AN-4137 value in CCM and continues smoothly above 1 into DCM (AN-4137 itself simply sets $K_{RF}=1$ for any DCM design).</p>`,
    },
    {
      title: 'Currents and output ripple',
      html: `<p>The primary current is a trapezoid (CCM) or triangle (DCM) during $DT$:</p>
$$I_{p,rms} = \\sqrt{\\frac{D}{3}\\left(I_{pk}^2 + I_{pk}I_{min} + I_{min}^2\\right)}$$
<p>The secondary carries the same waveform reflected by $N$ during $D_2T$, scaled here so that its average is exactly $I_{out}$ (AN-4137 step 9 applies the same kind of scaling with $\\eta$). The output capacitor sees $i_s - I_{out}$; because $i_s$ jumps from zero to its peak at turn-off, the ESR term $R_{ESR}I_{s,pk}$ usually dominates the ripple. The page evaluates the capacitor charge plus ESR drop exactly on the piecewise-linear current at both input corners and reports the larger.</p>`,
    },
    {
      title: 'Leakage, clamp and drain voltage',
      html: `<p>The leakage inductance $L_{lk}$ does not couple to the secondary, so its energy must go somewhere when the switch opens. An RCD clamp holds the drain at $V_{in} + V_{clamp}$ while the leakage current resets in</p>
$$t_s = \\frac{L_{lk} I_{pk}}{V_{clamp}-V_{OR}},\\qquad P_{clamp} = \\tfrac12 L_{lk} I_{pk}^2 f_{sw}\\,\\frac{V_{clamp}}{V_{clamp}-V_{OR}}$$
<p>(AN-4147). The factor $V_{clamp}/(V_{clamp}-V_{OR})$ appears because, during $t_s$, the magnetizing inductance keeps pushing current through the clamp at $V_{OR}$. A clamp ratio $k_c = V_{clamp}/V_{OR}$ near 1 makes the loss explode; 1.5–2.5 is typical, limited by the switch rating $V_{in,max} + V_{clamp} < V_{DSS}$ with margin. The RCD Clamp calculator sizes the resistor, capacitor and diode.</p>`,
    },
    {
      title: 'Solve-for on this page',
      html: `<p>The design has two independent choices: the turns ratio (equivalently $D_{max}$ or $V_{OR}$) and the inductance (equivalently $K_{RF}$). One of each pair is the input; click ◎ to swap within a pair. The default solves both $N$ and $L_p$ from $D_{max}$ and $K_{RF}$, the AN-4137 order; the other options take a given $N$, a given $L_p$, or both (analysis of an existing transformer). All four are exact algebraic inverses of the same forward model, so typing a solved value back reproduces the target. With a fixed $L_p$ in DCM the duty does not depend on $N$; then the entered $N$ is kept if it lies on that plateau.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Corners.</strong> Peak current and duty are worst at $V_{in,min}$ and full load; drain and rectifier stress at $V_{in,max}$. For an off-line supply use the bulk-capacitor valley voltage for $V_{in,min}$.</li>
<li><strong>Above 50 % duty</strong> in CCM, peak-current-mode control needs slope compensation, and the right-half-plane zero ($\\propto (1-D)^2$) limits the loop bandwidth.</li>
<li><strong>Transformer.</strong> Rate the core for $I_{p,pk}$ at the current limit, not just at full load. Interleaved windings cut the leakage and the clamp loss.</li>
<li><strong>Not modelled:</strong> drain ringing with $C_{oss}$ after the clamp interval and in DCM, rectifier reverse recovery, winding AC resistance, and the efficiency’s dependence on line and load (the entered $\\eta$ is used everywhere).</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>Fairchild Semiconductor (onsemi), “Design Guidelines for Off-line Flyback Converters Using Fairchild Power Switch (FPS),” application note AN-4137.</li>
<li>H.-S. Choi, Fairchild Semiconductor (onsemi), “Design Guidelines for RCD Snubber of Flyback Converters,” application note AN-4147, 2006.</li>
<li>J. Picard, “Under the Hood of Flyback SMPS Designs,” Texas Instruments Power Supply Design Seminar SLUP254, 2010.</li>
<li>R. W. Erickson, D. Maksimović, <em>Fundamentals of Power Electronics</em>, 2nd ed., Springer, 2001: §6.3.4 (flyback converter), ch. 5 (discontinuous conduction).</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, §10-4 (flyback converters).</li>
</ul>`,
    },
  ],
};
