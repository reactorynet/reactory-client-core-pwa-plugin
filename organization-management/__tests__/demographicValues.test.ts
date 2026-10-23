/**
 * @jest-environment jsdom
 *
 * Formatting and CSV import helpers for the demographics values pane (ORG-033).
 *
 * These are the parts a table cell and an import preview depend on, so they are
 * tested directly rather than through ten rendered permutations: readable
 * multi-valued text, member resolution, export columns, and the per-row
 * validation that keeps an invalid CSV row out of the bulk mutation.
 */
import { parseCsv } from '../demographicCsv';
import {
  IMPORT_TARGET_IGNORE,
  IMPORT_TARGET_USER,
  buildDemographicCsv,
  buildImportPreview,
  buildMemberDirectory,
  coerceImportCell,
  describeUser,
  formatDemographicValue,
  importRowToInputs,
  inferImportMapping,
  resolveUserId,
} from '../demographicValues';
import { makeTranslator } from '../i18n';
import {
  baseDemographicDefinitions,
  demographicValueFixtures,
  makeDemographicDefinition,
  makeDemographicValue,
  makeOrganizationMember,
} from './testFixtures';

const t = makeTranslator({});

const definitions = () => [
  ...baseDemographicDefinitions(),
  makeDemographicDefinition({
    id: 'def-5',
    key: 'language',
    title: 'Language',
    category: 'personal',
    valueType: 'multi-enum',
    multiValued: false,
    options: [
      { key: 'English', label: 'English', ordinal: 0, deprecated: false },
      { key: 'French', label: 'French', ordinal: 1, deprecated: false },
    ],
    ordinal: 4,
  }),
];

describe('formatDemographicValue', () => {
  const language = makeDemographicDefinition({
    key: 'language',
    title: 'Language',
    valueType: 'multi-enum',
    options: [
      { key: 'English', label: 'English', ordinal: 0, deprecated: false },
      { key: 'French', label: 'French', ordinal: 1, deprecated: false },
    ],
  });

  it('renders a multi-valued definition as a readable list, not JSON', () => {
    const text = formatDemographicValue(t, language, ['English', 'French']);

    expect(text).toBe('English, French');
    expect(text).not.toContain('[');
    expect(text).not.toContain('"');
  });

  it('renders an enum option label rather than its key', () => {
    expect(
      formatDemographicValue(t, makeDemographicDefinition(), 'female'),
    ).toBe('Female');
  });

  it('renders booleans and dates readably', () => {
    const booleanDefinition = makeDemographicDefinition({ key: 'remote', valueType: 'boolean' });
    const dateDefinition = makeDemographicDefinition({ key: 'dob', valueType: 'date' });

    expect(formatDemographicValue(t, booleanDefinition, true)).toBe('Yes');
    expect(formatDemographicValue(t, booleanDefinition, false)).toBe('No');
    expect(formatDemographicValue(t, dateDefinition, '1990-04-12')).toBe('1990-04-12');
  });

  it('falls back to the value-type snapshot when the definition is gone', () => {
    expect(formatDemographicValue(t, undefined, '1990-04-12', 'date')).toBe('1990-04-12');
  });

  it('renders an absent value as the catalogue em dash', () => {
    expect(formatDemographicValue(t, undefined, null)).toBe('—');
    expect(formatDemographicValue(t, language, [])).toBe('—');
  });
});

