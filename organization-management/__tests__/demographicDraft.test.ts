/**
 * Pure rules behind the Demographics configuration pane (ORG-031).
 *
 * No React and no GraphQL: the draft → payload transformation and the
 * validation messages are the contract the drawer and the server both depend
 * on, so they are asserted directly.
 */
import {
  buildDefinitionInput,
  draftDefinition,
  draftFromDefinition,
  draftHasErrors,
  emptyDraft,
  isDraftDirty,
  isValidDemographicKey,
  mergeDefinitions,
  moveItem,
  nextOrdinal,
  normaliseDemographicKey,
  optionsFromRows,
  parseSchemaText,
  parseWidgetPropsText,
  patchDefinitionInput,
  propsMapFromRows,
  reorderKeys,
  requiresOptions,
  validateDraft,
} from '../demographicDraft';
import { makeDemographicDefinition } from './testFixtures';

const validDraft = () => ({
  ...emptyDraft(2),
  key: 'shirtsize',
  title: 'Shirt size',
});

describe('key normalisation', () => {
  it('mirrors the server: trim and lowercase', () => {
    expect(normaliseDemographicKey('  ShirtSize ')).toBe('shirtsize');
    expect(normaliseDemographicKey(null)).toBe('');
    expect(normaliseDemographicKey(42)).toBe('');
  });

  it('accepts the base definitions’ camelCase keys once normalised', () => {
    expect(isValidDemographicKey('dateOfBirth')).toBe(true);
    expect(isValidDemographicKey('employment_type')).toBe(true);
    expect(isValidDemographicKey('1shirt')).toBe(false);
    expect(isValidDemographicKey('shirt size')).toBe(false);
    expect(isValidDemographicKey('shirt-size')).toBe(false);
    expect(isValidDemographicKey('')).toBe(false);
  });
});

