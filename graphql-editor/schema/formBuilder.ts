import {
  GraphQLSchema,
  GraphQLType,
  isNonNullType,
  isListType,
  isObjectType,
  isEnumType,
  isScalarType,
} from 'graphql';
import Reactory from '@reactorynet/reactory-core';
import { operationKind, rootFieldName } from './resultShaper';

/**
 * Builds a Reactory form definition from an introspected GraphQL type.
 *
 * This is what the editor's component view renders. A GraphQL response is
 * self-describing only if you ask the schema what the fields *mean*: the
 * document says which fields were selected, the schema says whether each is an
 * enum, a number, another object and so on. That is the whole reason this
 * plugin needs introspection — guessing from the data alone would render
 * `status: "ACTIVE"` as a free-text box instead of a choice, and would have no
 * descriptions to show.
 *
 * Two inputs are combined deliberately:
 *
 *   - the **schema** supplies types, enum values and descriptions,
 *   - the **data** supplies the selection set (only the fields the author
 *     actually asked for) and the concrete values.
 *
 * A schema type alone would build a form with every field on the type, most of
 * them absent from the result.
 */

/** Recursion guard for self-referencing types (e.g. a tree node). */
const MAX_DEPTH = 6;

const isPlainObject = (value: any): value is Record<string, any> =>
  value !== null && typeof value === 'object' && Array.isArray(value) === false;

const unwrap = (type: GraphQLType): GraphQLType => {
  let current: any = type;
  while (isNonNullType(current) || isListType(current)) {
    current = current.ofType;
  }
  return current;
};

const jsonTypeForScalar = (name: string): Record<string, any> => {
  switch (name) {
    case 'Int':
    case 'Float':
      return { type: 'number' };
    case 'Boolean':
      return { type: 'boolean' };
    default:
      return { type: 'string' };
  }
};

/**
 * Convert a GraphQL type (plus the concrete value, when known) to JSON Schema.
 *
 * Returns `null` when the type cannot be expressed — the caller then omits the
 * property rather than inventing a shape.
 */
const typeToJsonSchema = (
  type: GraphQLType,
  value: any,
  depth: number,
): Record<string, any> | null => {
  if (isNonNullType(type)) {
    return typeToJsonSchema(type.ofType, value, depth);
  }

  if (isListType(type)) {
    const sample = Array.isArray(value) && value.length > 0 ? value[0] : undefined;
    const items = typeToJsonSchema(type.ofType, sample, depth + 1);
    return { type: 'array', items: items || {} };
  }

  if (isEnumType(type)) {
    return {
      type: 'string',
      enum: type.getValues().map((entry) => entry.name),
    };
  }

  if (isScalarType(type)) {
    return jsonTypeForScalar(type.name);
  }

  if (isObjectType(type)) {
    if (depth >= MAX_DEPTH) {
      // Stop descending: a self-referencing type would otherwise recurse
      // forever. Render the node as opaque text instead.
      return { type: 'string' };
    }

    const fields = type.getFields();

    // Prefer the keys actually present in the result — that is the selection
    // set. Without data (a null object), fall back to the type's own fields so
    // the view still has something to show.
    const keys = isPlainObject(value)
      ? Object.keys(value).filter((key) => Boolean(fields[key]))
      : Object.keys(fields);

    const properties: Record<string, any> = {};

    keys.forEach((key) => {
      const field = fields[key];
      const nested = typeToJsonSchema(
        field.type,
        isPlainObject(value) ? value[key] : undefined,
        depth + 1,
      );

      if (!nested) return;

      if (field.description) nested.description = field.description;
      // GraphQL nullability is not JSON Schema optionality; every field here is
      // read-only, so it is always present in the form.
      properties[key] = nested;
    });

    return { type: 'object', properties };
  }

  // Input objects and unions do not appear in a response payload.
  return null;
};

/**
 * Read-only uiSchema mirroring a JSON Schema, so the generated form displays
 * the result rather than inviting edits to it.
 */
export const readOnlyUiSchema = (
  jsonSchema: Record<string, any>,
): Record<string, any> => {
  const uiSchema: Record<string, any> = { 'ui:readonly': true };

  const walk = (node: Record<string, any>, target: Record<string, any>) => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'object' && node.properties) {
      Object.entries(node.properties).forEach(([key, child]: [string, any]) => {
        target[key] = { 'ui:readonly': true };
        if (child && typeof child === 'object') {
          if (child.description) target[key]['ui:help'] = child.description;
          if (Array.isArray(child.enum)) target[key]['ui:widget'] = 'select';
          walk(child, target[key]);
        }
      });
      return;
    }

    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      walk(node.items, target);
    }
  };

  walk(jsonSchema, uiSchema);
  return uiSchema;
};

export interface BuildFormDefinitionArgs {
  schema: GraphQLSchema | null;
  data: Record<string, any> | null;
  document: string;
  /** Stable id so re-renders reuse the same definition. */
  idPrefix?: string;
}

export interface FormDefinitionResult {
  formDefinition: Reactory.Forms.IReactoryForm | null;
  /** Why no definition was produced, for display when the view is unavailable. */
  reason?: string;
  /** The schema type the definition was built from, when known. */
  typeName?: string;
}

/**
 * Build a Reactory form definition for a result payload.
 *
 * Returns a `reason` instead of throwing when it cannot: the component view
 * degrades to an explanation, and the grid and raw views stay usable.
 */
export const buildFormDefinition = ({
  schema,
  data,
  document,
  idPrefix = 'core.DynamicGraphQLResult',
}: BuildFormDefinitionArgs): FormDefinitionResult => {
  if (!schema) {
    return {
      formDefinition: null,
      reason:
        'The schema is unavailable, so the result type cannot be inferred. The grid and raw views are unaffected.',
    };
  }

  if (!data || typeof data !== 'object') {
    return { formDefinition: null, reason: 'No result data to render.' };
  }

  const rootField = rootFieldName(document);
  if (!rootField) {
    return {
      formDefinition: null,
      reason:
        'The root field could not be read from the document, so the result type cannot be inferred.',
    };
  }

  const operation = operationKind(document) || 'query';
  const parent =
    operation === 'mutation' ? schema.getMutationType() : schema.getQueryType();

  const field = parent ? parent.getFields()[rootField] : undefined;

  if (!field) {
    return {
      formDefinition: null,
      reason: `The schema does not declare \`${rootField}\` on the ${operation} type.`,
    };
  }

  const value = data[rootField];
  const jsonSchema = typeToJsonSchema(field.type, value, 0);

  if (!jsonSchema) {
    return {
      formDefinition: null,
      reason: `\`${rootField}\` returns a type that cannot be rendered as a form.`,
    };
  }

  const typeName = String(unwrap(field.type));

  const titled: Record<string, any> = {
    ...jsonSchema,
    title: field.description || rootField,
  };

  const formDefinition: any = {
    id: `${idPrefix}.${rootField}@1.0.0`,
    name: `${idPrefix}.${rootField}`,
    nameSpace: 'core',
    version: '1.0.0',
    title: `${rootField} \u2014 ${typeName}`,
    description: field.description || undefined,
    schema: titled,
    uiSchema: readOnlyUiSchema(titled),
    uiFramework: 'material',
    uiSupport: ['material'],
    uiResources: [],
    // Pure display: no data source, no submit. The result is supplied as
    // `formData` by the component view.
    registerAsComponent: false,
  } as Reactory.Forms.IReactoryForm;

  return { formDefinition, typeName };
};
