import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

import { parseCsvTable, type CsvTable } from '../demographicCsv';
import {
  IMPORT_TARGET_IGNORE,
  IMPORT_TARGET_USER,
  buildImportPreview,
  importRowToInputs,
  inferImportMapping,
  type DemographicImportMappingRow,
  type DemographicImportRow,
  type DemographicMemberDirectory,
} from '../demographicValues';
import type {
  DemographicDefinition,
} from '../../demographic-form';
import type {
  OrganizationDemographicBulkOutcome,
  OrganizationDemographicValueInput,
  OrganizationTranslator,
} from '../types';
import type { OrganizationDemographicBulkResult } from '../hooks/useOrganizationDemographicValues';

/**
 * CSV import with an explicit column → definition mapping step (ORG-033).
 *
 * There is no server-side import endpoint, so this is entirely client-side:
 * parse the file, let the administrator say what each column means, validate
 * every row, and only then submit the valid rows through
 * `OrganizationBulkSaveDemographicValues`.
 *
 * Three properties the ticket asks for and this component enforces:
 *
 *   - **Nothing is written before the preview.** Parsing, mapping and validation
 *     are pure; the submit button is the only thing that issues a mutation, and
 *     it is disabled while nothing is valid.
 *   - **Invalid rows are never submitted.** `importRowToInputs` is called only
 *     for rows the preview marked valid; an invalid row stays visible with its
 *     reason so it can be fixed and re-imported.
 *   - **The guard is honest.** `onDirtyChange(true)` is raised once a file with
 *     data rows is loaded and cleared only when the import completes (or the
 *     dialog is discarded), never because a request was attempted.
 */
export interface DemographicImportDialogProps {
  reactory: any;
  t: OrganizationTranslator;
  definitions: DemographicDefinition[];
  directory?: DemographicMemberDirectory | null;
  saving: boolean;
  onClose: () => void;
  /** Performs the bulk write for the valid preview rows. */
  onImport: (
    inputs: OrganizationDemographicValueInput[],
  ) => Promise<OrganizationDemographicBulkResult>;
  onDirtyChange: (dirty: boolean) => void;
}

