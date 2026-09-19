import { parse, Kind } from 'graphql';
import type { GridData, GraphQLRow, ResultColumn } from '../types';

/**
 * Turns a GraphQL response into something the grid can render.
 *
 * A GraphQL response is `{ <rootField>: <value> }`, and the value may be an
 * object, a list of objects, or a scalar. The grid wants rows and columns, so
 * this normalises those cases:
 *
 *   - list of objects  -> one row each, columns from the union of keys
 *   - single object    -> one row
 *   - scalar           -> one row, one column named after the field
 *
 * Columns are the union of keys across rows, not just the first row's keys: a
 * GraphQL list can contain objects with differing shapes when the selection
 * includes inline fragments.
 */

/** The root field name of the document's first operation, if parseable. */
export const rootFieldName = (document: string): string | null => {
  try {
    const ast = parse(document);
    const operation = ast.definitions.find(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    ) as any;

    if (!operation) return null;

    const field = operation.selectionSet.selections.find(
      (selection: any) => selection.kind === Kind.FIELD,
    );

    return field ? field.name.value : null;
  } catch (error) {
    return null;
  }
};

/** The operation kind of the document's first operation, if parseable. */
export const operationKind = (
  document: string,
): 'query' | 'mutation' | 'subscription' | null => {
  try {
    const ast = parse(document);
    const operation = ast.definitions.find(
      (definition) => definition.kind === Kind.OPERATION_DEFINITION,
    ) as any;

    return operation ? operation.operation : null;
  } catch (error) {
    return null;
  }
};

/**
 * Whether a document is a mutation.
 *
 * Parsed rather than prefix-matched so a leading comment or a differently
 * formatted `mutation` keyword is still recognised. Falls back to a trimmed
 * prefix check when the document does not parse — the editor needs *some*
 * answer to decide which field to call, and the server will reject a genuinely
 * malformed document with a proper message.
 */
export const isMutationDocument = (document: string): boolean => {
  const kind = operationKind(document);
  if (kind) return kind === 'mutation';

  const stripped = (document || '')
    .replace(/^\s*#[^\n]*\n/gm, '')
    .trimStart();

  return stripped.startsWith('mutation');
};

const isPlainObject = (value: any): value is GraphQLRow =>
  value !== null && typeof value === 'object' && Array.isArray(value) === false;

/** Title-case a field name, splitting camelCase and snake_case into words. */
const titleFor = (field: string): string =>
  field
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

/** Build grid columns from the union of keys across rows, order-stable. */
export const columnsFromRows = (rows: GraphQLRow[]): ResultColumn[] => {
  const seen = new Set<string>();
  const columns: ResultColumn[] = [];

  rows.forEach((row) => {
    if (!isPlainObject(row)) return;
    Object.keys(row).forEach((field) => {
      if (seen.has(field)) return;
      seen.add(field);
      columns.push({ field, title: titleFor(field) });
    });
  });

  return columns;
};

/** Case-insensitive match across every value in a row. */
export const rowMatches = (row: GraphQLRow, term: string): boolean => {
  if (!term) return true;
  return Object.keys(row || {}).some((key) => {
    const value = (row || {})[key];
    if (value === null || value === undefined) return false;
    return cellText(value).toLowerCase().includes(term);
  });
};

/**
 * Flatten a cell for grid display. Nested objects and arrays are rendered as
 * compact JSON so the grid stays a grid rather than trying to be a tree.
 */
export const cellText = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }
  return String(value);
};

/** Normalise a GraphQL `data` payload into grid rows and columns. */
export const toGridData = (data: Record<string, any> | null): GridData => {
  if (!data || typeof data !== 'object') {
    return { columns: [], rows: [] };
  }

  const rootField = Object.keys(data)[0];
  if (!rootField) return { columns: [], rows: [] };

  const value = data[rootField];

  if (Array.isArray(value)) {
    const rows = value.map((entry) =>
      isPlainObject(entry) ? entry : { [rootField]: entry },
    );
    return { columns: columnsFromRows(rows), rows, rootField };
  }

  if (isPlainObject(value)) {
    return {
      columns: columnsFromRows([value]),
      rows: [value],
      rootField,
    };
  }

  // A scalar root value: one row, one column.
  const rows = [{ [rootField]: value }];
  return {
    columns: [{ field: rootField, title: titleFor(rootField) }],
    rows,
    rootField,
  };
};