describe('member directory', () => {
  const members = [
    makeOrganizationMember({ id: 'member-1', userId: 'user-1' }),
    makeOrganizationMember({
      id: 'member-2',
      userId: 'user-2',
      user: { id: 'user-2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
      email: 'grace@example.com',
      firstName: 'Grace',
      lastName: 'Hopper',
    }),
  ];

  it('indexes by id and by lower-cased email', () => {
    const directory = buildMemberDirectory(members);

    expect(directory.byId['user-1'].name).toBe('Ada Lovelace');
    expect(directory.byEmail['grace@example.com']).toBe('user-2');
  });

  it('resolves an email to an id and passes an id through', () => {
    const directory = buildMemberDirectory(members);

    expect(resolveUserId(directory, 'Grace@Example.com')).toBe('user-2');
    expect(resolveUserId(directory, 'user-1')).toBe('user-1');
    expect(resolveUserId(directory, '')).toBe('');
  });

  it('falls back to the id when the directory knows nothing', () => {
    const directory = buildMemberDirectory([]);

    expect(describeUser(t, directory, 'user-9')).toEqual({
      name: '',
      email: '',
      label: 'user-9',
    });
  });
});

describe('buildDemographicCsv', () => {
  it('exports the loaded values with a stable header and readable cells', () => {
    const values = [
      makeDemographicValue({ user: 'user-1', key: 'gender', value: 'female' }),
      makeDemographicValue({
        id: 'value-3',
        user: 'user-1',
        key: 'language',
        value: ['English', 'French'],
        valueType: 'multi-enum',
        source: 'import',
      }),
    ];

    const { csv, rowCount } = buildDemographicCsv({
      t,
      values,
      definitions: definitions(),
      directory: buildMemberDirectory([makeOrganizationMember()]),
    });

    const rows = parseCsv(csv);

    expect(rowCount).toBe(2);
    expect(rows[0]).toEqual([
      'user',
      'userName',
      'userEmail',
      'key',
      'title',
      'value',
      'source',
      'verified',
      'updated',
    ]);
    expect(rows[1]).toEqual([
      'user-1',
      'Ada Lovelace',
      'ada@example.com',
      'gender',
      'Gender',
      'Female',
      'user',
      'No',
      '2026-09-02T08:00:00.000Z',
    ]);
    expect(rows[2][5]).toBe('English, French');
  });
});

describe('coerceImportCell', () => {
  const numberDefinition = makeDemographicDefinition({ key: 'age', valueType: 'number' });
  const booleanDefinition = makeDemographicDefinition({ key: 'remote', valueType: 'boolean' });
  const objectDefinition = makeDemographicDefinition({ key: 'address', valueType: 'object' });
  const language = makeDemographicDefinition({
    key: 'language',
    valueType: 'multi-enum',
    options: [
      { key: 'English', label: 'English', ordinal: 0, deprecated: false },
      { key: 'French', label: 'French', ordinal: 1, deprecated: false },
    ],
  });

  it('coerces numbers and refuses non-numbers', () => {
    expect(coerceImportCell(numberDefinition, '42')).toEqual({ ok: true, value: 42 });
    expect(coerceImportCell(numberDefinition, 'forty two')).toEqual({
      ok: false,
      errorKey: 'reactory.organizations.demographics.values.csv.error.invalidNumber',
    });
  });

  it('coerces booleans from yes/no and true/false', () => {
    expect(coerceImportCell(booleanDefinition, 'yes')).toEqual({ ok: true, value: true });
    expect(coerceImportCell(booleanDefinition, 'FALSE')).toEqual({ ok: true, value: false });
    expect(coerceImportCell(booleanDefinition, 'maybe')).toEqual({
      ok: false,
      errorKey: 'reactory.organizations.demographics.values.csv.error.invalidBoolean',
    });
  });

  it('resolves an enum by option key or label', () => {
    const gender = makeDemographicDefinition();

    expect(coerceImportCell(gender, 'female')).toEqual({ ok: true, value: 'female' });
    expect(coerceImportCell(gender, 'Male')).toEqual({ ok: true, value: 'male' });
    expect(coerceImportCell(gender, 'other')).toEqual({
      ok: false,
      errorKey: 'reactory.organizations.demographics.values.csv.error.invalidOption',
    });
  });

  it('splits a multi-enum on | and ;', () => {
    expect(coerceImportCell(language, 'English|French')).toEqual({
      ok: true,
      value: ['English', 'French'],
    });
    expect(coerceImportCell(language, 'English; French')).toEqual({
      ok: true,
      value: ['English', 'French'],
    });
  });

  it('parses object JSON and rejects malformed JSON', () => {
    expect(coerceImportCell(objectDefinition, '{"city":"Cape Town"}')).toEqual({
      ok: true,
      value: { city: 'Cape Town' },
    });
    expect(coerceImportCell(objectDefinition, '{city:')).toEqual({
      ok: false,
      errorKey: 'reactory.organizations.demographics.values.csv.error.invalidJson',
    });
  });
});

describe('inferImportMapping', () => {
  it('maps a user column and definition keys/titles, ignoring the rest', () => {
    const mapping = inferImportMapping(['user', 'shirtsize', 'Date of birth', 'notes'], definitions());

    expect(mapping).toEqual([
      { index: 0, column: 'user', target: IMPORT_TARGET_USER },
      { index: 1, column: 'shirtsize', target: 'shirtsize' },
      { index: 2, column: 'Date of birth', target: 'dateofbirth' },
      { index: 3, column: 'notes', target: IMPORT_TARGET_IGNORE },
    ]);
  });
});

describe('buildImportPreview', () => {
  const directory = buildMemberDirectory([
    makeOrganizationMember({ id: 'member-1', userId: 'user-1' }),
    makeOrganizationMember({
      id: 'member-2',
      userId: 'user-2',
      user: { id: 'user-2', firstName: 'Grace', lastName: 'Hopper', email: 'grace@example.com' },
      email: 'grace@example.com',
      firstName: 'Grace',
      lastName: 'Hopper',
    }),
  ]);

  const mapping = inferImportMapping(['user', 'shirtsize', 'gender'], definitions());

  it('marks a row valid when the member resolves and the values coerce', () => {
    const preview = buildImportPreview({
      rows: [['ada@example.com', 'Large', 'female']],
      mapping,
      definitions: definitions(),
      directory,
    });

    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ rowNumber: 1, userId: 'user-1', valid: true });
    expect(preview[0].values).toEqual([
      { key: 'shirtsize', title: 'Shirt size', raw: 'Large', value: 'Large' },
      { key: 'gender', title: 'Gender', raw: 'female', value: 'female' },
    ]);
  });

  it('reports an unknown member and an invalid value per row', () => {
    const preview = buildImportPreview({
      rows: [
        ['nobody@example.com', 'Large', 'female'],
        ['user-1', '', 'other'],
      ],
      mapping,
      definitions: definitions(),
      directory,
    });

    expect(preview[0].valid).toBe(false);
    expect(preview[0].errorKey).toBe(
      'reactory.organizations.demographics.values.csv.error.unknownUser',
    );

    expect(preview[1].valid).toBe(false);
    expect(preview[1].errorKey).toBe(
      'reactory.organizations.demographics.values.csv.error.invalidOption',
    );
    expect(preview[1].errorKeyOf).toBe('gender');
  });

  it('rejects a row with no mapped value', () => {
    const preview = buildImportPreview({
      rows: [['user-1', '', '']],
      mapping,
      definitions: definitions(),
      directory,
    });

    expect(preview[0].valid).toBe(false);
    expect(preview[0].errorKey).toBe(
      'reactory.organizations.demographics.values.csv.error.noValues',
    );
  });

  it('rejects a duplicate member/definition pair', () => {
    const preview = buildImportPreview({
      rows: [
        ['user-1', 'Large', 'female'],
        ['user-1', 'Medium', 'male'],
      ],
      mapping,
      definitions: definitions(),
      directory,
    });

    expect(preview[0].valid).toBe(true);
    expect(preview[1].valid).toBe(false);
    expect(preview[1].errorKey).toBe(
      'reactory.organizations.demographics.values.csv.error.duplicate',
    );
  });

  it('reports every row when no user column is mapped', () => {
    const preview = buildImportPreview({
      rows: [['Large', 'female']],
      mapping: inferImportMapping(['shirtsize', 'gender'], definitions()),
      definitions: definitions(),
      directory,
    });

    expect(preview[0].valid).toBe(false);
    expect(preview[0].errorKey).toBe(
      'reactory.organizations.demographics.values.csv.preview.missingUserColumn',
    );
  });
});

describe('importRowToInputs', () => {
  it('builds bulk payloads from a valid row only', () => {
    const preview = buildImportPreview({
      rows: [['user-1', 'Large', 'female']],
      mapping: inferImportMapping(['user', 'shirtsize', 'gender'], definitions()),
      definitions: definitions(),
      directory: buildMemberDirectory([makeOrganizationMember()]),
    });

    expect(importRowToInputs(preview[0])).toEqual([
      { user: 'user-1', key: 'shirtsize', value: 'Large', source: 'import' },
      { user: 'user-1', key: 'gender', value: 'female', source: 'import' },
    ]);
  });

  it('exports the fixture values used by the pane tests', () => {
    // Guards the fixtures against drifting away from the shape the helpers read.
    const values = demographicValueFixtures();

    expect(values.map((value) => value.key)).toEqual(['gender', 'dateofbirth', 'language']);
  });
});
