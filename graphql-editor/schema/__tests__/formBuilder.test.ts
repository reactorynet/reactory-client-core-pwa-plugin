import { buildSchema } from 'graphql';
import { buildFormDefinition, readOnlyUiSchema } from '../formBuilder';

/**
 * The component view's contract: given an introspected schema and a result,
 * produce a Reactory form definition. These tests assert the schema is actually
 * consulted — the whole reason introspection is needed — rather than the form
 * being guessed from the data.
 */

const schema = buildSchema(`
  """The role a user holds."""
  enum Role {
    ADMIN
    USER
  }

  """A person known to the platform."""
  type Person {
    id: ID!
    """Their full name."""
    name: String
    age: Int
    active: Boolean
    role: Role
    meta: Meta
  }

  type Meta {
    tag: String
  }

  type PersonPage {
    items: [Person!]!
    total: Int!
  }

  type Query {
    person: Person
    people: [Person]
    role: Role
    count: Int
  }

  type Mutation {
    createPerson(name: String!): Person
  }
`);

const PERSON_QUERY = 'query Q { person { id name role } }';

const build = (document: string, data: any, s: any = schema) =>
  buildFormDefinition({ schema: s, data, document });

describe('buildFormDefinition', () => {
  it('reports a reason instead of throwing when there is no schema', () => {
    const result = build(PERSON_QUERY, { person: {} }, null);

    expect(result.formDefinition).toBeNull();
    expect(result.reason).toMatch(/schema is unavailable/i);
  });

  it('reports a reason when there is no data', () => {
    const result = build(PERSON_QUERY, null);

    expect(result.formDefinition).toBeNull();
    expect(result.reason).toMatch(/no result data/i);
  });

  it('reports a reason when the root field is not on the schema', () => {
    const result = build('query Q { notAField { id } }', { notAField: { id: 1 } });

    expect(result.formDefinition).toBeNull();
    expect(result.reason).toMatch(/does not declare `notAField`/);
  });

  it('resolves the root field through the Mutation type for a mutation', () => {
    const result = build('mutation M { createPerson(name: "x") { id name } }', {
      createPerson: { id: '1', name: 'x' },
    });

    expect(result.formDefinition).not.toBeNull();
    expect(result.typeName).toBe('Person');
  });

  it('builds object properties from the fields present in the result', () => {
    // The selection set, not the whole type: `age`, `active` and `meta` were
    // not requested and must not appear.
    const { formDefinition } = build(PERSON_QUERY, {
      person: { id: '1', name: 'Ada', role: 'ADMIN' },
    });

    const properties = (formDefinition as any).schema.properties;

    expect(Object.keys(properties).sort()).toEqual(['id', 'name', 'role']);
  });

  it('maps GraphQL scalars to the right JSON Schema types', () => {
    const { formDefinition } = build('query Q { person { id age active name } }', {
      person: { id: '1', age: 42, active: true, name: 'Ada' },
    });

    const properties = (formDefinition as any).schema.properties;

    expect(properties.id.type).toBe('string');
    expect(properties.name.type).toBe('string');
    expect(properties.age.type).toBe('number');
    expect(properties.active.type).toBe('boolean');
  });

  it('turns an enum into a constrained string, not free text', () => {
    // This is the difference between guessing from data and reading the schema.
    const { formDefinition } = build('query Q { person { role } }', {
      person: { role: 'ADMIN' },
    });

    const role = (formDefinition as any).schema.properties.role;

    expect(role.type).toBe('string');
    expect(role.enum).toEqual(['ADMIN', 'USER']);
  });

  it('carries GraphQL descriptions into the form', () => {
    const { formDefinition } = build('query Q { person { name } }', {
      person: { name: 'Ada' },
    });

    expect((formDefinition as any).schema.properties.name.description).toBe(
      'Their full name.',
    );
  });

  it('describes a list as an array of the element type', () => {
    const { formDefinition } = build('query Q { people { id name } }', {
      people: [{ id: '1', name: 'Ada' }],
    });

    const items = (formDefinition as any).schema.items;

    expect((formDefinition as any).schema.type).toBe('array');
    expect(items.type).toBe('object');
    expect(Object.keys(items.properties).sort()).toEqual(['id', 'name']);
  });

  it('handles a scalar root field', () => {
    const { formDefinition } = build('query Q { count }', { count: 3 });

    expect((formDefinition as any).schema.type).toBe('number');
  });

  it('handles an enum root field', () => {
    const { formDefinition } = build('query Q { role }', { role: 'ADMIN' });

    expect((formDefinition as any).schema.enum).toEqual(['ADMIN', 'USER']);
  });

  it('stops descending on a self-referencing type instead of recursing forever', () => {
    const recursive = buildSchema(`
      type Node {
        id: ID
        child: Node
      }
      type Query {
        node: Node
      }
    `);

    const deep: any = { id: '1' };
    let cursor = deep;
    for (let index = 0; index < 40; index += 1) {
      cursor.child = { id: String(index) };
      cursor = cursor.child;
    }

    const { formDefinition } = build('query Q { node { id child { id } } }', { node: deep }, recursive);

    expect(formDefinition).not.toBeNull();
  });

  it('produces a read-only form with no data source', () => {
    const { formDefinition } = build(PERSON_QUERY, {
      person: { id: '1', name: 'Ada', role: 'ADMIN' },
    });

    expect((formDefinition as any).uiSchema['ui:readonly']).toBe(true);
    expect((formDefinition as any).uiSchema.name['ui:readonly']).toBe(true);
    expect((formDefinition as any).graphql).toBeUndefined();
    expect((formDefinition as any).registerAsComponent).toBe(false);
  });

  it('exposes the schema type it resolved', () => {
    const { typeName } = build(PERSON_QUERY, { person: { id: '1' } });

    expect(typeName).toBe('Person');
  });
});

describe('readOnlyUiSchema', () => {
  it('marks nested properties read-only and surfaces descriptions as help', () => {
    const ui = readOnlyUiSchema({
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Their full name.' },
      },
    });

    expect(ui.name['ui:readonly']).toBe(true);
    expect(ui.name['ui:help']).toBe('Their full name.');
  });

  it('selects a select widget for enumerated values', () => {
    const ui = readOnlyUiSchema({
      type: 'object',
      properties: { role: { type: 'string', enum: ['A', 'B'] } },
    });

    expect(ui.role['ui:widget']).toBe('select');
  });
});
