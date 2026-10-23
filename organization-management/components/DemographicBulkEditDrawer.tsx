import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { Close as CloseIcon } from '@mui/icons-material';

import { DemographicFieldRenderer, type DemographicDefinition } from '../../demographic-form';
import {
  describeUser,
  type DemographicMemberDirectory,
} from '../demographicValues';
import type {
  Organization,
  OrganizationDemographicBulkOutcome,
  OrganizationDemographicValue,
  OrganizationDemographicValueInput,
  OrganizationTranslator,
} from '../types';
import type { OrganizationDemographicBulkResult } from '../hooks/useOrganizationDemographicValues';

/**
 * Bulk editor for the values currently loaded in the table (ORG-033).
 *
 * The table's single-row drawer is right for one correction; a compliance
 * clean-up is a batch, and that is what `OrganizationBulkSaveDemographicValues`
 * exists for. This drawer renders every loaded row through the same
 * `demographic-form` control, diffs each draft against the value it opened with,
 * and submits **only the changed rows**.
 *
 * Outcomes are per row and are rendered from the mutation's own result, never
 * inferred from "the call did not throw": the server validates a batch as a
 * whole today, so a refused batch marks every row `rejected` and says why. A
 * partial response (a saved value missing for one of the submitted keys) is
 * reported the same way. A partial failure therefore cannot look like success.
 */
export interface DemographicBulkEditDrawerProps {
  reactory: any;
  t: OrganizationTranslator;
  organization: Organization;
  values: OrganizationDemographicValue[];
  definitions: DemographicDefinition[];
  directory?: DemographicMemberDirectory | null;
  saving: boolean;
  onClose: () => void;
  /** Performs the bulk write and returns its per-row outcome. */
  onSubmit: (
    inputs: OrganizationDemographicValueInput[],
  ) => Promise<OrganizationDemographicBulkResult>;
  onDirtyChange: (dirty: boolean) => void;
}

const serialise = (value: unknown): string => {
  try {
    return JSON.stringify(value === undefined ? null : value);
  } catch {
    return `${value}`;
  }
};

