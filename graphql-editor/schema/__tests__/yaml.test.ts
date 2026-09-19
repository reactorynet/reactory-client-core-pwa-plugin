import { toJsonText, toYaml } from '../yaml';

describe('toYaml', () => {
  it('renders scalars', () => {
    expect(toYaml('hello')).toBe('hello\n');
    expect(toYaml(42)).toBe('42\n');
    expect(toYaml(true)).toBe('true\n');
    expect(toYaml(null)).toBe('null\n');
  });

  it('quotes strings that would otherwise read back as another type', () => {
    // These are the cases that silently corrupt a document if left bare.
    expect(toYaml('true')).toBe('"true"\n');
    expect(toYaml('123')).toBe('"123"\n');
    expect(toYaml('null')).toBe('"null"\n');
    expect(toYaml('')).toBe('""\n');
    expect(toYaml('yes')).toBe('"yes"\n');
  });

  it('quotes strings with leading or trailing whitespace', () => {
    expect(toYaml(' padded')).toBe('" padded"\n');
    expect(toYaml('padded ')).toBe('"padded "\n');
  });

  it('escapes quotes, backslashes and newlines', () => {
    expect(toYaml('say "hi"')).toBe('"say \\"hi\\""\n');
    expect(toYaml('a\\b')).toBe('"a\\\\b"\n');
    expect(toYaml('line1\nline2')).toBe('"line1\\nline2"\n');
  });

  it('leaves ordinary identifiers bare', () => {
    expect(toYaml('reactor_audit')).toBe('reactor_audit\n');
    expect(toYaml('reactory.postgres.connection')).toBe('reactory.postgres.connection\n');
  });

  it('renders an empty object and empty array inline', () => {
    expect(toYaml({})).toBe('{}\n');
    expect(toYaml([])).toBe('[]\n');
  });

  it('renders a flat object as key/value lines', () => {
    expect(toYaml({ status: 'ok', count: 2 })).toBe('status: ok\ncount: 2\n');
  });

  it('nests objects with two-space indentation', () => {
    expect(toYaml({ apiStatus: { status: 'ok', version: '1.0.0' } })).toBe(
      'apiStatus:\n  status: ok\n  version: 1.0.0\n',
    );
  });

  it('renders a list of scalars', () => {
    expect(toYaml({ tags: ['a', 'b'] })).toBe('tags:\n  - a\n  - b\n');
  });

  it('renders a list of objects as block sequence entries', () => {
    const yaml = toYaml({ items: [{ id: 1, name: 'one' }, { id: 2, name: 'two' }] });

    expect(yaml).toBe(
      ['items:', '  - id: 1', '    name: one', '  - id: 2', '    name: two', ''].join('\n'),
    );
  });

  it('handles a nested list inside an object inside a list', () => {
    const yaml = toYaml({ rows: [{ values: [1, 2] }] });

    expect(yaml).toBe(['rows:', '  - values:', '      - 1', '      - 2', ''].join('\n'));
  });

  it('renders an empty collection nested in an object inline', () => {
    expect(toYaml({ tags: [], meta: {} })).toBe('tags: []\nmeta: {}\n');
  });

  it('quotes non-finite numbers rather than emitting invalid YAML', () => {
    expect(toYaml({ a: Number.POSITIVE_INFINITY })).toBe('a: "Infinity"\n');
  });
});

describe('toJsonText', () => {
  it('pretty-prints with a trailing newline', () => {
    expect(toJsonText({ a: 1 })).toBe('{\n  "a": 1\n}\n');
  });

  it('reports a value it cannot serialise instead of throwing', () => {
    const circular: any = {};
    circular.self = circular;

    expect(toJsonText(circular)).toMatch(/could not be serialised/i);
  });
});
