/**
 * Pure helpers of the demographic renderer.
 *
 * The `propsMap` cases mirror the server contract: the map is
 * `{ '<context dotted path>': '<prop name>' }`, exactly like `ui:props-map`
 * elsewhere in Reactory — with one addition, the prototype-pollution guard,
 * because the map is user-authored data that reaches a recursive object write.
 */
import { getPath, isSafePropsMapPath, resolvePropsMap } from '../propsMap';
import {
  coerceNumericInput,
  demographicControlId,
  formatDemographicDate,
  isDemographicValueType,
  normaliseFieldErrors,
  normaliseOptions,
  normaliseValueType,
  optionLabelFor,
  ordinalOf,
  selectRenderableDefinitions,
  setDemographicValue,
} from '../utils';
import { makeDefinition } from './testFixtures';

describe('resolvePropsMap', () => {
  const context = {
    definition: { key: 'gender', options: [{ key: 'female' }] },
    organization: { id: 'org-9' },
    user: null,
    value: 'female',
  };

  it('maps a nested context path onto a prop name', () => {
    expect(
      resolvePropsMap(context, {
        'definition.options': 'options',
        'organization.id': 'organizationId',
      }),
    ).toEqual({ options: context.definition.options, organizationId: 'org-9' });
  });

  it('omits a path that does not exist instead of sending undefined', () => {
    const resolved = resolvePropsMap(context, {
      'definition.missing.path': 'missing',
      'user.id': 'userId',
      'organization.id': 'organizationId',
    });

    expect(resolved).toEqual({ organizationId: 'org-9' });
    expect('missing' in resolved).toBe(false);
    expect('userId' in resolved).toBe(false);
  });

  it('supports a nested destination path', () => {
    expect(resolvePropsMap(context, { 'organization.id': 'config.organizationId' })).toEqual({
      config: { organizationId: 'org-9' },
    });
  });

  it('ignores non-string and blank destinations and non-object maps', () => {
    expect(resolvePropsMap(context, { 'organization.id': 5 } as any)).toEqual({});
    expect(resolvePropsMap(context, { 'organization.id': '   ' } as any)).toEqual({});
    expect(resolvePropsMap(context, null)).toEqual({});
    expect(resolvePropsMap(context, ['organization.id'] as any)).toEqual({});
  });

  it('reads a top-level and a dotted path', () => {
    expect(getPath(context, 'value')).toBe('female');
    expect(getPath(context, 'organization.id')).toBe('org-9');
    expect(getPath(context, 'organization.nope.deeper')).toBeUndefined();
    expect(getPath(context, '')).toBeUndefined();
  });

  it('stops descending through a non-object segment', () => {
    expect(getPath({ value: 'female' }, 'value.length')).toBeUndefined();
  });
});

describe('resolvePropsMap — prototype pollution guard', () => {
  it('rejects a poisoned destination path', () => {
    const resolved = resolvePropsMap(
      { organization: { id: 'org-9' } },
      { 'organization.id': '__proto__.polluted' },
    );

    expect(resolved).toEqual({});
    expect(({} as any).polluted).toBeUndefined();
  });

  it('rejects every dangerous segment in the destination, at any depth', () => {
    const poisoned = [
      '__proto__.polluted',
      'constructor.prototype.polluted',
      'config.prototype.polluted',
      'a.__proto__.b.polluted',
      'prototype',
      'constructor',
      '__proto__',
    ];

    poisoned.forEach((destination) => {
      expect(resolvePropsMap({ value: 'x' }, { value: destination })).toEqual({});
    });

    expect(({} as any).polluted).toBeUndefined();
    expect(Object.keys(Object.prototype)).toEqual(Object.keys(Object.prototype));
  });

  it('rejects a poisoned source path without reading the context', () => {
    const context = { value: 'x' };

    expect(resolvePropsMap(context, { '__proto__.value': 'leaked' })).toEqual({});
    expect(resolvePropsMap(context, { 'constructor.prototype.value': 'leaked' })).toEqual({});
  });

  it('still resolves the safe entries beside a poisoned one', () => {
    const resolved = resolvePropsMap(
      { value: 'x', organization: { id: 'org-9' } },
      {
        value: '__proto__.polluted',
        'organization.id': 'organizationId',
      },
    );

    expect(resolved).toEqual({ organizationId: 'org-9' });
    expect(({} as any).polluted).toBeUndefined();
  });

  it('exposes the predicate so a host can validate a user-authored map early', () => {
    expect(isSafePropsMapPath('organization.id')).toBe(true);
    expect(isSafePropsMapPath('a..b')).toBe(false);
    expect(isSafePropsMapPath('')).toBe(false);
    expect(isSafePropsMapPath(null)).toBe(false);
    expect(isSafePropsMapPath('__proto__')).toBe(false);
    expect(isSafePropsMapPath('constructor')).toBe(false);
    expect(isSafePropsMapPath('prototype')).toBe(false);
    expect(isSafePropsMapPath('a.prototype.b')).toBe(false);
  });
});

