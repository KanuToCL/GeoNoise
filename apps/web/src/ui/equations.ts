/**
 * Equations UI Module
 *
 * Functions for equation collapsibles and KaTeX rendering.
 * Extracted from main.ts for modular architecture.
 */

// KaTeX auto-render function (loaded from CDN)
declare function renderMathInElement(
  element: HTMLElement,
  options?: {
    delimiters?: Array<{ left: string; right: string; display: boolean }>;
    throwOnError?: boolean;
  }
): void;

// ============================================================================
// Types
// ============================================================================

/**
 * DOM elements for equation display and controls
 */
export interface EquationElements {
  /** Ground model equation display element */
  groundModelEquation: HTMLDivElement | null;
  /** Impedance equation display element */
  impedanceEquation: HTMLDivElement | null;
  /** Ground model dropdown */
  propagationGroundModel: HTMLSelectElement | null;
  /** Spreading mode dropdown */
  propagationSpreading: HTMLSelectElement | null;
  /** Impedance model dropdown */
  probeImpedanceModel: HTMLSelectElement | null;
  /** Mixed ground interpolation model dropdown */
  propagationGroundMixedSigmaModel: HTMLSelectElement | null;
  /** Barrier side diffraction dropdown */
  propagationBarrierSideDiffraction: HTMLSelectElement | null;
  /** Atmospheric absorption dropdown */
  propagationAbsorption: HTMLSelectElement | null;
}

// ============================================================================
// KaTeX Rendering
// ============================================================================

/**
 * Re-render KaTeX for a specific element after content change.
 * Uses the global renderMathInElement from KaTeX auto-render.
 *
 * @param element - Element containing LaTeX markup
 */
export function rerenderKatex(element: HTMLElement): void {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }
}

// ============================================================================
// Equation Update Functions
// ============================================================================

/**
 * Update ground model equation based on dropdown value
 */
export function updateGroundModelEquation(elements: Pick<EquationElements, 'groundModelEquation' | 'propagationGroundModel'>): void {
  const { groundModelEquation, propagationGroundModel } = elements;
  if (!groundModelEquation) return;

  const model = propagationGroundModel?.value ?? 'twoRayPhasor';

  if (model === 'legacy') {
    groundModelEquation.textContent = '$A_{gr} = A_s + A_r + A_m$';
  } else {
    groundModelEquation.textContent = '$A_{gr} = -20\\log_{10}|1 + \\Gamma \\cdot (r_1/r_2) \\cdot e^{jk(r_2-r_1)}|$';
  }
  rerenderKatex(groundModelEquation);
}

/**
 * Update spreading equation based on dropdown value
 */
export function updateSpreadingEquation(elements: Pick<EquationElements, 'propagationSpreading'>): void {
  const { propagationSpreading } = elements;
  const collapsible = document.querySelector('[data-equation="spreading"]') as HTMLDivElement | null;
  if (!collapsible) return;

  const mainEq = collapsible.querySelector('.equation-main') as HTMLDivElement | null;
  if (!mainEq) return;

  const spreading = propagationSpreading?.value ?? 'spherical';

  if (spreading === 'cylindrical') {
    mainEq.textContent = '$A_{div} = 10\\log_{10}(d) + 10\\log_{10}(2\\pi)$';
  } else {
    mainEq.textContent = '$A_{div} = 20\\log_{10}(d) + 10\\log_{10}(4\\pi)$';
  }
  rerenderKatex(mainEq);
}

/**
 * Update impedance equation based on dropdown value
 */
export function updateImpedanceEquation(elements: Pick<EquationElements, 'impedanceEquation' | 'probeImpedanceModel'>): void {
  const { impedanceEquation, probeImpedanceModel } = elements;
  if (!impedanceEquation) return;

  const model = probeImpedanceModel?.value ?? 'delanyBazleyMiki';

  if (model === 'delanyBazley') {
    impedanceEquation.textContent = '$Z_n = 1 + 9.08(f/\\sigma)^{-0.75} - j \\cdot 11.9(f/\\sigma)^{-0.73}$';
  } else {
    impedanceEquation.textContent = '$Z_n = 1 + 9.08(f/\\sigma)^{-0.75} - j \\cdot 11.9(f/\\sigma)^{-0.73}$';
  }
  rerenderKatex(impedanceEquation);
}

/**
 * Update mixed interpolation equation based on dropdown value
 */
export function updateMixedInterpEquation(elements: Pick<EquationElements, 'propagationGroundMixedSigmaModel'>): void {
  const { propagationGroundMixedSigmaModel } = elements;
  const mixedInterpEquation = document.querySelector('#mixedInterpEquation') as HTMLDivElement | null;
  if (!mixedInterpEquation) return;

  const model = propagationGroundMixedSigmaModel?.value ?? 'iso9613';

  if (model === 'logarithmic') {
    mixedInterpEquation.textContent = '$\\sigma_{eff} = \\sigma_{soft}^G \\times \\sigma_{hard}^{1-G}$';
  } else {
    mixedInterpEquation.textContent = '$\\sigma_{eff} = \\sigma_{soft} / G$';
  }
  rerenderKatex(mixedInterpEquation);
}

