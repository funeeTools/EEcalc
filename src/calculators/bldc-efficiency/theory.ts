import type { TheoryContent } from '@/core/calc/types';

export const theory: TheoryContent = {
  intro: {
    title: 'BLDC / PMSM efficiency — how this calculator works',
    lead:
      'Electrical power from the DC bus passes through the inverter and the motor to the shaft, and each stage loses some of it: conduction and switching loss in the transistors, copper loss in the winding, iron loss in the laminations, and friction in the bearings. This page computes every term at one speed and torque, gives the motor, inverter and system efficiency, finds the best-efficiency torque at that speed and the top speed the bus voltage allows, and draws the efficiency over the torque–speed plane.',
  },
  sections: [
    {
      title: 'Current convention and copper loss',
      html: `<p>A torque constant only means something together with the current it refers to. This page uses the convention of the chosen commutation:</p>
<ul>
<li><strong>Sinusoidal (FOC, $i_d = 0$):</strong> $I$ is the phase current RMS and $T_{em} = K_t I$, with $K_t = 3E_{ph,rms}/\\omega$. For a wye winding $R_{ph} = R_{LL}/2$, so $P_{Cu} = 3I^2R_{ph} = 1.5\\,I^2R_{LL}$.</li>
<li><strong>Block (six-step):</strong> two phases carry the DC-link current $I$ in series, $T_{em} = K_tI$ and $P_{Cu} = I^2R_{LL}$. This is the convention of block-commutated motor datasheets and of hobby $K_v$ ratings ($K_t = 1/K_v$ in SI units).</li>
</ul>
<p>The electromagnetic torque covers the shaft torque plus the speed-dependent losses expressed as torques: $T_{em} = T + (P_{Fe} + P_{fw})/\\omega$. The resistance is scaled to the winding temperature with copper’s 0.393 %/K.</p>`,
    },
    {
      title: 'Iron loss and friction',
      html: `<p>In a permanent-magnet machine the magnets set the flux density in the core, so its amplitude hardly changes with load. Bertotti’s loss separation then reduces to a frequency dependence: hysteresis loss is proportional to $f$ and classical eddy-current loss to $f^2$. With the iron loss $P_{Fe,ref}$ at a reference speed and its hysteresis share $h$:</p>
$$P_{Fe}(n) = P_{Fe,ref}\\left[h\\frac{n}{n_{ref}} + (1-h)\\left(\\frac{n}{n_{ref}}\\right)^2\\right]$$
<p>Mechanical loss is a constant (Coulomb) friction torque plus viscous damping: $P_{fw} = T_f\\,\\omega + B\\,\\omega^2$. If only a no-load test is available, the no-load current $I_0$ at speed $n_0$ gives the total iron and friction loss $P_0 = K_tI_0\\omega_0$, which is scaled with the same linear-plus-square law using its eddy share $e$. With $e = 0$ this is the constant loss torque $K_tI_0$ of the classic DC-motor model.</p>`,
    },
    {
      title: 'Inverter losses',
      html: `<p>MOSFET conduction loss is $R_{DS(on)}I^2$ per conducting switch. Block commutation always has one high-side and one low-side switch in the path ($2I^2R_{DS}$). A sinusoidal three-phase bridge has one switch per phase conducting that phase’s current ($3I_{rms}^2R_{DS}$). Synchronous rectification is assumed, so freewheeling also goes through the MOSFET channel.</p>
<p>Switching loss uses the linearised hard-switching estimate $\\tfrac12V_{dc}I_{sw}f_{sw}(t_r+t_f)$ per switching leg. Block commutation chops the DC current in one leg. A sinusoidal drive switches all three legs, each at its instantaneous current, whose mean magnitude is $(2\\sqrt2/\\pi)I_{rms}$. A fixed controller overhead covers gate drive and logic.</p>`,
    },
    {
      title: 'Efficiencies and the voltage limit',
      html: `$$\\eta_{motor} = \\frac{T\\omega}{T\\omega + P_{Cu} + P_{Fe} + P_{fw}},\\qquad \\eta_{inv} = \\frac{P_{motor,in}}{P_{dc}},\\qquad \\eta = \\eta_{motor}\\,\\eta_{inv}$$
<p>At a fixed speed the efficiency peaks at the torque where the losses that grow with $I^2$ roughly equal the fixed ones. Below it, iron loss and friction dominate; above it, copper loss does. The page finds this torque by a golden-section search.</p>
<p>The inverter must supply the back-EMF plus the resistive (and, for sinusoidal drive, inductive) drop. Block commutation needs $V_{dc} \\ge K_t\\omega + I(R_{LL}+2R_{DS})$. A sinusoidal drive needs the phase voltage $|E + (R_{ph}+R_{DS})I + j\\omega_eL_{ph}I| \\le V_{dc}/\\sqrt6$ (RMS, space-vector modulation), with $E = K_t\\omega/3$ and $\\omega_e = p\\,\\omega$. The top speed at a torque is the root of this equality (Brent’s method). Field weakening ($i_d < 0$) can go faster but is not modelled.</p>`,
    },
    {
      title: 'Solving on this page',
      html: `<p>Pick the unknown with ◎. <strong>Current</strong> (default): the current and all losses for a given torque and speed. <strong>Torque</strong>: what a given current delivers at the shaft, $T = K_tI - T_{loss}(\\omega)$, which is exact. <strong>Speed</strong>: the highest speed the bus reaches at the given torque. All three use the one forward loss model, so a solved value fed back reproduces the input.</p>`,
    },
    {
      title: 'Practical design notes',
      html: `<ul>
<li>Datasheet efficiency is usually at the nominal point with a warm winding. Set the winding temperature to 80–120 °C for a realistic continuous rating.</li>
<li>Iron loss data vary widely. A spin-down or no-load test at two speeds separates the linear (hysteresis, friction) and square (eddy, windage) parts.</li>
<li>PWM current ripple adds copper and iron loss, especially in low-inductance slotless motors. Raise $f_{sw}$ or add phase inductance if the motor runs hotter than this budget predicts.</li>
<li>R_DS(on) roughly doubles from 25 °C to 125 °C junction temperature. Use the hot value.</li>
</ul>`,
    },
    {
      title: 'References',
      html: `<ul>
<li>D. G. Holmes, T. A. Lipo, <em>Pulse Width Modulation for Power Converters</em>, IEEE Press/Wiley, 2003, ch. 5 (space-vector modulation: line-to-line peak up to V_dc).</li>
<li>R. Krishnan, <em>Permanent Magnet Synchronous and Brushless DC Motor Drives</em>, CRC Press, 2010, ch. 2 (machine equations), ch. 9–10 (PMSM and BLDC drives, losses and efficiency).</li>
<li>G. Bertotti, “General properties of power losses in soft ferromagnetic materials”, <em>IEEE Trans. Magnetics</em> 24(1), 1988, 621–630.</li>
<li>N. Mohan, T. M. Undeland, W. P. Robbins, <em>Power Electronics: Converters, Applications and Design</em>, 3rd ed., Wiley, 2003, §2-3 (switching losses), ch. 8 (three-phase inverters, linear modulation range).</li>
<li>D. Graovac, M. Pürschel, A. Kiep, <em>MOSFET Power Losses Calculation Using the Data-Sheet Parameters</em>, Infineon application note, 2006.</li>
<li>maxon motor, <em>Key information — maxon motor data and formulae</em> (block-commutated data convention; $\\eta_{max} = (1-\\sqrt{I_0/I_A})^2$, reproduced by an example and the tests).</li>
</ul>`,
    },
  ],
};