export const DemographicBulkEditDrawer: React.FC<DemographicBulkEditDrawerProps> = ({
  reactory,
  t,
  organization,
  values,
  definitions,
  directory,
  saving,
  onClose,
  onSubmit,
  onDirtyChange,
}) => {
  const rows = useMemo(() => values || [], [values]);

  const definitionByKey = useMemo(() => {
    const map: Record<string, DemographicDefinition> = {};
    (definitions || []).forEach((definition) => {
      if (definition && definition.key) map[definition.key] = definition;
    });
    return map;
  }, [definitions]);

  const [drafts, setDrafts] = useState<Record<number, unknown>>(() => {
    const initial: Record<number, unknown> = {};
    rows.forEach((value, index) => {
      initial[index] = value?.value ?? null;
    });
    return initial;
  });

  const [baselines, setBaselines] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    rows.forEach((value, index) => {
      initial[index] = serialise(value?.value ?? null);
    });
    return initial;
  });

  const [outcomes, setOutcomes] = useState<OrganizationDemographicBulkOutcome[] | null>(null);
  const [submittedCount, setSubmittedCount] = useState<number>(0);

  const changedIndexes = useMemo(
    () =>
      rows
        .map((_value, index) => index)
        .filter((index) => serialise(drafts[index]) !== baselines[index] && definitionByKey[`${rows[index]?.key || ''}`]),
    [baselines, definitionByKey, drafts, rows],
  );

  const dirty = changedIndexes.length > 0;

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    const indexes = changedIndexes;
    if (indexes.length === 0) return;

    const inputs: OrganizationDemographicValueInput[] = indexes.map((index) => ({
      user: `${rows[index]?.user || ''}`,
      key: `${rows[index]?.key || ''}`,
      value: drafts[index] ?? null,
      source: 'admin',
    }));

    setSubmittedCount(inputs.length);
    const result = await onSubmit(inputs);
    setOutcomes(result?.outcomes || []);
  }, [changedIndexes, drafts, onSubmit, rows]);

  const savedCount = (outcomes || []).filter((outcome) => outcome.status === 'saved').length;
  const failedCount = (outcomes || []).filter((outcome) => outcome.status === 'rejected').length;

  /**
   * A fully successful batch is committed work: adopt the drafts as the new
   * baseline so the guard is released and the results stay on screen. A partial
   * failure deliberately keeps the old baseline — some of the input is still
   * unwritten, so the drawer must keep guarding it.
   */
  useEffect(() => {
    if (!outcomes || outcomes.length === 0) return;
    if (outcomes.some((outcome) => outcome.status !== 'saved')) return;

    const next: Record<number, string> = {};
    rows.forEach((_value, index) => {
      next[index] = serialise(drafts[index]);
    });
    setBaselines(next);
    onDirtyChange(false);
    // `drafts` is intentionally read from the closure at the moment the result
    // lands; re-running on every keystroke would re-baseline unsubmitted edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcomes]);

  return (
    <Drawer
      anchor="right"
      open
      onClose={(_event, reason) => {
        if (reason === 'backdropClick' || reason === 'escapeKeyDown') return;
        onClose();
      }}
      PaperProps={{ sx: { width: { xs: '100%', sm: 640 }, maxWidth: '100%' } }}
    >
      <Box
        data-testid="demographic-bulk-drawer"
        sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      >
        <Box sx={{ p: 2, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" component="h2">
              {t('reactory.organizations.demographics.values.bulk.title')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {t('reactory.organizations.demographics.values.bulk.subtitle')}
            </Typography>
          </Box>
          <IconButton
            aria-label={t('reactory.organizations.demographics.values.bulk.closed')}
            onClick={onClose}
            data-testid="demographic-bulk-drawer-close"
          >
            <CloseIcon />
          </IconButton>
        </Box>

        <Divider />

        <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, overflowY: 'auto', flex: 1 }}>
          {rows.length === 0 && (
            <Typography variant="body2" color="text.secondary" data-testid="demographic-bulk-empty">
              {t('reactory.organizations.demographics.values.bulk.empty')}
            </Typography>
          )}

          {rows.map((value, index) => {
            const definition = definitionByKey[`${value?.key || ''}`];
            const user = describeUser(t, directory, value?.user);

            return (
              <Box key={`${index}-${value?.key || ''}-${value?.user || ''}`} data-testid={`demographic-bulk-row-${index}`}>
                <Typography variant="subtitle2" component="h3">
                  {definition?.title || value?.key} — {user.label}
                </Typography>
                {definition ? (
                  <DemographicFieldRenderer
                    definition={definition}
                    value={drafts[index]}
                    onChange={(next) =>
                      setDrafts((previous) => ({ ...previous, [index]: next }))
                    }
                    disabled={saving}
                    mode="edit"
                    organization={organization}
                    user={{ id: value?.user }}
                    reactory={reactory}
                  />
                ) : (
                  <Typography variant="caption" color="text.secondary">
                    {t('reactory.organizations.demographics.completeness.unavailable')}
                  </Typography>
                )}
              </Box>
            );
          })}

          {outcomes && (
            <Box data-testid="demographic-bulk-results">
              <Typography variant="subtitle1" component="h3">
                {t('reactory.organizations.demographics.values.bulk.result.title')}
              </Typography>
              <Alert severity={failedCount > 0 ? 'error' : 'success'} sx={{ mb: 1 }}>
                {t('reactory.organizations.demographics.values.bulk.result.summary', {
                  saved: savedCount,
                  failed: failedCount,
                })}
              </Alert>
              <Stack spacing={0.5}>
                {outcomes.map((outcome) => (
                  <Typography
                    key={`${outcome.index}-${outcome.key}-${outcome.user}`}
                    variant="body2"
                    data-testid={`demographic-bulk-outcome-${outcome.index}`}
                  >
                    {outcome.key} — {describeUser(t, directory, outcome.user).label}:{' '}
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
        </Box>

        <Divider />
        <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ p: 2 }}>
          <Button
            onClick={onClose}
            disabled={saving}
            data-testid="demographic-bulk-drawer-cancel"
          >
            {t('reactory.organizations.demographics.values.bulk.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSubmit()}
            disabled={saving || changedIndexes.length === 0}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}
            data-testid="demographic-bulk-drawer-save"
          >
            {saving
              ? t('reactory.organizations.demographics.values.bulk.saving')
              : t('reactory.organizations.demographics.values.bulk.save', {
                  count: changedIndexes.length,
                })}
          </Button>
        </Stack>

        {submittedCount > 0 && outcomes && failedCount === 0 && (
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="caption" color="text.secondary">
              {t('reactory.organizations.demographics.values.bulk.result.allSaved', {
                count: savedCount,
              })}
            </Typography>
          </Box>
        )}
      </Box>
    </Drawer>
  );
};

export default DemographicBulkEditDrawer;
