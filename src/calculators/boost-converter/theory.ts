import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Boost converter power stage — how this calculator works',
    lead:
      'A boost converter stores energy in an inductor while a switch shorts it to ground, then releases it through a rectifier into the output, so the output sits above the input. This page sizes the stage in steady state: duty cycle with conduction losses, inductor ripple and peak current (also at the lowest input voltage), rectifier and capacitor currents, output and input ripple, a first-order loss budget and the right-half-plane zero. It follows TI’s application note SLVA372 and the averaged steady-state model of Erickson & Maksimović, and evaluates the ripple exactly on the piecewise-linear currents.',
  },
  sections: [
    {
      title: 'Duty cycle with losses',
      html: `<p>Charge balance on the output capacitor says the rectifier passes the load current on average, so the inductor carries $I_L = I_{out}/(1-D)$. Volt-second balance on the inductor, with switch on-resistance $R_{SW}$, winding resistance $R_L$ and rectifier drop $V_{off}$ ($V_F$ for a diode, $I_L R_{SR}$ for a synchronous FET), reads</p>
$$V_{in} - I_L R_L - D\\,I_L R_{SW} - (1-D)\\,(V_{out} + V_{off}) = 0$$
<p>Multiplying by $D' = 1-D$ gives a quadratic in $D'$:</p>
$$(V_{out}+V_F)\\,D'^2 - (V_{in} + I_{out}R_{SW} - I_{out}R_{SR})\\,D' + I_{out}(R_L + R_{SW}) = 0$$
<p>With ideal parts this is the familiar $D = 1 - V_{in}/V_{out}$; with only $R_L$ it reproduces Erickson’s $V/V_g = \\frac{1}{D'}\\,\\frac{1}{1 + R_L/(D'^2R)}$. The larger root is the normal operating point. When the quadratic has no real root the converter has passed the peak of its gain curve: the losses grow as $1/D'^2$ and no duty cycle gives the requested output at that load. The page reports the largest load it could deliver instead. SLVA372 eq. 1 approximates the same effect with an assumed efficiency, $D = 1 - V_{in}\\eta/V_{out}$.</p>`,
    },
    {
      title: 'Inductor ripple and peak current',
      html: `<p>While the switch is on the inductor sees $V_{in} - I_L(R_L + R_{SW})$, so</p>
$$\\Delta I_L = \\frac{(V_{in} - I_L R_L - I_L R_{SW})\\,D}{f_{sw}\\,L} \\;\\approx\\; \\frac{V_{in}D}{f_{sw}L}\\quad\\text{(SLVA372 eq. 4)}$$
$$I_{L,pk} = \\frac{I_{out}}{1-D} + \\frac{\\Delta I_L}{2}\\quad\\text{(eq. 5)},\\qquad L = \\frac{V_{in}(V_{out}-V_{in})}{\\Delta I_L f_{sw} V_{out}}\\quad\\text{(eq. 6)}$$
<p>The ripple ratio here is $r = \\Delta I_L/I_{L,avg}$, relative to the inductor (input) current, not the load. The peak current is highest at the lowest input voltage, where the duty cycle and $I_L$ are largest, so the page evaluates that corner with the same $L$ and $f_{sw}$ and rates the switch and inductor from it. The ripple itself peaks near $V_{in} = V_{out}/2$.</p>`,
    },
    {
      title: 'Continuous and discontinuous conduction',
      html: `<p>The valley current reaches zero when $\\Delta I_L/2 = I_L$; the corresponding load is $I_{out,crit} = (1-D)\\,\\Delta I_L/2$. Below it a diode boost enters DCM: the current rises for $D_1T$ and falls for $D_2T$, then rests at zero, and</p>
$$D_1 = \\frac{I_{pk}Lf_{sw}}{v_{up}},\\quad D_2 = \\frac{I_{pk}Lf_{sw}}{v_{dn}},\\quad I_{out} = \\tfrac12 I_{pk}D_2$$
<p>with $v_{up} = V_{in} - \\tfrac{I_{pk}}{2}(R_L+R_{SW})$ and $v_{dn} = V_{out}+V_F-V_{in}+\\tfrac{I_{pk}}{2}R_L$. Lossless, this is Erickson’s $M = \\tfrac12\\big(1+\\sqrt{1+4D^2/K}\\big)$ with $K = 2L/(RT_s)$ (ch. 5). The resistive drops use $I_{pk}/2$, which equals $I_L$ at the boundary, so CCM and DCM meet continuously. A synchronous boost in forced PWM stays in CCM and its inductor current goes negative at light load, returning energy to the input; that is what the page computes for the synchronous option.</p>`,
    },
    {
      title: 'Output and input ripple',
      html: `<p>The output capacitor sees the rectifier current minus the load: $-I_{out}$ while the switch is on, then a step up to $I_{L,pk} - I_{out}$ that ramps down. The two limiting forms are</p>
$$\\Delta V_C = \\frac{I_{out}D}{f_{sw}C_{out}}\\ \\text{(SLVA372 eq. 9)},\\qquad \\Delta V_{ESR} = R_{ESR}\\Big(\\frac{I_{out}}{1-D} + \\frac{\\Delta I_L}{2}\\Big)\\ \\text{(eq. 10)}$$
<p>Because the current steps, the ESR term is a square-ish wave in phase with the current while the charge term is a sawtooth lagging it; their sum is less than the two added. The page integrates $v = \\tfrac1C\\int i_C\\,dt + R_{ESR}\\,i_C$ exactly on each linear piece. The ESL of the capacitor adds spikes at the current steps; the <em>Switching Regulator Ripple</em> page models them. The input of a boost is the inductor itself, so $C_{in}$ only carries the triangular ripple: $\\Delta V_{in} \\approx \\Delta I_L/(8f_{sw}C_{in})$ plus $R_{ESR,in}\\Delta I_L$, and $I_{C_{in},rms} = \\Delta I_L/\\sqrt{12}$. The output capacitor carries $I_{C_{out},rms} \\approx I_{out}\\sqrt{D/(1-D)}$, far more than in a buck.</p>`,
    },
    {
      title: 'Right-half-plane zero',
      html: `<p>In CCM the boost’s control-to-output transfer function has a zero in the right half plane (Erickson & Maksimović §8.2):</p>
$$f_{RHP} = \\frac{(1-D)^2 R_{load}}{2\\pi L} = \\frac{V_{out}(1-D)^2}{2\\pi L\\, I_{out}}$$
<p>Raising the duty cycle to deliver more current first lowers the output, because the rectifier conducts for less of the cycle, so the loop must be slow: designers keep the crossover frequency below roughly a fifth to a third of $f_{RHP}$, evaluated at the lowest input voltage and the highest load. A smaller inductor raises $f_{RHP}$, which is one reason boost converters run at larger ripple ratios than bucks. In DCM the zero moves up to near the switching frequency and stops being a constraint.</p>`,
    },
    {
      title: 'Losses and efficiency',
      html: `<ul>
<li>Conduction: $I_{SW,rms}^2R_{SW}$, $I_{out}V_F$ for a diode or $I_{SR,rms}^2R_{SR}$ for a synchronous FET, $I_{L,rms}^2R_L$, and the capacitor terms $I_{rms}^2R_{ESR}$.</li>
<li>Switching: the switch commutates against $V_{out}+V_F$, about $\\tfrac12 V_{out}I(t_r+t_f)f_{sw}$ with turn-on at the valley and turn-off at the peak current (Erickson §4.3). A silicon diode adds a recovery loss of about $Q_{rr}V_{out}f_{sw}$ in CCM.</li>
<li>Gate drive $Q_gV_{drv}f_{sw}$ (Balogh, TI SLUA618), and the inductor core loss as you enter it from the maker’s tool.</li>
</ul>
<p>Not modelled: output-capacitance ($\\tfrac12C_{oss}V^2f$) loss, dead-time body-diode conduction and the controller’s supply current. The duty cycle uses the averaged conduction drops; the loss budget uses RMS currents, so the two agree to the ripple’s second order.</p>`,
    },
    {
      title: 'Solving for L, fsw or Cout',
      html: `<p>Click ◎ beside $L$, $f_{sw}$ or $C_{out}$ to make it the unknown. $L$ and $f_{sw}$ are found for the ripple ratio; $C_{out}$ for the peak-to-peak output ripple (click the green ripple box to type a target). One forward model is inverted numerically, so a solved value typed back in reproduces the target exactly, including the drops and DCM. The solved $L$ comes with the next E12 value and the ripple it gives. $C_{out}$ has no answer when $R_{ESR}I_{L,pk}$ alone exceeds the target.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Corners.</strong> Rate the switch, rectifier and inductor saturation current from the lowest input voltage and the current limit; check the ripple near $V_{in} = V_{out}/2$ or at the highest input.</li>
<li><strong>No short-circuit protection.</strong> A plain boost has a path from input to output through L and the diode even with the switch off; a shorted output is limited only by the input source. Use a load switch or a controller with output disconnect if that matters.</li>
<li><strong>Output capacitor.</strong> It carries the pulsed rectifier current: check its ripple-current rating, and the DC-bias loss of ceramics at the (high) output voltage.</li>
<li><strong>Layout.</strong> The hot loop is the switch, rectifier and output capacitor; keep it tight.</li>
<li><strong>High step-up.</strong> Above about 85 % duty the losses and the RHP zero get worse quickly; a tapped inductor, a cascaded stage or a flyback is usually better.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>B. Hauke, “Basic Calculation of a Boost Converter’s Power Stage,” Texas Instruments application report SLVA372 (rev. D).</li>
<li>R. W. Erickson, D. Maksimović, <em>Fundamentals of Power Electronics</em>, 2nd ed., Springer, 2001: ch. 2–3 (steady state and losses, boost with $R_L$), §4.3 (switching loss), ch. 5 (DCM), §8.2 (RHP zero).</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, ch. 7 (step-up converter, output ripple).</li>
<li>L. Balogh, “Fundamentals of MOSFET and IGBT Gate Driver Circuits,” Texas Instruments SLUA618.</li>
</ul>`,
    },
  ],
};
