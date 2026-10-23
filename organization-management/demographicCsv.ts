/**
 * Minimal, dependency-free CSV reader/writer for the demographics values pane
 * (ORG-033).
 *
 * The plugin had no CSV utility, and a naive `split(',')` / `split('\n')` is
 * wrong for this data: a demographic value is free text and routinely contains
 * commas, quotes and newlines. This module therefore implements the parts of
 * RFC 4180 that matter here:
 *
 *   - quoted fields, with `""` as the escaped quote;
 *   - delimiters, CR/LF and double quotes inside a quoted field;
 *   - CRLF, LF and lone-CR record separators;
 *   - a UTF-8 BOM at the start of the text (Excel writes one);
 *   - a trailing record separator does not invent an empty row.
 *
 * It is deliberately text-in / text-out. Nothing here knows about demographic
 * definitions or GraphQL: `demographicValues.ts` owns that mapping, and this
 * module stays unit-testable without a DOM.
 */

/** The byte-order mark Excel prepends to a UTF-8 CSV export. */
export const CSV_BOM = '\uFEFF';

export interface ParseCsvOptions {
  /** Field separator; defaults to `,`. */
  delimiter?: string;
}

export interface SerialiseCsvOptions {
  delimiter?: string;
  /** Record separator; defaults to CRLF so Excel opens the file correctly. */
  newline?: '\n' | '\r\n';
  /** Prefix the text with a UTF-8 BOM. */
  bom?: boolean;
}

/** Remove a leading BOM, leaving every other character untouched. */
export const stripBom = (text: string): string =>
  typeof text === 'string' && text.charCodeAt(0) === 0xfeff ? text.slice(1) : `${text ?? ''}`;

/**
 * Parse CSV text into rows of raw cell text.
 *
 * Lenient by design: an unterminated quote is closed at end of input rather
 * than throwing, and characters after a closing quote are appended literally.
 * A malformed file must reach the importer's preview as data so the
 * administrator can see which row is wrong, not blow up the dialog.
 */
export const parseCsv = (text: string, options: ParseCsvOptions = {}): string[][] => {
  const delimiter = options.delimiter && options.delimiter.length > 0 ? options.delimiter : ',';
  const source = stripBom(text ?? '');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const endField = (): void => {
    row.push(field);
    field = '';
  };

  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < source.length) {
    const character = source[index];

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += character;
      index += 1;
      continue;
    }

    // A quote only opens a quoted field at the start of that field; anywhere
    // else it is an ordinary character.
    if (character === '"' && field.length === 0) {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (character === delimiter) {
      endField();
      index += 1;
      continue;
    }

    if (character === '\r' || character === '\n') {
      // CRLF is one separator, not two.
      if (character === '\r' && source[index + 1] === '\n') index += 1;
      endRow();
      index += 1;
      continue;
    }

    field += character;
    index += 1;
  }

  // Emit the pending record, but never a phantom one after a trailing newline.
  if (field.length > 0 || row.length > 0) endRow();

  return rows;
};

/** Quote a cell when its text would otherwise not survive a round trip. */
export const escapeCsvCell = (value: unknown, delimiter = ','): string => {
  const text =
    value === null || value === undefined
      ? ''
      : typeof value === 'string'
        ? value
        : typeof value === 'object'
          ? JSON.stringify(value)
          : `${value}`;

  const needsQuotes =
    text.indexOf(delimiter) >= 0 ||
    text.indexOf('"') >= 0 ||
    text.indexOf('\n') >= 0 ||
    text.indexOf('\r') >= 0;

  return needsQuotes ? `"${text.replace(/"/g, '""')}"` : text;
};

/**
 * Serialise rows into CSV text.
 *
 * A row consisting of a single empty cell is written as `""`, because the
 * unquoted form (an empty line) is indistinguishable from "no row" once the
 * trailing separator rule above is applied — and `parse(serialise(x)) === x` is
 * a property this module promises.
 */
export const serialiseCsv = (
  rows: ReadonlyArray<ReadonlyArray<unknown>>,
  options: SerialiseCsvOptions = {},
): string => {
  const delimiter = options.delimiter && options.delimiter.length > 0 ? options.delimiter : ',';
  const newline = options.newline || '\r\n';

  const lines = (rows || []).map((row) => {
    const cells = Array.isArray(row) ? row : [];
    if (cells.length === 1 && `${cells[0] ?? ''}`.length === 0) return '""';
    return cells.map((cell) => escapeCsvCell(cell, delimiter)).join(delimiter);
  });

  const body = lines.join(newline);
  const terminated = lines.length > 0 ? `${body}${newline}` : '';
  return `${options.bom ? CSV_BOM : ''}${terminated}`;
};

export interface CsvTable {
  header: string[];
  rows: string[][];
}

/**
 * Split parsed rows into a header row and data rows.
 *
 * Fully empty data rows (the artefact of trailing or interior blank lines) are
 * dropped here rather than in the importer, so the preview never shows a row
 * that contains nothing at all.
 */
export const parseCsvTable = (text: string, options: ParseCsvOptions = {}): CsvTable => {
  const rows = parseCsv(text, options);
  if (rows.length === 0) return { header: [], rows: [] };

  const [header, ...rest] = rows;
  return {
    header,
    rows: rest.filter((row) => row.some((cell) => `${cell ?? ''}`.trim().length > 0)),
  };
};

export default parseCsv;
