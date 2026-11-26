import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Switching regulator ripple — how this calculator works',
    lead:
      'The ripple on a switching regulator’s input and output is the AC current of the converter flowing through a real capacitor, which is a capacitance in series with an ESR and an ESL. This page builds the capacitor current of a buck, boost or inverting buck-boost in continuous conduction, splits the ripple into its capacitive, ESR and ESL parts, and adds them with their timing, so you can see how far the usual “add them up” and “root-sum-square” shortcuts are from the real peak-to-peak.',
  },
  sections: [
    {
      title: 'Which current each capacitor sees',
      html: `<p>With ideal switches the duty cycle is $D = V_{out}/V_{in}$ (buck), $1 - V_{in}/V_{out}$ (boost) or $|V_{out}|/(V_{in}+|V_{out}|)$ (inverting buck-boost), and the inductor ripple is $\\Delta I_L = v_{L,on}\\,D/(f_{sw}L)$ with $v_{L,on} = V_{in}-V_{out}$ for the buck and $V_{in}$ for the others (Erickson & Maksimović ch. 2). Each capacitor carries the AC part of one terminal current:</p>
<table><tr><th></th><th>Output capacitor</th><th>Input capacitor</th></tr>
<tr><td>Buck</td><td>inductor current: continuous triangle</td><td>switch current: pulsed</td></tr>
<tr><td>Boost</td><td>rectifier current: pulsed</td><td>inductor current: continuous triangle</td></tr>
<tr><td>Buck-boost</td><td>rectifier current: pulsed</td><td>switch current: pulsed</td></tr></table>
<p>A pulsed current jumps between zero and the inductor current at every switching instant. Here that hand-over takes a finite time $t_{tr}$, centred on the switching instant, so the current is piecewise linear everywhere.</p>`,
    },
    {
      title: 'The three parts of the ripple',
      html: `<p>For a capacitor $C_{eff}$ with series $R_{ESR}$ and $L_{ESL}$ carrying $i_C(t)$,</p>
$$v(t) = \\frac{1}{C_{eff}}\\int i_C\\,dt \\;+\\; R_{ESR}\\,i_C(t) \\;+\\; L_{ESL}\\,\\frac{di_C}{dt}$$
<ul>
<li><strong>Capacitive.</strong> Triangle: $\\Delta V_C = \\Delta I_L/(8f_{sw}C)$ (TI SLVA477 eq. 12). Pulsed output of a boost: the capacitor alone feeds the load during $DT$, so $\\Delta V_C \\approx I_{out}D/(f_{sw}C)$ (SLVA372 eq. 9). Pulsed input of a buck: $\\Delta V_C \\approx I_{out}D(1-D)/(f_{sw}C)$.</li>
<li><strong>ESR.</strong> $R_{ESR}$ times the peak-to-peak current: $R_{ESR}\\Delta I_L$ for a triangle, $R_{ESR}I_{L,pk}$ for a pulsed current (SLVA372 eq. 10).</li>
<li><strong>ESL.</strong> For a triangle the slope is constant on each interval, so the ESL adds a square wave of $L_{ESL}(v_{L,on}/L + v_{L,off}/L)$ — for the buck output $L_{ESL}V_{in}/L$ (TI SLVA630). For a pulsed current it adds spikes of about $L_{ESL}I/t_{tr}$ at each edge, which are usually the largest part of a boost’s output ripple on a fast scope.</li>
</ul>
<p>Every term uses the effective bank: $C_{eff} = n\\,C\\,k_{DC}$, $R_{ESR}/n$ and $L_{ESL}/n$ for $n$ equal parts, with $k_{DC}$ the share of the rated capacitance left at the DC bias.</p>`,
    },
    {
      title: 'Adding them: timing matters',
      html: `<p>The three parts peak at different times. The capacitive term is the integral of the current, so it lags it by a quarter cycle; the ESR term follows the current; the ESL term follows its slope. The page therefore evaluates $v(t)$ exactly: on each linear piece of $i_C$ the voltage is a quadratic plus a constant, so its extremes are at the piece ends or where $dv/dt = 0$. Two shortcuts are shown for comparison:</p>
<ul>
<li>the <strong>simple sum</strong> $\\Delta V_C + \\Delta V_{ESR} + \\Delta V_{ESL}$ is a safe upper bound, reached only if all three peak together;</li>
<li>the <strong>root-sum-square</strong> $\\sqrt{\\Delta V_C^2 + \\Delta V_{ESR}^2 + \\Delta V_{ESL}^2}$ is right only for uncorrelated noise or for sine waves 90° apart. These waveforms are neither, and with a pulsed current the ESR step and the ESL spike coincide, so RSS can understate the ripple.</li>
</ul>
<p>For a buck output the ESL square wave is positive while the current rises, which is when the capacitive term is at its lowest; the two partly cancel, and the exact ripple can come out below the capacitive term alone.</p>`,
    },
    {
      title: 'Ceramic DC-bias derating',
      html: `<p>Class-II ceramics (X5R, X7R) lose capacitance as the DC voltage across them rises, because the ferroelectric dielectric’s permittivity falls with field strength. Small cases and thin dielectrics suffer most: a part used at half its rated voltage commonly keeps 30–70 % of its nominal value, and less at its full rating. There is no universal formula; the curve depends on the part, so the page takes the retained percentage you read from the maker’s DC-bias curve (Murata SimSurfing, TDK, Samsung or KEMET tools). C0G, film and polymer parts keep ≈ 100 %. Temperature and ageing take a further 10–20 % from X5R/X7R parts.</p>`,
    },
    {
      title: 'Solving for C or ESR',
      html: `<p>Click ◎ on $C$ or ESR (output or input) and type a ripple target in the green $\\Delta V$ box. The page searches the exact peak-to-peak ripple for the value per part that meets the target. The ripple is convex in $1/C$ and in ESR, so the parts that meet a target form one range: the page reports the smallest $C$ and the largest ESR in it. If the ESR and ESL alone already exceed the target, no capacitance helps and the page says so; likewise for ESR when the capacitance and ESL alone exceed it.</p>`,
    },
    {
      title: 'Limits and practical notes',
      html: `<ul>
<li>Continuous conduction with ideal (lossless) waveforms; the capacitor voltage is taken as constant while computing the currents (small-ripple approximation). For DCM, or for the duty cycle with losses, use the Buck or Boost Converter page.</li>
<li>ESL spike height depends on $t_{tr}$ and the layout; on a scope it is also cut by the probe and bandwidth limit. A ground spring at the capacitor, not a long ground lead, is needed to see the real ripple.</li>
<li>ESR and ESL change with frequency; take them from the impedance curve near $f_{sw}$ (ESR) and from the self-resonance (ESL $= 1/((2\\pi f_{SRF})^2C)$).</li>
<li>Parallel parts only divide ESL if each has its own short path to the plane; mixing a bulk polymer with small MLCCs moves the dominant term.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>R. W. Erickson, D. Maksimović, <em>Fundamentals of Power Electronics</em>, 2nd ed., Springer, 2001, ch. 2 (CCM conversion ratios, inductor and capacitor ripple).</li>
<li>B. Hauke, “Basic Calculation of a Buck Converter’s Power Stage,” TI SLVA477; “Basic Calculation of a Boost Converter’s Power Stage,” TI SLVA372.</li>
<li>Texas Instruments, “Output Ripple Voltage for Buck Switching Regulator,” application report SLVA630.</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, ch. 7.</li>
<li>Murata Manufacturing, “DC bias characteristics of multilayer ceramic capacitors” (application notes and SimSurfing data).</li>
</ul>`,
    },
  ],
};
