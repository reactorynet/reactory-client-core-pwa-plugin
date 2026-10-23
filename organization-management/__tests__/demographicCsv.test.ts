/**
 * @jest-environment jsdom
 *
 * CSV utility for the demographics values pane (ORG-033).
 *
 * The parser exists because demographic values are free text: a `split(',')`
 * implementation loses quoted commas, embedded newlines and the BOM Excel
 * writes. These tests pin the cases the ticket calls out — quoted fields,
 * embedded commas, embedded newlines, a BOM, and the round trip
 * `parse(export(x)) === x`.
 */
import {
  CSV_BOM,
  escapeCsvCell,
  parseCsv,
  parseCsvTable,
  serialiseCsv,
  stripBom,
} from '../demographicCsv';

describe('stripBom', () => {
  it('removes a leading BOM only', () => {
    expect(stripBom(`${CSV_BOM}user,value`)).toBe('user,value');
    expect(stripBom('user,value')).toBe('user,value');
    // A BOM inside the text is data, not a marker.
    expect(stripBom(`user${CSV_BOM},value`)).toBe(`user${CSV_BOM},value`);
  });
});

describe('parseCsv', () => {
  it('parses a plain grid', () => {
    expect(parseCsv('user,key,value\nuser-1,gender,female')).toEqual([
      ['user', 'key', 'value'],
      ['user-1', 'gender', 'female'],
    ]);
  });

  it('keeps a quoted field together when it contains the delimiter', () => {
    const rows = parseCsv('user,note\n"Lovelace, Ada",noted');

    expect(rows[1]).toEqual(['Lovelace, Ada', 'noted']);
  });

  it('unescapes doubled quotes inside a quoted field', () => {
    const rows = parseCsv('user,note\nuser-1,"She said ""hello"", then left"');

    expect(rows[1][1]).toBe('She said "hello", then left');
  });

  it('keeps embedded newlines inside a quoted field', () => {
    const rows = parseCsv('user,note\nuser-1,"line one\nline two"\nuser-2,short');

    expect(rows).toHaveLength(3);
    expect(rows[1]).toEqual(['user-1', 'line one\nline two']);
    expect(rows[2]).toEqual(['user-2', 'short']);
  });

  it('handles CRLF, lone CR and a trailing newline without inventing a row', () => {
    expect(parseCsv('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);

    expect(parseCsv('a,b\r1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('ignores a UTF-8 BOM at the start of the file', () => {
    const rows = parseCsv(`${CSV_BOM}user,value\nuser-1,female`);

    expect(rows[0]).toEqual(['user', 'value']);
    expect(rows[1]).toEqual(['user-1', 'female']);
  });

  it('treats a quote inside an unquoted field as an ordinary character', () => {
    expect(parseCsv('a,b\nsay "hi",ok')[1]).toEqual(['say "hi"', 'ok']);
  });

  it('closes an unterminated quote at end of input instead of throwing', () => {
    expect(parseCsv('a,b\n"unterminated,ok')).toEqual([
      ['a', 'b'],
      ['unterminated,ok'],
    ]);
  });

  it('supports an alternative delimiter', () => {
    expect(parseCsv('a;b\n1;2', { delimiter: ';' })).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('serialiseCsv', () => {
  it('quotes only the cells that need it', () => {
    expect(escapeCsvCell('plain')).toBe('plain');
    expect(escapeCsvCell('has,comma')).toBe('"has,comma"');
    expect(escapeCsvCell('has"quote')).toBe('"has""quote"');
    expect(escapeCsvCell('line\nbreak')).toBe('"line\nbreak"');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(42)).toBe('42');
  });

  it('writes a header row and CRLF separators, optionally with a BOM', () => {
    const text = serialiseCsv(
      [
        ['user', 'value'],
        ['user-1', 'English, French'],
      ],
      { bom: true },
    );

    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).toBe(`${CSV_BOM}user,value\r\nuser-1,"English, French"\r\n`);
  });

  it('quotes a single empty cell so it survives a round trip', () => {
    expect(serialiseCsv([['']])).toBe('""\r\n');
  });
});

describe('round trip', () => {
  const rows = [
    ['user', 'key', 'value'],
    ['user-1', 'language', 'English, French'],
    ['user-2', 'note', 'line one\nline two'],
    ['user-3', 'quote', 'She said "hello"'],
    ['user-4', 'empty', ''],
    ['user-5', 'plain', 'no special characters'],
  ];

  it('parse(serialise(x)) === x', () => {
    expect(parseCsv(serialiseCsv(rows))).toEqual(rows);
    expect(parseCsv(serialiseCsv(rows, { newline: '\n' }))).toEqual(rows);
    expect(parseCsv(serialiseCsv(rows, { bom: true }))).toEqual(rows);
  });

  it('round-trips through parseCsvTable', () => {
    const table = parseCsvTable(serialiseCsv(rows, { bom: true }));

    expect(table.header).toEqual(rows[0]);
    expect(table.rows).toEqual(rows.slice(1));
  });
});

describe('parseCsvTable', () => {
  it('drops fully empty data rows', () => {
    const table = parseCsvTable('a,b\n1,2\n\n3,4\n');

    expect(table.header).toEqual(['a', 'b']);
    expect(table.rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('returns an empty table for empty input', () => {
    expect(parseCsvTable('')).toEqual({ header: [], rows: [] });
  });
});
