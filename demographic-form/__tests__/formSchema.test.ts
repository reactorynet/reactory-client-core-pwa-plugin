/**
 * JSON-Schema helpers behind the `ReactoryForm`-backed value types.
 *
 * `buildReadOnlyUiSchema` is the read-only guarantee for object/array
 * definitions, so its shape is asserted exhaustively — including nested
 * objects, arrays of objects and enum hints.
 */
import { buildReadOnlyUiSchema, normaliseArraySchema } from '../formSchema';

describe('normaliseArraySchema', () => {
  it('keeps a well-formed array schema', () => {
    const schema = { type: 'array', items: { type: 'string' }, title: 'Certs' };

    expect(normaliseArraySchema(schema)).toEqual(schema);
  });

  it('forces the array type so a scalar schema cannot render a scalar control', () => {
    expect(normaliseArraySchema({ type: 'string', title: 'Certs' })).toEqual({
      type: 'array',
      title: 'Certs',
      items: {},
    });
  });

  it('adds a missing items schema', () => {
    expect(normaliseArraySchema({ type: 'array' })).toEqual({ type: 'array', items: {} });
  });

  it('replaces a non-object items schema', () => {
    expect(normaliseArraySchema({ type: 'array', items: 'string' })).toEqual({
      type: 'array',
      items: {},
    });
  });

  it('copes with absent and non-object schemas', () => {
    expect(normaliseArraySchema(undefined)).toEqual({ type: 'array', items: {} });
    expect(normaliseArraySchema(null)).toEqual({ type: 'array', items: {} });
    expect(normaliseArraySchema(['nope'] as any)).toEqual({ type: 'array', items: {} });
  });
});

describe('buildReadOnlyUiSchema', () => {
  const schema = {
    type: 'object',
    properties: {
      line1: { type: 'string', description: 'Street address' },
      country: { type: 'string', enum: ['ZA', 'GB'] },
      nested: {
        type: 'object',
        properties: { postalCode: { type: 'string' } },
      },
      items: {
        type: 'array',
        items: { type: 'object', properties: { sku: { type: 'string' } } },
      },
    },
  };

  it('flags the root so the whole form is disabled and read-only', () => {
    const uiSchema = buildReadOnlyUiSchema(schema);

    expect(uiSchema['ui:readonly']).toBe(true);
    expect(uiSchema['ui:disabled']).toBe(true);
  });

  it('flags every top-level property', () => {
    const uiSchema = buildReadOnlyUiSchema(schema);

    expect(uiSchema.line1['ui:readonly']).toBe(true);
    expect(uiSchema.line1['ui:disabled']).toBe(true);
    expect(uiSchema.country['ui:readonly']).toBe(true);
  });

  it('flags nested objects and array-of-object items', () => {
    const uiSchema = buildReadOnlyUiSchema(schema);

    expect(uiSchema.nested.postalCode['ui:readonly']).toBe(true);
    expect(uiSchema.items.sku['ui:readonly']).toBe(true);
  });

  it('carries a property description through as help text', () => {
    expect(buildReadOnlyUiSchema(schema).line1['ui:help']).toBe('Street address');
  });

  it('renders an enum property as a select so the value stays legible', () => {
    const uiSchema = buildReadOnlyUiSchema(schema);

    expect(uiSchema.country['ui:widget']).toBe('select');
    expect(uiSchema.line1['ui:widget']).toBeUndefined();
  });

  it('handles an empty, absent or non-object schema', () => {
    expect(buildReadOnlyUiSchema({})).toEqual({
      'ui:readonly': true,
      'ui:disabled': true,
    });
    expect(buildReadOnlyUiSchema(undefined)['ui:readonly']).toBe(true);
    expect(buildReadOnlyUiSchema(null)['ui:readonly']).toBe(true);
  });

  it('tolerates a schema whose properties are not all objects', () => {
    const uiSchema = buildReadOnlyUiSchema({
      type: 'object',
      properties: { weird: 'string', fine: { type: 'string' } },
    });

    expect(uiSchema.weird['ui:readonly']).toBe(true);
    expect(uiSchema.fine['ui:readonly']).toBe(true);
  });

  it('walks an array root through its items', () => {
    const uiSchema = buildReadOnlyUiSchema({
      type: 'array',
      items: { type: 'object', properties: { issuer: { type: 'string' } } },
    });

    expect(uiSchema.issuer['ui:readonly']).toBe(true);
  });
});
