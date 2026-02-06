/**
 * UI Modals Module Barrel Exports
 *
 * Re-exports all modal-related UI modules from a single entry point.
 */

export {
  type AboutTab,
  isAboutOpen,
  openAbout,
  closeAbout,
  setAboutTab,
  wireAboutModal,
  wireCollapsibleSections,
  wireAuthorModal,
} from './about.js';
