/**
 * Collapsible Sections Module
 *
 * Functions for collapsible accordion sections in modals and panels.
 * Extracted from main.ts for modular architecture.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * DOM elements for collapsible sections
 */
export interface CollapsibleElements {
  /** All collapsible section containers */
  collapsibleSections: NodeListOf<HTMLElement>;
  /** Expand all / collapse all button */
  expandAllBtn: HTMLButtonElement | null;
}

// ============================================================================
// Aria / Accessibility
// ============================================================================

/**
 * Update ARIA attributes for a collapsible section
 *
 * @param section - Section element
 * @param isOpen - Whether the section is open
 */
export function updateCollapsibleAria(section: HTMLElement, isOpen: boolean): void {
  const header = section.querySelector('.collapsible-header');
  if (header) {
    header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

// ============================================================================
// Toggle Functions
// ============================================================================

/**
 * Toggle a collapsible section open/closed
 *
 * @param section - Section element to toggle
 */
export function toggleCollapsibleSection(section: HTMLElement): void {
  const isOpen = section.classList.contains('is-open');
  section.classList.toggle('is-open', !isOpen);
  updateCollapsibleAria(section, !isOpen);

  // Update expand all button text if needed
  const expandAllBtn = document.getElementById('expandAllBtn') as HTMLButtonElement | null;
  if (expandAllBtn) {
    const collapsibleSections = document.querySelectorAll<HTMLElement>('[data-collapsible]');
    const allOpen = Array.from(collapsibleSections).every((s) => s.classList.contains('is-open'));
    expandAllBtn.textContent = allOpen ? 'collapse all' : 'expand all';
  }
}

/**
 * Expand all collapsible sections
 *
 * @param sections - Sections to expand
 */
export function expandAllSections(sections: NodeListOf<HTMLElement> | HTMLElement[]): void {
  const sectionArray = Array.from(sections);
  sectionArray.forEach((section) => {
    section.classList.add('is-open');
    updateCollapsibleAria(section, true);
  });
}

/**
 * Collapse all collapsible sections
 *
 * @param sections - Sections to collapse
 */
export function collapseAllSections(sections: NodeListOf<HTMLElement> | HTMLElement[]): void {
  const sectionArray = Array.from(sections);
  sectionArray.forEach((section) => {
    section.classList.remove('is-open');
    updateCollapsibleAria(section, false);
  });
}

/**
 * Check if all sections are currently open
 *
 * @param sections - Sections to check
 * @returns true if all sections are open
 */
export function areAllSectionsOpen(sections: NodeListOf<HTMLElement> | HTMLElement[]): boolean {
  return Array.from(sections).every((s) => s.classList.contains('is-open'));
}

// ============================================================================
// Wiring Functions
// ============================================================================

/**
 * Sets up collapsible accordion sections.
 * Each section can be expanded/collapsed by clicking its header.
 *
 * @param elements - DOM elements for collapsible sections
 */
export function wireCollapsibleSections(elements: CollapsibleElements): void {
  const { collapsibleSections, expandAllBtn } = elements;

  if (!collapsibleSections.length) return;

  // Toggle individual section
  collapsibleSections.forEach((section) => {
    const header = section.querySelector('.collapsible-header');
    if (!header) return;

    header.addEventListener('click', () => {
      toggleCollapsibleSection(section);
    });

    // Keyboard support
    header.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
        e.preventDefault();
        toggleCollapsibleSection(section);
      }
    });
  });

  // Expand all / collapse all button
  if (expandAllBtn) {
    expandAllBtn.addEventListener('click', () => {
      const allOpen = areAllSectionsOpen(collapsibleSections);

      if (allOpen) {
        // Collapse all
        collapseAllSections(collapsibleSections);
        expandAllBtn.textContent = 'expand all';
      } else {
        // Expand all
        expandAllSections(collapsibleSections);
        expandAllBtn.textContent = 'collapse all';
      }
    });
  }
}

/**
 * Query DOM for collapsible elements
 *
 * Helper function to build CollapsibleElements from the DOM.
 *
 * @returns CollapsibleElements from DOM queries
 */
export function queryCollapsibleElements(): CollapsibleElements {
  return {
    collapsibleSections: document.querySelectorAll<HTMLElement>('[data-collapsible]'),
    expandAllBtn: document.getElementById('expandAllBtn') as HTMLButtonElement | null,
  };
}
