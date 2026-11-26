/**
 * LED series resistor — equations only (pure, SI in/out).
 *
 * Constant-voltage LED model: each conducting LED drops its forward voltage Vf, so with n LEDs in series
 *   Vs = n·Vf + I·R   →   R = (Vs − n·Vf)/I,   I = (Vs − n·Vf)/R.
 * (Kirchhoff's voltage law; Horowitz & Hill, The Art of Electronics 3e, ch. 1 and ch. 12 on LED indicators.
 * The constant-Vf approximation ignores the LED's small dynamic resistance, which lowers I slightly.)
 */

/** Typical LED forward voltages from Kingbright WP7113-series (5 mm T-1¾) datasheets. Visible parts are labelled by dominant wavelength, the IR part by peak wavelength (as in their datasheets). */
export interface LedPreset {
  /** Typical Vf at the datasheet test current */
  vf: number;
  /** Maximum Vf at the test current */
  vfMax: number;
  /** Datasheet test current for Vf */
  iTest: number;
  /** Absolute maximum DC forward current */
  iMax: number;
  part: string;
}

export const LED_PRESETS: Record<string, LedPreset | null> = {
  Custom: null,
  'Red 617 nm (GaAsP)': { vf: 1.9, vfMax: 2.3, iTest: 10e-3, iMax: 30e-3, part: 'Kingbright WP7113ID' },
  'Hyper red 630 nm (AlGaInP)': { vf: 1.95, vfMax: 2.5, iTest: 20e-3, iMax: 30e-3, part: 'Kingbright WP7113SURCK' },
  'Yellow 588 nm': { vf: 1.95, vfMax: 2.4, iTest: 10e-3, iMax: 30e-3, part: 'Kingbright WP7113YD' },
  'Green 568 nm (GaP)': { vf: 2.0, vfMax: 2.4, iTest: 10e-3, iMax: 25e-3, part: 'Kingbright WP7113GD' },
  'Green 525 nm (InGaN)': { vf: 3.3, vfMax: 4.1, iTest: 20e-3, iMax: 25e-3, part: 'Kingbright WP7113ZGC' },
  'Blue 465 nm (InGaN)': { vf: 3.3, vfMax: 4.0, iTest: 20e-3, iMax: 30e-3, part: 'Kingbright WP7113QBC/D' },
  'White (InGaN + phosphor)': { vf: 3.3, vfMax: 4.0, iTest: 20e-3, iMax: 30e-3, part: 'Kingbright WP7113QWC/D' },
  'Infrared 880 nm peak': { vf: 1.3, vfMax: 1.6, iTest: 20e-3, iMax: 50e-3, part: 'Kingbright WP7113SF4C' },
};

/** Current through one string (0 when the supply cannot forward-bias the LEDs). */
export function ledCurrent(vs: number, n: number, vf: number, r: number): number {
  return Math.max(vs - n * vf, 0) / r;
}

export function ledResistor(vs: number, n: number, vf: number, i: number): number {
  return (vs - n * vf) / i;
}

export function supplyFor(n: number, vf: number, i: number, r: number): number {
  return n * vf + i * r;
}