describe('selectRenderableDefinitions', () => {
  it('orders by ordinal and breaks ties by key', () => {
    const definitions = [
      makeDefinition({ key: 'charlie', ordinal: 20 }),
      makeDefinition({ key: 'alpha', ordinal: 10 }),
      makeDefinition({ key: 'bravo', ordinal: 10 }),
    ];

    expect(selectRenderableDefinitions(definitions).map((entry) => entry.key)).toEqual([
      'alpha',
      'bravo',
      'charlie',
    ]);
  });

  it('omits disabled and soft-deleted definitions, and treats a missing enabled flag as on', () => {
    const definitions = [
      makeDefinition({ key: 'on' }),
      makeDefinition({ key: 'off', enabled: false }),
      makeDefinition({ key: 'deleted', deleted: true }),
      makeDefinition({ key: 'unset', enabled: null }),
      makeDefinition({ key: '' }),
    ];

    expect(selectRenderableDefinitions(definitions).map((entry) => entry.key)).toEqual([
      'on',
      'unset',
    ]);
  });

  it('tolerates an absent list', () => {
    expect(selectRenderableDefinitions(null)).toEqual([]);
    expect(selectRenderableDefinitions(undefined)).toEqual([]);
  });

  it('treats a non-numeric ordinal as zero', () => {
    expect(ordinalOf({ ordinal: null })).toBe(0);
    expect(ordinalOf({ ordinal: undefined })).toBe(0);
    expect(ordinalOf({ ordinal: 7 })).toBe(7);
    expect(ordinalOf(null)).toBe(0);
  });
});

describe('normaliseOptions', () => {
  it('hides deprecated options that are not the current value', () => {
    const definition = makeDefinition();

    expect(normaliseOptions(definition, null).map((option) => option.key)).toEqual([
      'female',
      'male',
    ]);
    expect(normaliseOptions(definition, 'legacy').map((option) => option.key)).toEqual([
      'female',
      'male',
      'legacy',
    ]);
    expect(normaliseOptions(definition, ['legacy']).map((option) => option.key)).toContain(
      'legacy',
    );
  });

  it('falls back to the key when an option has no label and sorts by ordinal', () => {
    const definition = makeDefinition({
      options: [
        { key: 'b', label: null, ordinal: 2 },
        { key: 'a', label: 'A', ordinal: 1 },
      ],
    });

    expect(normaliseOptions(definition, null)).toEqual([
      { key: 'a', label: 'A' },
      { key: 'b', label: 'b' },
    ]);
  });

  it('drops malformed options and treats a blank label as missing', () => {
    const definition = makeDefinition({
      options: [
        { key: '', label: 'No key' },
        { key: 'ok', label: '   ' },
        null as any,
      ],
    });

    expect(normaliseOptions(definition, null)).toEqual([{ key: 'ok', label: 'ok' }]);
  });

  it('tolerates an absent option list', () => {
    expect(normaliseOptions({ options: null }, null)).toEqual([]);
    expect(normaliseOptions({ options: undefined }, null)).toEqual([]);
  });
});