describe('parseSchemaText', () => {
  it('treats empty text as "no schema"', () => {
    expect(parseSchemaText('')).toEqual({ value: null, error: null });
    expect(parseSchemaText('   ')).toEqual({ value: null, error: null });
    expect(parseSchemaText(undefined)).toEqual({ value: null, error: null });
  });

  it('rejects malformed JSON with its own key', () => {
    expect(parseSchemaText('{ "type": "object", }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidJson',
    );
  });

  it('rejects a non-object schema', () => {
    expect(parseSchemaText('[]').error).toBe(
      'reactory.organizations.demographics.error.schemaNotObject',
    );
    expect(parseSchemaText('"object"').error).toBe(
      'reactory.organizations.demographics.error.schemaNotObject',
    );
  });

  it('checks the keywords the renderer and the server read', () => {
    expect(parseSchemaText('{ "type": "widget" }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidType',
    );
    expect(parseSchemaText('{ "type": ["object", "null"] }').error).toBeNull();
    expect(parseSchemaText('{ "properties": [] }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidProperties',
    );
    expect(parseSchemaText('{ "required": "name" }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidRequired',
    );
    expect(parseSchemaText('{ "items": [] }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidItems',
    );
    expect(parseSchemaText('{ "enum": "a" }').error).toBe(
      'reactory.organizations.demographics.error.schemaInvalidEnum',
    );
  });

  it('returns a valid structured schema', () => {
    const text = JSON.stringify({
      type: 'object',
      properties: { line1: { type: 'string' }, city: { type: 'string' } },
      required: ['line1'],
    });

    const parsed = parseSchemaText(text);
    expect(parsed.error).toBeNull();
    expect(parsed.value).toEqual({
      type: 'object',
      properties: { line1: { type: 'string' }, city: { type: 'string' } },
      required: ['line1'],
    });
  });
});

describe('parseWidgetPropsText', () => {
  it('uses its own messages and requires an object', () => {
    expect(parseWidgetPropsText('{').error).toBe(
      'reactory.organizations.demographics.error.widgetPropsInvalidJson',
    );
    expect(parseWidgetPropsText('[1]').error).toBe(
      'reactory.organizations.demographics.error.widgetPropsNotObject',
    );
    expect(parseWidgetPropsText('{ "rows": 4 }')).toEqual({ value: { rows: 4 }, error: null });
  });
});

describe('validateDraft', () => {
  it('accepts a minimal create draft', () => {
    expect(validateDraft(validDraft(), { creating: true })).toEqual({});
  });

  it('requires a key on create only', () => {
    const draft = { ...validDraft(), key: '' };
    expect(validateDraft(draft, { creating: true }).key).toBe(
      'reactory.organizations.demographics.error.keyRequired',
    );
    expect(validateDraft(draft, { creating: false }).key).toBeUndefined();
  });

  it('rejects an unusable key', () => {
    expect(validateDraft({ ...validDraft(), key: 'shirt size' }, { creating: true }).key).toBe(
      'reactory.organizations.demographics.error.keyInvalid',
    );
  });

  it('requires a title', () => {
    expect(validateDraft({ ...validDraft(), title: '  ' }, { creating: true }).title).toBe(
      'reactory.organizations.demographics.error.titleRequired',
    );
  });

  it('requires at least one option for enum and multi-enum', () => {
    const draft = { ...validDraft(), valueType: 'enum' };
    expect(validateDraft(draft, { creating: true }).options).toBe(
      'reactory.organizations.demographics.error.optionsRequired',
    );

    const withOptions = {
      ...draft,
      options: [{ id: 'o1', key: 'small', label: 'Small', ordinal: 0, deprecated: false }],
    };
    expect(validateDraft(withOptions, { creating: true }).options).toBeUndefined();
  });

  it('rejects duplicate option keys case-insensitively', () => {
    const draft = {
      ...validDraft(),
      valueType: 'multi-enum',
      options: [
        { id: 'o1', key: 'small', label: 'Small', ordinal: 0, deprecated: false },
        { id: 'o2', key: 'SMALL', label: 'Small again', ordinal: 1, deprecated: false },
      ],
    };
    expect(validateDraft(draft, { creating: true }).options).toBe(
      'reactory.organizations.demographics.error.optionKeyDuplicate',
    );
  });

  it('flags a labelled option that has no key', () => {
    const draft = {
      ...validDraft(),
      valueType: 'enum',
      options: [
        { id: 'o1', key: 'small', label: 'Small', ordinal: 0, deprecated: false },
        { id: 'o2', key: '', label: 'Medium', ordinal: 1, deprecated: false },
      ],
    };
    expect(validateDraft(draft, { creating: true }).options).toBe(
      'reactory.organizations.demographics.error.optionKeyRequired',
    );
  });

  it('does not ask for options on a non-enum type', () => {
    expect(validateDraft({ ...validDraft(), valueType: 'string' }, { creating: true }).options)
      .toBeUndefined();
    expect(requiresOptions('multi-enum')).toBe(true);
    expect(requiresOptions('string')).toBe(false);
  });

  it('requires a known reference model', () => {
    expect(
      validateDraft(
        { ...validDraft(), valueType: 'reference', referenceModel: 'Building' },
        { creating: true },
      ).reference,
    ).toBe('reactory.organizations.demographics.error.referenceRequired');

    expect(
      validateDraft(
        { ...validDraft(), valueType: 'reference', referenceModel: 'BusinessUnit' },
        { creating: true },
      ).reference,
    ).toBeUndefined();
  });

  it('validates the schema and props-map editors inline', () => {
    expect(validateDraft({ ...validDraft(), schemaText: '{' }, { creating: true }).schema).toBe(
      'reactory.organizations.demographics.error.schemaInvalidJson',
    );

    expect(
      validateDraft(
        {
          ...validDraft(),
          widgetPropsMap: [{ id: 'm1', source: 'definition.options', prop: 'options' }],
        },
        { creating: true },
      ).widgetPropsMap,
    ).toBeUndefined();

    expect(
      validateDraft(
        {
          ...validDraft(),
          widgetPropsMap: [{ id: 'm1', source: '__proto__.x', prop: 'options' }],
        },
        { creating: true },
      ).widgetPropsMap,
    ).toBe('reactory.organizations.demographics.error.propsMapSourceInvalid');

    expect(
      validateDraft(
        {
          ...validDraft(),
          widgetPropsMap: [{ id: 'm1', source: 'definition.options', prop: '' }],
        },
        { creating: true },
      ).widgetPropsMap,
    ).toBe('reactory.organizations.demographics.error.propsMapPropInvalid');

    expect(
      validateDraft(
        {
          ...validDraft(),
          widgetPropsMap: [
            { id: 'm1', source: 'definition.options', prop: 'options' },
            { id: 'm2', source: 'definition.options', prop: 'choices' },
          ],
        },
        { creating: true },
      ).widgetPropsMap,
    ).toBe('reactory.organizations.demographics.error.propsMapDuplicateSource');
  });

  it('rejects a fractional or negative ordinal', () => {
    expect(validateDraft({ ...validDraft(), ordinal: 1.5 }, { creating: true }).ordinal).toBe(
      'reactory.organizations.demographics.error.ordinalInvalid',
    );
    expect(validateDraft({ ...validDraft(), ordinal: -1 }, { creating: true }).ordinal).toBe(
      'reactory.organizations.demographics.error.ordinalInvalid',
    );
    expect(validateDraft({ ...validDraft(), ordinal: 7 }, { creating: true }).ordinal)
      .toBeUndefined();
  });

  it('reports whether anything failed', () => {
    expect(draftHasErrors({})).toBe(false);
    expect(draftHasErrors({ title: 'reactory.organizations.demographics.error.titleRequired' }))
      .toBe(true);
  });
});

describe('buildDefinitionInput', () => {
  it('sends the key on create and never an id', () => {
    const input = buildDefinitionInput(validDraft(), { creating: true });
    expect(input.key).toBe('shirtsize');
    expect(input).not.toHaveProperty('id');
    expect(input.title).toBe('Shirt size');
  });

  it('sends the id on update and never the key', () => {
    const definition = makeDemographicDefinition({
      id: 'def-4',
      key: 'shirtsize',
      title: 'Shirt size',
      system: false,
    });
    const input = buildDefinitionInput(draftFromDefinition(definition), { creating: false });

    expect(input.id).toBe('def-4');
    expect(input).not.toHaveProperty('key');
  });

  it('omits valueType for a system definition even if the draft changed', () => {
    const definition = makeDemographicDefinition({ valueType: 'enum', system: true });
    const draft = { ...draftFromDefinition(definition), valueType: 'string' };
    const input = buildDefinitionInput(draft, { creating: false });

    expect(input).not.toHaveProperty('valueType');
    expect(input.id).toBe('def-1');
  });

  it('sends valueType for a custom definition', () => {
    const definition = makeDemographicDefinition({ system: false, valueType: 'string' });
    const draft = { ...draftFromDefinition(definition), valueType: 'date' };
    expect(buildDefinitionInput(draft, { creating: false }).valueType).toBe('date');
  });

  it('clears options, reference and widget that the draft no longer has', () => {
    const input = buildDefinitionInput(
      { ...validDraft(), valueType: 'string', widgetFqn: '', widgetPropsText: '' },
      { creating: true },
    );

    expect(input.options).toEqual([]);
    expect(input.reference).toBeNull();
    expect(input.widget).toBeNull();
    expect(input.schema).toBeNull();
  });

  it('builds the enum, reference and widget payloads', () => {
    const input = buildDefinitionInput(
      {
        ...validDraft(),
        valueType: 'multi-enum',
        options: [{ id: 'o1', key: 'Small', label: 'Small', ordinal: 0, deprecated: true }],
        referenceModel: 'Team',
        widgetFqn: 'reactory.MyWidget@1.0.0',
        widgetPropsText: '{"dense":true}',
        widgetPropsMap: [{ id: 'm1', source: 'definition.options', prop: 'options' }],
      },
      { creating: true },
    );

    expect(input.options).toEqual([
      { key: 'small', label: 'Small', ordinal: 0, deprecated: true },
    ]);
    expect(input.reference).toBeNull();
    expect(input.widget).toEqual({
      componentFqn: 'reactory.MyWidget@1.0.0',
      componentProps: { dense: true },
      componentPropsMap: { 'definition.options': 'options' },
    });
  });

  it('drops a blank props-map row and a blank option row', () => {
    expect(propsMapFromRows([{ id: 'm1', source: '', prop: '' }])).toEqual({});
    expect(optionsFromRows([{ id: 'o1', key: '  ', label: 'x', ordinal: 0, deprecated: false }]))
      .toEqual([]);
  });
});

describe('draftFromDefinition / draftDefinition', () => {
  it('round-trips a stored definition', () => {
    const definition = makeDemographicDefinition({
      icon: 'badge',
      schema: { type: 'object', properties: { a: { type: 'string' } } },
      reference: { model: 'Team', multiple: true },
      widget: {
        componentFqn: 'reactory.MyWidget@1.0.0',
        componentProps: { dense: true },
        componentPropsMap: { 'definition.options': 'options' },
      },
    });

    const draft = draftFromDefinition(definition);

    expect(draft.id).toBe('def-1');
    expect(draft.key).toBe('gender');
    expect(draft.category).toBe('personal');
    expect(draft.referenceModel).toBe('Team');
    expect(draft.referenceMultiple).toBe(true);
    expect(draft.widgetFqn).toBe('reactory.MyWidget@1.0.0');
    expect(draft.options).toHaveLength(2);
    expect(JSON.parse(draft.schemaText)).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
    });
    expect(draft.widgetPropsMap).toEqual([
      { id: expect.any(String), source: 'definition.options', prop: 'options' },
    ]);
  });

  it('always previews an enabled definition, with a usable key and title', () => {
    const preview = draftDefinition({ ...emptyDraft(0), key: '', title: '' });

    expect(preview.enabled).toBe(true);
    expect(preview.key).toBe('draft');
    expect(preview.title).toBe('draft');
    expect(preview).not.toHaveProperty('id', 'def-1');
  });

  it('previews the draft as typed', () => {
    const preview = draftDefinition({
      ...validDraft(),
      valueType: 'enum',
      required: true,
      multiValued: true,
      options: [{ id: 'o1', key: 'small', label: 'Small', ordinal: 0, deprecated: false }],
    });

    expect(preview.key).toBe('shirtsize');
    expect(preview.title).toBe('Shirt size');
    expect(preview.required).toBe(true);
    expect(preview.multiValued).toBe(true);
    expect(preview.options).toEqual([
      { key: 'small', label: 'Small', ordinal: 0, deprecated: false },
    ]);
  });
});

describe('isDraftDirty', () => {
  it('is false for the draft a definition produced and true after an edit', () => {
    const definition = makeDemographicDefinition();
    const baseline = draftFromDefinition(definition);
    const reopened = draftFromDefinition(definition);

    expect(isDraftDirty(reopened, baseline)).toBe(false);
    expect(isDraftDirty({ ...reopened, title: 'Gender identity' }, baseline)).toBe(true);
    // Reverting a value makes the drawer clean again.
    expect(
      isDraftDirty({ ...reopened, title: 'Gender identity', key: 'gender' }, baseline),
    ).toBe(true);
    expect(isDraftDirty({ ...reopened, title: 'x' }, { ...baseline, title: 'x' })).toBe(false);
  });

  it('ignores generated row ids', () => {
    const definition = makeDemographicDefinition();
    const left = draftFromDefinition(definition);
    const right = draftFromDefinition(definition);

    expect(left.options[0].id).not.toBe(right.options[0].id);
    expect(isDraftDirty(left, right)).toBe(false);
  });
});

describe('list helpers', () => {
  const definitions = [
    makeDemographicDefinition({ key: 'a', ordinal: 0 }),
    makeDemographicDefinition({ key: 'b', ordinal: 1 }),
    makeDemographicDefinition({ key: 'c', ordinal: 2 }),
  ];

  it('moves an item immutably and ignores out-of-range indices', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, 9)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 0, 2)).not.toBe(definitions);
  });

  it('computes the key order for a drop', () => {
    expect(reorderKeys(definitions, 'c', 'a')).toEqual(['c', 'a', 'b']);
    expect(reorderKeys(definitions, 'zz', 'a')).toBeNull();
  });

  it('merges a partial reorder response without dropping rows', () => {
    const merged = mergeDefinitions(definitions, [
      { ...definitions[2], ordinal: 0 },
      { ...definitions[0], ordinal: 1 },
    ]);

    expect(merged.map((entry) => entry.key)).toEqual(['c', 'a', 'b']);
    expect(merged).toHaveLength(3);
  });

  it('takes the next ordinal from the highest existing one', () => {
    expect(nextOrdinal(definitions)).toBe(3);
    expect(nextOrdinal([])).toBe(0);
  });

  it('patches a single field without the whole definition', () => {
    expect(patchDefinitionInput(definitions[0], { required: true })).toEqual({
      id: 'def-1',
      required: true,
    });

    // A legacy payload without an id falls back to the key as its identity.
    expect(patchDefinitionInput({ ...definitions[0], id: null }, { enabled: false })).toEqual({
      key: 'a',
      enabled: false,
    });
  });
});