/**
 * Update side diffraction equation based on dropdown value
 */
export function updateSideDiffractionEquation(elements: Pick<EquationElements, 'propagationBarrierSideDiffraction'>): void {
  const { propagationBarrierSideDiffraction } = elements;
  const sideDiffractionEquation = document.querySelector('#sideDiffractionEquation') as HTMLDivElement | null;
  if (!sideDiffractionEquation) return;

  const mode = propagationBarrierSideDiffraction?.value ?? 'auto';

  if (mode === 'off') {
    sideDiffractionEquation.textContent = '$\\delta = A + B - d_{direct}$';
  } else {
    sideDiffractionEquation.textContent = '$\\delta = \\min(\\delta_{top}, \\delta_{left}, \\delta_{right})$';
  }
  rerenderKatex(sideDiffractionEquation);
}

/**
 * Update atmospheric absorption equation based on dropdown value
 */
export function updateAtmAbsorptionEquation(elements: Pick<EquationElements, 'propagationAbsorption'>): void {
  const { propagationAbsorption } = elements;
  const atmAbsorptionEquation = document.querySelector('#atmAbsorptionEquation') as HTMLDivElement | null;
  if (!atmAbsorptionEquation) return;

  const model = propagationAbsorption?.value ?? 'iso9613';

  if (model === 'none') {
    atmAbsorptionEquation.textContent = '$A_{atm} = 0$';
  } else if (model === 'simple') {
    atmAbsorptionEquation.textContent = '$A_{atm} = \\alpha(f) \\cdot d / 1000$';
  } else {
    atmAbsorptionEquation.textContent = '$A_{atm} = \\alpha(f, T, RH, p) \\cdot d / 1000$';
  }
  rerenderKatex(atmAbsorptionEquation);
}

// ============================================================================
// Wiring Functions
// ============================================================================

/**
 * Wire up equation collapsible toggles and dropdown change listeners
 *
 * @param elements - DOM elements for equations
 */
export function wireEquationCollapsibles(elements: EquationElements): void {
  const collapsibles = document.querySelectorAll('.equation-collapsible') as NodeListOf<HTMLDivElement>;

  collapsibles.forEach((collapsible) => {
    const header = collapsible.querySelector('.equation-header') as HTMLDivElement | null;
    const content = collapsible.querySelector('.equation-content') as HTMLDivElement | null;

    if (!header || !content) return;

    const toggle = () => {
      const isExpanded = collapsible.classList.contains('is-expanded');
      if (isExpanded) {
        collapsible.classList.remove('is-expanded');
        content.hidden = true;
      } else {
        collapsible.classList.add('is-expanded');
        content.hidden = false;
        // Re-render KaTeX in the expanded content
        rerenderKatex(content);
      }
    };

    header.addEventListener('click', toggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  // Update ground model equation when dropdown changes
  elements.propagationGroundModel?.addEventListener('change', () => updateGroundModelEquation(elements));
  updateGroundModelEquation(elements);

  // Update spreading equation when dropdown changes
  elements.propagationSpreading?.addEventListener('change', () => updateSpreadingEquation(elements));
  updateSpreadingEquation(elements);

  // Update impedance equation when dropdown changes
  elements.probeImpedanceModel?.addEventListener('change', () => updateImpedanceEquation(elements));
  updateImpedanceEquation(elements);

  // Update mixed interpolation equation when dropdown changes
  elements.propagationGroundMixedSigmaModel?.addEventListener('change', () => updateMixedInterpEquation(elements));
  updateMixedInterpEquation(elements);

  // Update side diffraction equation when dropdown changes
  elements.propagationBarrierSideDiffraction?.addEventListener('change', () => updateSideDiffractionEquation(elements));
  updateSideDiffractionEquation(elements);

  // Update atmospheric absorption equation when dropdown changes
  elements.propagationAbsorption?.addEventListener('change', () => updateAtmAbsorptionEquation(elements));
  updateAtmAbsorptionEquation(elements);
}

/**
 * Update all equation displays to match current dropdown values.
 * Call this after programmatically changing dropdown values.
 *
 * @param elements - DOM elements for equations
 */
export function updateAllEquations(elements: EquationElements): void {
  updateGroundModelEquation(elements);
  updateSpreadingEquation(elements);
  updateImpedanceEquation(elements);
  updateMixedInterpEquation(elements);
  updateSideDiffractionEquation(elements);
  updateAtmAbsorptionEquation(elements);
}