describe('optionLabelFor', () => {
  it('resolves a label, falls back to the key, and handles nothing', () => {
    const definition = makeDefinition();

    expect(optionLabelFor(definition, 'female')).toBe('Female');
    expect(optionLabelFor(definition, 'not-an-option')).toBe('not-an-option');
    expect(optionLabelFor(definition, null)).toBe('');
    expect(optionLabelFor(definition, undefined)).toBe('');
  });

  it('falls back to the key when the matched option has a blank label', () => {
    expect(
      optionLabelFor({ options: [{ key: 'x', label: '  ' }] }, 'x'),
    ).toBe('x');
  });
});

describe('formatDemographicDate', () => {
  it('passes a string through and renders nothing for an empty value', () => {
    expect(formatDemographicDate('1990-05-01')).toBe('1990-05-01');
    expect(formatDemographicDate(null)).toBe('');
    expect(formatDemographicDate(undefined)).toBe('');
    expect(formatDemographicDate('')).toBe('');
  });

  it('formats a Date and a dayjs/moment-like object', () => {
    expect(formatDemographicDate(new Date('1990-05-01T00:00:00.000Z'))).toBe('1990-05-01');
    expect(formatDemographicDate({ format: () => '1990-05-01' })).toBe('1990-05-01');
  });

  it('falls back to String() when format() throws', () => {
    const broken = {
      format: () => {
        throw new Error('no locale');
      },
      toString: () => 'broken-date',
    };

    expect(formatDemographicDate(broken)).toBe('broken-date');
  });

  it('stringifies anything else', () => {
    expect(formatDemographicDate(20200501)).toBe('20200501');
  });
});

describe('coerceNumericInput', () => {
  it('clears on an empty value', () => {
    expect(coerceNumericInput('')).toBeNull();
  });

  it('emits a number for a parseable value', () => {
    expect(coerceNumericInput('42')).toBe(42);
    expect(coerceNumericInput('4.5')).toBe(4.5);
    expect(coerceNumericInput('-3')).toBe(-3);
  });

  it('keeps unparseable text instead of emitting NaN', () => {
    expect(coerceNumericInput('1e')).toBe('1e');
    expect(coerceNumericInput('12abc')).toBe('12abc');
    expect(Number.isNaN(coerceNumericInput('abc') as any)).toBe(false);
  });
});

describe('normaliseFieldErrors', () => {
  it('flattens a single message, a list and an empty value', () => {
    expect(normaliseFieldErrors('Nope')).toEqual(['Nope']);
    expect(normaliseFieldErrors(['A', 'B'])).toEqual(['A', 'B']);
    expect(normaliseFieldErrors(undefined)).toEqual([]);
    expect(normaliseFieldErrors(null)).toEqual([]);
    expect(normaliseFieldErrors(['', '  '])).toEqual([]);
  });

  it('drops a non-string entry', () => {
    expect(normaliseFieldErrors([42 as any, 'kept'])).toEqual(['kept']);
  });
});

describe('value-type helpers', () => {
  it('keeps a documented type and degrades an unknown one to string', () => {
    expect(normaliseValueType('multi-enum')).toBe('multi-enum');
    expect(normaliseValueType('uuid')).toBe('string');
    expect(normaliseValueType(undefined)).toBe('string');
  });

  it('recognises exactly the nine documented types', () => {
    ['string', 'number', 'boolean', 'date', 'enum', 'multi-enum', 'object', 'array', 'reference'].forEach(
      (type) => expect(isDemographicValueType(type)).toBe(true),
    );
    expect(isDemographicValueType('uuid')).toBe(false);
    expect(isDemographicValueType(7)).toBe(false);
  });

  it('builds a stable control id', () => {
    expect(demographicControlId('gender')).toBe('demographic-field-gender');
  });
});

describe('setDemographicValue', () => {
  it('returns a new record and never mutates the input', () => {
    const current = { gender: 'female' };
    const next = setDemographicValue(current, 'age', 33);

    expect(next).toEqual({ gender: 'female', age: 33 });
    expect(current).toEqual({ gender: 'female' });
    expect(setDemographicValue(null, 'age', 1)).toEqual({ age: 1 });
  });
});
