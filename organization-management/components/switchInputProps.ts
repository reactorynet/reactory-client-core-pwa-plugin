import type { InputHTMLAttributes } from 'react';

/**
 * `data-testid` (and an accessible name) for the real `<input>` inside a MUI
 * `Switch` or `Checkbox`.
 *
 * Why this exists: `TextField` accepts `inputProps` loosely enough to carry
 * `data-testid`, but `SwitchBase` types its `inputProps` as
 * `React.InputHTMLAttributes<HTMLInputElement>`, which has no index signature and
 * therefore rejects `data-*` keys in an object literal.
 *
 * The attribute has to land on the `<input>` — that is the element a test clicks
 * and the element an assistive technology announces as the checkbox — so the
 * object is built here, once, and cast at the boundary instead of scattering
 * `as any` through the pane.
 */
export const switchInputProps = (
  testId: string,
  ariaLabel?: string,
): InputHTMLAttributes<HTMLInputElement> =>
  ({
    'data-testid': testId,
    ...(ariaLabel ? { 'aria-label': ariaLabel } : {}),
  }) as unknown as InputHTMLAttributes<HTMLInputElement>;

export default switchInputProps;
