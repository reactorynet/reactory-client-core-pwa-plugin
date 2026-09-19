/** Minimal column descriptor for CSV export. */
export interface CsvColumn {
  field: string;
  title?: string;
}

const csvCell = (value: any): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** CSV text for a set of rows, with a header row taken from the columns. */
export const toCsv = (
  columns: CsvColumn[],
  rows: Array<Record<string, any>>,
): string => {
  const header = columns.map((column) => csvCell(column.title || column.field)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => csvCell(row[column.field])).join(','),
  );
  return [header, ...body].join('\r\n');
};

/** Trigger a client-side download of CSV text. No-op outside a DOM. */
export const downloadCsv = (filename: string, csv: string): void => {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    return;
  }

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};
