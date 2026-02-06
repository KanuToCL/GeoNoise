/**
 * About Modal Module
 *
 * Handles the about/help modal and related UI.
 */

// KaTeX auto-render function (loaded from CDN)
declare function renderMathInElement(
  element: HTMLElement,
  options?: {
    delimiters?: Array<{ left: string; right: string; display: boolean }>;
    throwOnError?: boolean;
  }
): void;

// =============================================================================
// TYPES
// =============================================================================

/** About modal tab IDs */
export type AboutTab = 'current' | 'physics' | 'shortcuts' | 'credits';

// =============================================================================
// STATE
// =============================================================================

let aboutOpen = false;

// =============================================================================
// GETTERS
// =============================================================================

export function isAboutOpen(): boolean {
  return aboutOpen;
}

// =============================================================================
// MODAL OPERATIONS
// =============================================================================

/**
 * Open the about modal.
 */
export function openAbout(
  modal: HTMLElement | null,
  closeButton: HTMLElement | null,
  setTab: (tab: string) => void
): void {
  if (!modal) return;

  aboutOpen = true;
  setTab('current');
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  closeButton?.focus();

  // Re-render KaTeX equations now that modal is visible
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(modal, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
      ],
      throwOnError: false,
    });
  }
}

/**
 * Close the about modal.
 */
export function closeAbout(modal: HTMLElement | null): void {
  if (!modal) return;

  aboutOpen = false;
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
}

/**
 * Set the active tab in the about modal.
 */
export function setAboutTab(
  tabId: string,
  tabs: HTMLButtonElement[],
  panels: HTMLDivElement[]
): void {
  tabs.forEach((tab) => {
    const isActive = tab.dataset.aboutTab === tabId;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });

  panels.forEach((panel) => {
    const isActive = panel.dataset.aboutPanel === tabId;
    panel.classList.toggle('is-active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });
}

/**
 * Wire the about modal event listeners.
 */
export function wireAboutModal(
  modal: HTMLElement | null,
  openButton: HTMLElement | null,
  closeButton: HTMLElement | null,
  tabs: HTMLButtonElement[],
  panels: HTMLDivElement[],
  onWireCollapsible?: () => void,
  onWireAuthor?: () => void
): void {
  if (!modal) return;

  const setTab = (tabId: string) => setAboutTab(tabId, tabs, panels);

  openButton?.addEventListener('click', () => openAbout(modal, closeButton, setTab));
  closeButton?.addEventListener('click', () => closeAbout(modal));

  if (tabs.length && panels.length) {
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.aboutTab ?? 'current';
        setTab(tabId);
      });
    });
  }

  modal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-modal-close]')) {
      closeAbout(modal);
    }
  });

  // Wire collapsible physics sections
  onWireCollapsible?.();

  // Wire author modal
  onWireAuthor?.();
}

// =============================================================================
// COLLAPSIBLE SECTIONS
// =============================================================================

/**
 * Wire collapsible accordion sections.
 */
export function wireCollapsibleSections(container?: HTMLElement | null): void {
  const root = container ?? document;
  const collapsibleSections = root.querySelectorAll<HTMLElement>('[data-collapsible]');
  const expandAllBtn = root.querySelector('#expandAllBtn') as HTMLButtonElement | null;

  if (!collapsibleSections.length) return;

  // Track expanded state
  let allExpanded = false;

  const updateExpandAllButton = () => {
    if (!expandAllBtn) return;
    const expandedCount = Array.from(collapsibleSections).filter((s) =>
      s.classList.contains('is-expanded')
    ).length;
    allExpanded = expandedCount === collapsibleSections.length;
    expandAllBtn.textContent = allExpanded ? 'Collapse All' : 'Expand All';
  };

  // Toggle individual section
  collapsibleSections.forEach((section) => {
    const header = section.querySelector('.collapsible-header');
    if (!header) return;

    header.addEventListener('click', () => {
      section.classList.toggle('is-expanded');
      updateExpandAllButton();
    });
  });

  // Expand/collapse all
  expandAllBtn?.addEventListener('click', () => {
    const shouldExpand = !allExpanded;
    collapsibleSections.forEach((section) => {
      section.classList.toggle('is-expanded', shouldExpand);
    });
    updateExpandAllButton();
  });
}

// =============================================================================
// AUTHOR MODAL
// =============================================================================

/**
 * Wire the author modal.
 */
export function wireAuthorModal(
  modal: HTMLElement | null,
  openButton: HTMLElement | null,
  closeButton: HTMLElement | null
): void {
  if (!modal) return;

  const open = () => {
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
  };

  openButton?.addEventListener('click', () => open());
  closeButton?.addEventListener('click', () => close());

  modal.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-modal-close]')) {
      close();
    }
  });
}
