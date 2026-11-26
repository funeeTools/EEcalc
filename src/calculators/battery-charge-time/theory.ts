import type { TheoryContent } from '@/core/calc/types';

const p = (...xs: string[]) => xs.map((x) => (x.startsWith('<') || x.startsWith('$$') ? x : `<p>${x}</p>`)).join('');

export const theory: TheoryContent = {
  intro: {
    title: 'Battery charge time',
    lead: 'Lithium and lead-acid cells charge at constant current until the cell reaches its voltage limit, then at constant voltage while the current tapers. NiMH and NiCd charge at constant current. The page models the taper with a first-order equivalent circuit, so the charge current, time and capacity are tied by one set of equations.',
  },
  sections: [
    {
      title: 'Constant-current phase',
      html: p(
        'The state of charge rises with the stored part of the charge (coulombic efficiency $\\eta_c$):',
        '$$\\frac{dSoC}{dt} = \\frac{\\eta_c\\,I}{C}, \\qquad t_{CC} = \\frac{(SoC_{cv}-SoC_0)\\,C}{\\eta_c\\,I}$$',
        'For NiMH/NiCd this is the whole charge, to the target SoC. The IEC 61951-2 rated charge is 0.1 It for 16 h (160 % in, η_c ≈ 62.5 %); makers quote 14–16 h at 0.1 C, and the preset η_c = 70 % gives 14.3 h. Use 62.5 % to reproduce the IEC charge. Fast charge needs −ΔV or dT/dt termination.',
      ),
    },
    {
      title: 'Constant-voltage taper',
      html: p(
        'The cell is modelled as an open-circuit voltage $V_{oc}(SoC)$, taken linear from $V_0$ at empty to $V_{CV}$ at full, behind an effective resistance $R$ (ohmic plus polarisation). During CC the terminal voltage is $V_{oc}+IR$; it reaches $V_{CV}$ when the remaining charge equals $IR$ worth of OCV. In CV the current is $(V_{CV}-V_{oc})/R$, so both decay exponentially:',
        '$$I(t) = I_0\\,e^{-t/\\tau}, \\qquad 1-SoC(t) = (1-SoC_{cv})\\,e^{-t/\\tau}, \\qquad \\tau = \\frac{R\\,C}{\\eta_c\\,(V_{CV}-V_0)}$$',
        '$$SoC_{cv} = 1 - \\frac{\\eta_c\\,I\\,\\tau}{C}, \\qquad t_{CV} = \\tau\\,\\ln\\frac{I_0}{I_{term}} \\;\\text{(to termination)}, \\qquad t_{CV} = \\tau\\,\\ln\\frac{1-SoC_{cv}}{1-SoC_T} \;\\text{(to a target)}$$',
        'The page takes $\\tau$ as the input because it is what a datasheet charge curve shows: if CV starts at $SoC_{cv}$ when charging at $r$ C, then $\\tau \\approx (1-SoC_{cv})/r$ hours. The model reproduces the familiar behaviour — the CV onset moves to lower SoC at higher current, the CV time grows only logarithmically, and charging faster than the taper allows saves no time — but real cells have a non-linear OCV (a plateau, steep ends) and diffusion time constants, so expect the times within roughly ±20 % unless $\\tau$ is fitted to the cell. Termination leaves $1-SoC_{end} = \\eta_c\\,I_{term}\\,\\tau/C$ uncharged.',
        'Lead-acid uses the same model for bulk (CC) and absorption (CV at 2.40–2.50 V/cell), then drops to float (2.25–2.30 V/cell); its effective $\\tau$ is hours because the charge reaction is slow.',
      ),
    },
    {
      title: 'Charger losses and energy',
      html: p(
        'A linear charger draws the battery current from $V_{in}$ and dissipates $(V_{in}-V_{bat})\\,I$ — worst at the start of CC, when the battery voltage is lowest. A switching charger draws $V_{bat}I/\\eta_{ch}$. The page integrates the input power, the power into the battery and the stored power ($V_{oc}\\,\\eta_c I$) over the profile, so the overall efficiency includes the charger, the resistive loss and the coulombic loss.',
      ),
    },
    {
      title: 'How solve-for works',
      html: p(
        'Charge time is the forward analysis. Charge current and capacity are found by Brent root finding on the same model. Time falls with current only until the CC phase disappears: above $I = (1-SoC_0)\\,C/(\\eta_c\\tau)$ the charge starts in CV and takes $\\tau\\ln(I_0/I_{term})$ whatever the setting, so a shorter time has no solution. On that flat stretch the page reports the smallest current (or largest capacity) that achieves the time.',
      ),
    },
    {
      title: 'Practical notes',
      html: '<ul><li>Do not charge Li-ion below 0 °C, and reduce the current below about 10 °C (lithium plating); most chargers enforce this with a thermistor (JEITA).</li><li>Termination: C/10 to C/20 for Li-ion. Stopping at 80–90 % SoC (or a lower V_CV) greatly extends cycle life and skips most of the CV time.</li><li>Linear chargers fold back their current when hot, so the real time can be longer than computed.</li><li>Lead-acid should not stay at absorption voltage: switch to float, and compensate the voltage for temperature (about −3 to −5 mV/°C per cell).</li></ul>',
    },
    {
      title: 'References',
      html: '<ol><li>G. L. Plett, <i>Battery Management Systems, Vol. I: Battery Modeling</i>, Artech House, 2015 — equivalent-circuit (OCV + R) model.</li><li>D. Linden, T. B. Reddy, <i>Handbook of Batteries</i>, 4th ed., McGraw-Hill, 2011 — charge methods and efficiency by chemistry.</li><li>IEC 61951-1/-2 (NiCd/NiMH): 0.1 C, 16 h rated charge. IEC 61960-3 (Li-ion).</li><li>Yuasa NP series VRLA manual — cyclic 2.40–2.50 V/cell, float 2.25–2.30 V/cell, initial current ≤ 0.25 C.</li><li>TI bq24040 and Microchip MCP73831 datasheets — CC/CV linear chargers, termination current, thermal regulation.</li></ol>',
    },
  ],
};
