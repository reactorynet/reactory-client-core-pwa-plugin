import {
  cellText,
  columnsFromRows,
  isMutationDocument,
  operationKind,
  rootFieldName,
  rowMatches,
  toGridData,
} from '../resultShaper';

describe('document inspection', () => {
  it('finds the root field', () => {
    expect(rootFieldName('query ApiStatus { apiStatus { status } }')).toBe('apiStatus');
    expect(rootFieldName('{\n  apiStatus {\n    status\n  }\n}')).toBe('apiStatus');
  });

  it('identifies the operation kind', () => {
    expect(operationKind('query Q { a }')).toBe('query');
    expect(operationKind('mutation M { a }')).toBe('mutation');
    expect(operationKind('{ a }')).toBe('query');
  });

  it('recognises a mutation even behind a comment', () => {
    // A prefix check would miss this and route the document to `client.query`.
    expect(isMutationDocument('# create a thing\nmutation Create { a }')).toBe(true);
    expect(isMutationDocument('query Read { a }')).toBe(false);
    expect(isMutationDocument('{ a }')).toBe(false);
  });

  it('falls back to a prefix check when the document does not parse', () => {
    expect(isMutationDocument('mutation Broken {')).toBe(true);
    expect(isMutationDocument('query Broken {')).toBe(false);
  });

  it('returns null rather than throwing on a malformed document', () => {
    expect(rootFieldName('not graphql at all')).toBeNull();
    expect(operationKind('not graphql at all')).toBeNull();
  });
});

describe('columnsFromRows', () => {
  it('uses the union of keys, order-stable, not just the first row', () => {
    // A list can contain differently shaped objects when inline fragments are
    // involved, so the first row is not a safe source of columns.
    const columns = columnsFromRows([{ a: 1 }, { b: 2 }, { a: 3, c: 4 }]);

    expect(columns.map((column) => column.field)).toEqual(['a', 'b', 'c']);
  });

  it('title-cases camelCase and snake_case field names', () => {
    const columns = columnsFromRows([{ firstName: 'a', last_name: 'b' }]);

    expect(columns[0].title).toBe('First Name');
    expect(columns[1].title).toBe('Last Name');
  });

  it('ignores non-object entries', () => {
    expect(columnsFromRows([null as any, 'x' as any])).toEqual([]);
  });
});

describe('cellText', () => {
  it('renders null and undefined as empty', () => {
    expect(cellText(null)).toBe('');
    expect(cellText(undefined)).toBe('');
  });

  it('compacts nested values to JSON so a cell stays a cell', () => {
    expect(cellText({ a: 1 })).toBe('{"a":1}');
    expect(cellText([1, 2])).toBe('[1,2]');
  });

  it('stringifies scalars', () => {
    expect(cellText(0)).toBe('0');
    expect(cellText(false)).toBe('false');
  });
});

describe('rowMatches', () => {
  it('matches case-insensitively across values', () => {
    expect(rowMatches({ name: 'Reactor' }, 'reactor')).toBe(true);
    expect(rowMatches({ name: 'Reactor' }, 'nope')).toBe(false);
  });

  it('matches an empty term against everything', () => {
    expect(rowMatches({ a: 1 }, '')).toBe(true);
  });

  it('searches nested values via their compact form', () => {
    expect(rowMatches({ meta: { tag: 'alpha' } }, 'alpha')).toBe(true);
  });
});

describe('toGridData', () => {
  it('turns a list of objects into rows', () => {
    const grid = toGridData({ reactors: [{ id: 1 }, { id: 2 }] });

    expect(grid.rootField).toBe('reactors');
    expect(grid.rows).toHaveLength(2);
    expect(grid.columns.map((column) => column.field)).toEqual(['id']);
  });

  it('wraps a single object as one row', () => {
    const grid = toGridData({ apiStatus: { status: 'ok' } });

    expect(grid.rootField).toBe('apiStatus');
    expect(grid.rows).toEqual([{ status: 'ok' }]);
  });

  it('wraps a scalar root value as one row and one column', () => {
    const grid = toGridData({ count: 7 });

    expect(grid.columns).toEqual([{ field: 'count', title: 'Count' }]);
    expect(grid.rows).toEqual([{ count: 7 }]);
  });

  it('wraps a list of scalars under the root field name', () => {
    const grid = toGridData({ names: ['a', 'b'] });

    expect(grid.rows).toEqual([{ names: 'a' }, { names: 'b' }]);
  });

  it('returns empty data for a null payload', () => {
    expect(toGridData(null)).toEqual({ columns: [], rows: [] });
  });

  it('returns empty data for an empty object', () => {
    expect(toGridData({})).toEqual({ columns: [], rows: [] });
  });
});
