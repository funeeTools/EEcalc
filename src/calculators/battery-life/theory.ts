import type { TheoryContent } from '@/core/calc/types';

const p = (...xs: string[]) => xs.map((x) => (x.startsWith('<') || x.startsWith('$$') ? x : `<p>${x}</p>`)).join('');

export const theory: TheoryContent = {
  intro: {
    title: 'Battery life',
    lead: 'The runtime is the usable charge divided by the average drain. The page averages a duty-cycled load profile, refers it to the battery through the regulator, derates the rated capacity for depth of discharge, temperature, ageing and (for lead-acid) Peukert’s rate effect, and adds self-discharge as a steady leak.',
  },
  sections: [
    {
      title: 'Equations',
      html: p(
        'Average load current from phases with current $I_k$ and time share $D_k$:',
        '$$I_{load} = \\sum_k I_k\\,D_k$$',
        'Battery current: no regulator $I_{bat}=I_{load}$; linear regulator $I_{bat}=I_{load}+I_q$ (the pass element carries the load current); switching converter, by power balance at the nominal pack voltage,',
        '$$I_{bat} = \\frac{V_{load}\\,I_{load}}{\\eta\\,V_{bat}} + I_q$$',
        'Usable capacity and runtime:',
        '$$C_u = C\\cdot DoD\\cdot f_T\\cdot f_{age}\\cdot f_P, \\qquad I_{sd} = \\frac{C\\,r_{sd}}{\\text{month}}, \\qquad t = \\frac{C_u}{I_{bat}+I_{sd}}$$',
      ),
    },
    {
      title: 'Peukert correction',
      html: p(
        'Lead-acid cells give less charge at high current. Peukert’s empirical law, written with the rated capacity $C$ at the rated time $H$ (reference current $I_{ref}=C/H$):',
        '$$t = H\\left(\\frac{C}{I\\,H}\\right)^{k} \\;\\Longleftrightarrow\\; f_P = \\left(\\frac{I_{ref}}{I}\\right)^{k-1}$$',
        'Typical $k$ is 1.1–1.3 for VRLA/AGM batteries; fit it from two datasheet points as $k=\\ln(t_2/t_1)/\\ln(I_1/I_2)$. Below $I_{ref}$ the law would predict more than the rated capacity, which real cells give only partly, so the page uses $f_P=1$ there. The law is applied to the average current: a pulsed load costs somewhat more. For other chemistries leave $k=1$ and enter the datasheet capacity at your current.',
      ),
    },
    {
      title: 'Self-discharge and the long-sleep limit',
      html: p(
        'Self-discharge is taken as a constant share $r_{sd}$ of the rated capacity per month (30.44 days). With a µA sleep current it can dominate: as $C$ grows, the leak grows with it, so no capacity can beat $t_{max} = DoD\\,f_T\\,f_{age}\\cdot\\text{month}/r_{sd}$. Typical values at 20 °C: alkaline and lithium primary cells 1–3 % per year, Li-ion 1–3 % per month (protection circuit included), standard NiMH 15–30 % per month, low-self-discharge NiMH about 3–6 % per year (first-generation cells 15–20 %), VRLA lead-acid about 3 % per month. The rate roughly doubles every 10 °C.',
      ),
    },
    {
      title: 'How solve-for works',
      html: p(
        'Runtime is the forward analysis. Capacity and the maximum average load current are found by Brent root finding on the same runtime equation, so feeding the answer back reproduces the target. For the current budget, the profile’s own average is compared with the maximum and the page reports how much of the budget it uses.',
      ),
    },
    {
      title: 'Practical notes',
      html: p(
        '<ul><li>Rated capacity ends at the end-of-discharge voltage. If the regulator or a brown-out detector stops earlier, lower the usable depth: an LDO from one Li-ion cell to 3.3 V stops near 3.5 V and loses a good part of the charge (see the regulator-dropout page).</li><li>Coin cells are rated near 0.2 mA; mA radio pulses lower the voltage and the delivered capacity. Use the maker’s pulse curves and a buffer capacitor.</li><li>Alkaline capacity falls steeply with current: 2.5 Ah at 25 mA may be half that at 500 mA. Enter the datasheet capacity at your load.</li><li>Cold reduces capacity (temperature factor) and warmth increases self-discharge.</li><li>Leave margin: production spread and ageing typically eat 10–20 %.</li></ul>',
      ),
    },
    {
      title: 'References',
      html: p(
        '<ol><li>D. Linden, T. B. Reddy, <i>Handbook of Batteries</i>, 4th ed., McGraw-Hill, 2011 — capacity, rate and temperature effects, self-discharge by chemistry.</li><li>W. Peukert, “Über die Abhängigkeit der Kapazität von der Entladestromstärke bei Bleiakkumulatoren”, <i>Elektrotechnische Zeitschrift</i> 18, 1897.</li><li>IEC 61960-3 (Li-ion) and IEC 61951-2 (NiMH): rated capacity at 0.2 C.</li><li>Energizer CR2032 and E91 (AA) product datasheets; Yuasa NP7-12 datasheet (7 Ah at 20 h to 1.75 V/cell).</li><li>Microchip MCP1700 and TI TPS7A02 datasheets (quiescent current).</li></ol>',
      ),
    },
  ],
};
