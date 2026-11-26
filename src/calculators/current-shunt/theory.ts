import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'Current-sense shunts — how this calculator works',
    lead:
      'A shunt turns current into a small voltage, $V_{sh} = I R_{sh}$, which an amplifier scales into the ADC’s range. A larger shunt gives a cleaner signal but wastes power; a smaller one runs cool but lets amplifier offset dominate at low current. This page sizes the shunt (or the gain, or the range), lists standard values with their power and range limits, converts between current and ADC code, and adds up the datasheet error sources as a worst case and as a root-sum-square.',
  },
  sections: [
    {
      title: 'Sizing the shunt',
      html: `<p>The amplifier output at full-scale current should reach the end of the ADC span, less some headroom $h$ for output swing and tolerances:</p>
$$G\\,R_{sh}\\,I_{max} = (1-h)\\,V_{span},\\qquad V_{span} = \\begin{cases}V_{FS} & \\text{unidirectional}\\\\ V_{FS}/2 & \\text{bidirectional (output biased at } V_{FS}/2)\\end{cases}$$
<p>Each of $R_{sh}$, $I_{max}$ and $G$ follows exactly from the other two, so a solved value fed back reproduces the range. The output clips at $I_{clip} = V_{span}/(G R_{sh})$, slightly above $I_{max}$ by the headroom. The ADC code and the current per count are</p>
$$\\text{code} = \\frac{V_{0} + G R_{sh} I}{V_{FS}}\\,2^N,\\qquad I_{LSB} = \\frac{V_{FS}}{2^N\\,G\\,R_{sh}}$$
<p>with $V_0 = 0$ (unidirectional) or $V_{FS}/2$ (bidirectional). The integer code is the floor of this value, clamped to $0 … 2^N-1$. Reading the code back gives $I = (\\text{code}\\cdot V_{FS}/2^N - V_0)/(G R_{sh})$.</p>`,
    },
    {
      title: 'Power and self-heating',
      html: `<p>The shunt dissipates $P = I^2 R_{sh}$ (Joule heating), most at $I_{max}$. A common rule is to use a part rated for at least twice this, because a shunt at its rated power runs at its maximum element temperature and drifts by its TCR. When the shunt’s thermal resistance $\\theta_R$ is known (from its datasheet or derating curve), the page adds the self-heating $\\Delta T = P\\,\\theta_R$ to the ambient temperature for the TCR term. Without it, self-heating is left out and a note says so.</p>`,
    },
    {
      title: 'Error budget',
      html: `<p>Every datasheet maximum is referred to the reading as a relative error $e_i$. Voltage-type errors are divided by the shunt voltage, so they grow as the current falls:</p>
$$e_{os} = \\frac{V_{os}}{I R_{sh}},\\quad e_{CM} = \\frac{10^{-\\text{CMRR}/20}\\,|V_{cm}-V_{cm,test}|}{I R_{sh}},\\quad e_{PS} = \\frac{10^{-\\text{PSRR}/20}\\,|V_S-V_{S,test}|}{I R_{sh}}$$
<p>The CMRR and PSRR terms use the difference between the actual common-mode or supply voltage and the conditions where the datasheet specifies $V_{os}$. For high-side sensing the common-mode voltage is the bus voltage; for low-side it is about 0 V. Drift terms use $|T-25\\,°\\text{C}|$. Gain error, shunt tolerance, $\\text{TCR}\\cdot|T_R-25\\,°\\text{C}|$, the reference tolerance and half an LSB of the ADC are relative errors directly. The totals are</p>
$$e_{wc} = \\sum_i |e_i|,\\qquad e_{RSS} = \\sqrt{\\sum_i e_i^2}$$
<p>The worst case assumes every source sits at its limit with the same sign, which is guaranteed but pessimistic. The RSS assumes the sources are independent, which is more realistic for a production spread. This is the method in TI’s current-sensing seminar (SLAP178). Its worked example is an example on this page: 1 mΩ at 5 A with 1 mV offset gives 20 %, a 100 dB CMRR at 50 V against a 12 V test condition gives 7.6 %, a 100 dB PSRR at 30 V against 5 V gives 5 %, so 32.6 % worst case and 22.0 % RSS.</p>`,
    },
    {
      title: 'Solving on this page',
      html: `<p>Choose the unknown with ◎: the shunt for a full-scale current (the usual design question), the full-scale current of a given shunt, or the gain that fits a given shunt to a range. The measurement point can be given as a current (the page computes the ADC reading) or as a reading (click ◎ on the current to get the current from the code). The candidate table always lists standard values around the exact shunt for the full-scale current and gain: red rows clip below $I_{max}$ or exceed the rated power, yellow rows use less than half the headroom, less than half the span, or more than half the rated power.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li><strong>Kelvin connection.</strong> Below a few milliohms, solder joints and copper (about 0.5 mΩ per square of 1 oz copper) are comparable to the shunt. Use a 4-terminal shunt, or route the sense lines from the inner edges of the pads, and keep them as a tight pair to the amplifier.</li>
<li><strong>Low currents.</strong> Offset sets the floor: a 25 µV offset is 5 % of a 0.5 mV signal. Raise the shunt voltage, use a zero-drift amplifier, or calibrate the offset at zero current. Calibrating at one known current removes gain error and shunt tolerance as well.</li>
<li><strong>High-side or low-side.</strong> Low-side is simple and cheap but lifts the load’s ground and misses a load short to ground. High-side needs an amplifier whose common-mode range covers the bus and its transients, and its CMRR matters.</li>
<li><strong>PWM and motor phases.</strong> In-line motor-phase sensing sees large common-mode steps; pick an amplifier with enhanced PWM rejection and check its settling against the sampling instant.</li>
<li><strong>Filtering.</strong> A series resistor at each amplifier input with a differential capacitor forms a filter, but the resistors add gain error with the amplifier’s input bias current. Keep them small (tens of ohms) and check the amplifier datasheet.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>M. Lis, <em>Understanding Current Sensing Applications &amp; How to Choose the Right Device</em>, Texas Instruments seminar, SLAP178, 2019, slides 30–37 (error budget method and worked example).</li>
<li>Texas Instruments, <em>How to Get Started with Current Sense Amplifiers</em>, part 4: error sources, SSZTCG8, 2015.</li>
<li>IEC 60063:2015, <em>Preferred number series for resistors and capacitors</em>.</li>
</ul>`,
    },
  ],
};