/** Read a `File` as text, preferring the Blob API and falling back to FileReader. */
export const readFileText = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (file && typeof (file as any).text === 'function') {
      (file as any)
        .text()
        .then((text: string) => resolve(`${text || ''}`))
        .catch(reject);
      return;
    }

    if (typeof FileReader === 'undefined') {
      reject(new Error('FileReader is not available'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(`${reader.result || ''}`);
    reader.onerror = () => reject(reader.error || new Error('The file could not be read'));
    reader.readAsText(file);
  });

export const DemographicImportDialog: React.FC<DemographicImportDialogProps> = ({
  reactory,
  t,
  definitions,
  directory,
  saving,
  onClose,
  onImport,
  onDirtyChange,
}) => {
  const [fileName, setFileName] = useState<string>('');
  const [table, setTable] = useState<CsvTable | null>(null);
  const [mapping, setMapping] = useState<DemographicImportMappingRow[]>([]);
  const [readError, setReadError] = useState<string>('');
  const [outcomes, setOutcomes] = useState<OrganizationDemographicBulkOutcome[] | null>(null);
  const [committed, setCommitted] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // A partial failure leaves uncommitted input behind, so only a fully
  // committed import (or a discard) releases the guard.
  const dirty = Boolean(table && table.rows.length > 0) && !committed;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const preview = useMemo<DemographicImportRow[]>(() => {
    if (!table) return [];
    return buildImportPreview({
      rows: table.rows,
      mapping,
      definitions,
      directory,
    });
  }, [definitions, directory, mapping, table]);

  const validRows = preview.filter((row) => row.valid);
  const invalidRows = preview.filter((row) => !row.valid);

  const handleFile = useCallback(
    async (file: File | null | undefined): Promise<void> => {
      setReadError('');
      setOutcomes(null);
      setCommitted(false);

      if (!file) {
        setFileName('');
        setTable(null);
        setMapping([]);
        return;
      }

      try {
        const text = await readFileText(file);
        const parsed = parseCsvTable(text);

        setFileName(file.name || '');
        setTable(parsed);
        setMapping(inferImportMapping(parsed.header, definitions));
      } catch {
        setFileName(file.name || '');
        setTable(null);
        setMapping([]);
        setReadError(t('reactory.organizations.demographics.values.csv.preview.noRows'));
      }
    },
    [definitions, t],
  );

  const updateTarget = useCallback((index: number, target: string): void => {
    setMapping((previous) =>
      previous.map((entry) => (entry.index === index ? { ...entry, target } : entry)),
    );
    // A new mapping is new uncommitted work.
    setOutcomes(null);
    setCommitted(false);
  }, []);

  const handleImport = useCallback(async (): Promise<void> => {
    if (validRows.length === 0) return;

    const inputs = validRows.reduce<OrganizationDemographicValueInput[]>(
      (accumulator, row) => accumulator.concat(importRowToInputs(row)),
      [],
    );

    setSubmitting(true);
    try {
      const result = await onImport(inputs);
      const received = result?.outcomes || [];
      setOutcomes(received);
      setCommitted(received.length > 0 && received.every((outcome) => outcome.status === 'saved'));
    } finally {
      setSubmitting(false);
    }
  }, [onImport, validRows]);

  const savedCount = (outcomes || []).filter((outcome) => outcome.status === 'saved').length;
  const failedCount = (outcomes || []).filter((outcome) => outcome.status === 'rejected').length;

  return (
    <Dialog
      open
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      fullWidth
      maxWidth="md"
      data-testid="demographic-import-dialog"
    >
      <DialogTitle>{t('reactory.organizations.demographics.values.csv.importTitle')}</DialogTitle>

      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          {t('reactory.organizations.demographics.values.csv.subtitle')}
        </Typography>

        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Button variant="outlined" component="label" data-testid="demographic-import-choose">
            {t('reactory.organizations.demographics.values.csv.chooseFile')}
            <input
              hidden
              type="file"
              accept=".csv,text/csv"
              data-testid="demographic-import-file"
              onChange={(event) => {
                const file = event.target.files && event.target.files[0];
                void handleFile(file || null);
              }}
            />
          </Button>
          {fileName && (
            <Typography variant="body2" data-testid="demographic-import-file-name">
              {fileName}
            </Typography>
          )}
        </Stack>

        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>
          {t('reactory.organizations.demographics.values.csv.fileHint')}
        </Typography>

        {readError && (
          <Alert severity="error" sx={{ mt: 2 }} data-testid="demographic-import-read-error">
            {readError}
          </Alert>
        )}

        {table && table.rows.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }} data-testid="demographic-import-no-rows">
            {t('reactory.organizations.demographics.values.csv.preview.noRows')}
          </Alert>
        )}

        {table && table.header.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.values.csv.mapping.title')}
            </Typography>

            <Stack spacing={1} sx={{ mt: 1 }} data-testid="demographic-import-mapping">
              {mapping.map((entry) => (
                <Stack
                  key={`${entry.index}-${entry.column}`}
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  alignItems={{ xs: 'stretch', sm: 'center' }}
                >
                  <Typography variant="body2" sx={{ flex: 1 }}>
                    {entry.column || `#${entry.index + 1}`}
                  </Typography>
                  <TextField
                    select
                    size="small"
                    label={t('reactory.organizations.demographics.values.csv.mapping.target')}
                    value={entry.target}
                    onChange={(event) => updateTarget(entry.index, event.target.value)}
                    sx={{ minWidth: 240 }}
                    inputProps={{ 'data-testid': `demographic-import-map-${entry.index}` }}
                  >
                    <MenuItem value={IMPORT_TARGET_IGNORE}>
                      {t('reactory.organizations.demographics.values.csv.mapping.ignore')}
                    </MenuItem>
                    <MenuItem value={IMPORT_TARGET_USER}>
                      {t('reactory.organizations.demographics.values.csv.mapping.user')}
                    </MenuItem>
                    {(definitions || []).map((definition) => (
                      <MenuItem key={definition.key} value={definition.key}>
                        {definition.title || definition.key} ({definition.key})
                      </MenuItem>
                    ))}
                  </TextField>
                </Stack>
              ))}
            </Stack>

            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.values.csv.preview.title')}
            </Typography>

            {preview.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                {t('reactory.organizations.demographics.values.csv.preview.noRows')}
              </Typography>
            ) : (
              <>
                <Typography
                  variant="body2"
                  sx={{ mt: 1 }}
                  data-testid="demographic-import-summary"
                >
                  {t('reactory.organizations.demographics.values.csv.preview.summary', {
                    valid: validRows.length,
                    invalid: invalidRows.length,
                  })}
                </Typography>

                <TableContainer sx={{ maxHeight: 280, mt: 1 }}>
                  <Table size="small" data-testid="demographic-import-preview">
                    <TableHead>
                      <TableRow>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.csv.preview.row')}
                        </TableCell>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.csv.preview.user')}
                        </TableCell>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.csv.preview.values')}
                        </TableCell>
                        <TableCell>
                          {t('reactory.organizations.demographics.values.csv.preview.status')}
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {preview.map((row, index) => (
                        <TableRow
                          key={`${row.rowNumber}-${row.userRaw}`}
                          data-testid={`demographic-import-row-${index}`}
                        >
                          <TableCell>{row.rowNumber}</TableCell>
                          <TableCell>{row.userRaw || '—'}</TableCell>
                          <TableCell>
                            {row.values.length === 0
                              ? '—'
                              : row.values
                                  .map((value) => `${value.key}: ${value.raw}`)
                                  .join(', ')}
                          </TableCell>
                          <TableCell data-testid={`demographic-import-status-${index}`}>
                            <Typography
                              variant="body2"
                              color={row.valid ? 'success.main' : 'error.main'}
                            >
                              {row.valid
                                ? t('reactory.organizations.demographics.values.csv.preview.valid')
                                : t('reactory.organizations.demographics.values.csv.preview.invalid')}
                            </Typography>
                            {!row.valid && row.errorKey && (
                              <Typography variant="caption" color="error">
                                {row.errorKeyOf ? `${row.errorKeyOf}: ` : ''}
                                {t(row.errorKey)}
                              </Typography>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </>
            )}
          </>
        )}

        {outcomes && (
          <Box sx={{ mt: 2 }} data-testid="demographic-import-outcomes">
            <Typography variant="subtitle1" component="h3">
              {t('reactory.organizations.demographics.values.csv.result.title')}
            </Typography>
            <Alert severity={failedCount > 0 ? 'error' : 'success'} sx={{ mb: 1 }}>
              {t('reactory.organizations.demographics.values.csv.result.summary', {
                saved: savedCount,
                failed: failedCount,
              })}
            </Alert>
            <Stack spacing={0.5}>
              {outcomes.map((outcome) => (
                <Typography
                  key={`${outcome.index}-${outcome.key}-${outcome.user}`}
                  variant="body2"
                  data-testid={`demographic-import-outcome-${outcome.index}`}
                >
                  {outcome.key} —{' '}
                  {outcome.status === 'saved'
                    ? t('reactory.organizations.demographics.values.bulk.result.saved')
                    : `${t('reactory.organizations.demographics.values.bulk.result.rejected')}${
                        outcome.message ? ` — ${outcome.message}` : ''
                      }`}
                </Typography>
              ))}
            </Stack>
          </Box>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={saving || submitting} data-testid="demographic-import-cancel">
          {outcomes
            ? t('reactory.organizations.demographics.values.csv.close')
            : t('reactory.organizations.demographics.values.csv.cancel')}
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleImport()}
          disabled={saving || submitting || validRows.length === 0}
          startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : undefined}
          data-testid="demographic-import-submit"
        >
          {submitting
            ? t('reactory.organizations.demographics.values.csv.submitting')
            : t('reactory.organizations.demographics.values.csv.submit', {
                count: validRows.length,
              })}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DemographicImportDialog;
