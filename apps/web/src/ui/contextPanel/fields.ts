/**
 * Context Panel Utilities
 *
 * Helper functions for creating form fields and UI elements in context panels.
 */

/** Create a field label with optional tooltip */
export function createFieldLabel(label: string, tooltipText?: string): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'field-label';
  const text = document.createElement('span');
  text.textContent = label;
  wrapper.appendChild(text);

  if (tooltipText) {
    const tooltip = document.createElement('span');
    tooltip.className = 'tooltip';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'tooltip-trigger ui-button';
    trigger.textContent = 'i';
    trigger.setAttribute('aria-label', `${label} info`);
    const content = document.createElement('span');
    content.className = 'tooltip-content';
    const note = document.createElement('span');
    note.className = 'tooltip-note';
    note.textContent = tooltipText;
    content.appendChild(note);
    tooltip.appendChild(trigger);
    tooltip.appendChild(content);
    wrapper.appendChild(tooltip);
  }

  return wrapper;
}

/** Create an inline field with label and number input */
export function createInlineField(
  label: string,
  value: number,
  onChange: (value: number) => void,
  tooltipText?: string
): HTMLElement {
  const field = document.createElement('label');
  field.className = 'source-field';
  const name = createFieldLabel(label, tooltipText);
  const input = document.createElement('input');
  input.type = 'number';
  input.classList.add('ui-inset');
  input.step = '0.1';
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  field.appendChild(name);
  field.appendChild(input);
  return field;
}

/** Create an input row for property editing */
export function createInputRow(
  label: string,
  value: number,
  onChange: (value: number) => void,
  tooltipText?: string
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'property-row';
  const labelEl = createFieldLabel(label, tooltipText);
  const input = document.createElement('input');
  input.type = 'number';
  input.classList.add('ui-inset');
  input.step = '0.1';
  input.value = value.toString();
  input.addEventListener('change', () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  row.appendChild(labelEl);
  row.appendChild(input);
  return row;
}

/** Create a text input row for property editing */
export function createTextInputRow(
  label: string,
  value: string,
  onChange: (value: string) => void,
  placeholder?: string
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'property-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'field-label';
  labelEl.textContent = label;
  const input = document.createElement('input');
  input.type = 'text';
  input.classList.add('ui-inset');
  input.value = value;
  if (placeholder) input.placeholder = placeholder;
  input.addEventListener('change', () => {
    onChange(input.value);
  });
  row.appendChild(labelEl);
  row.appendChild(input);
  return row;
}

/** Create a select dropdown row for property editing */
export function createSelectRow(
  label: string,
  value: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'property-row';
  const labelEl = document.createElement('span');
  labelEl.className = 'field-label';
  labelEl.textContent = label;
  const select = document.createElement('select');
  select.classList.add('ui-inset');
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === value) option.selected = true;
    select.appendChild(option);
  }
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  row.appendChild(labelEl);
  row.appendChild(select);
  return row;
}

/** Create a checkbox row for property editing */
export function createCheckboxRow(
  label: string,
  checked: boolean,
  onChange: (checked: boolean) => void
): HTMLElement {
  const row = document.createElement('label');
  row.className = 'property-row property-row--checkbox';
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = checked;
  input.addEventListener('change', () => {
    onChange(input.checked);
  });
  const labelEl = document.createElement('span');
  labelEl.className = 'field-label';
  labelEl.textContent = label;
  row.appendChild(input);
  row.appendChild(labelEl);
  return row;
}
