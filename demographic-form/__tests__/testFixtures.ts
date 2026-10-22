import type { DemographicDefinition } from '../types';

/**
 * Fixtures and a stubbed Reactory SDK for the demographic form suites.
 *
 * Not named `*.test.*`, so Jest's `testMatch` does not run it as a suite.
 */

/** A definition with every field the renderer reads, overridable per test. */
export const makeDefinition = (
  overrides: Partial<DemographicDefinition> = {},
): DemographicDefinition => ({
  id: 'def-1',
  key: 'gender',
  title: 'Gender',
  valueType: 'enum',
  enabled: true,
  ordinal: 0,
  required: false,
  options: [
    { key: 'female', label: 'Female', ordinal: 1 },
    { key: 'male', label: 'Male', ordinal: 2 },
    { key: 'legacy', label: 'Legacy value', ordinal: 3, deprecated: true },
  ],
  ...overrides,
});

/** A many-valued enum definition (uses the deprecated-aware option filter). */
export const makeMultiEnumDefinition = (
  overrides: Partial<DemographicDefinition> = {},
): DemographicDefinition =>
  makeDefinition({
    key: 'languages',
    title: 'Languages',
    valueType: 'multi-enum',
    ordinal: 1,
    options: [
      { key: 'en', label: 'English', ordinal: 1 },
      { key: 'af', label: 'Afrikaans', ordinal: 2 },
      { key: 'zu', label: 'Zulu', ordinal: 3 },
    ],
    ...overrides,
  });

/**
 * Stubbed Reactory SDK.
 *
 * `getComponent` is the only surface the renderer uses to resolve a bound FQN,
 * so the stub keys straight off it — the same boundary the real registry exposes.
 */
export const makeReactory = (components: Record<string, any> = {}) => ({
  getComponent: jest.fn((fqn: string) => components[fqn] || null),
  i18n: undefined as any,
  log: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
});

/** A registry whose `getComponent` throws, to prove a broken loader cannot crash the form. */
export const makeThrowingReactory = () => ({
  getComponent: jest.fn(() => {
    throw new Error('registry exploded');
  }),
  i18n: undefined as any,
  log: jest.fn(),
  warning: jest.fn(),
  error: jest.fn(),
});
