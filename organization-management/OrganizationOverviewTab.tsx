import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  Grid,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import useOrganizationAdmin from './hooks/useOrganizationAdmin';
import { resolveError, type OrganizationMessageKey } from './i18n';
import { NAME_MAX_LENGTH } from './OrganizationCreateWizard';
import type { Organization, OrganizationTabProps } from './types';
import { formatUpdated } from './utils';

/**
 * Overview tab (ORG-011).
 *
 * Edits the organization's identity and contact fields with an explicit
 * Save/Cancel, dirty tracking and per-field validation. All writes go through
 * `useOrganizationAdmin`, which owns the mutation, the in-flight flag and the
 * error mapping — this component never builds a GraphQL document.
 *
 * Field-clearing contract
 * -----------------------
 * The server treats an **omitted** field as "leave unchanged" and a
 * **null/blank** value as "clear the field" (`UpdateOrganizationInput` in
 * `reactory-core/graphql/types/Organization/Organization.graphql`, fixed by
 * ORG-002). `buildOverviewUpdateInput` therefore sends *only* the fields the
 * user actually changed, and sends `null` — never the previous value — when the
 * user emptied one. Coercing a blank back to the loaded value is precisely the
 * bug class ORG-002 fixed server-side, so it must not be reintroduced here.
 */

/** Editable fields, in the order they are rendered. */
export type OrganizationOverviewField =
  | 'name'
  | 'code'
  | 'tradingName'
  | 'legalName'
  | 'description'
  | 'website'
  | 'contactEmail'
  | 'contactPhone'
  | 'status';

/** The form's working copy: every field is a string so inputs stay controlled. */
export interface OrganizationOverviewDraft {
  name: string;
  code: string;
  tradingName: string;
  legalName: string;
  description: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  status: string;
}

/**
 * A field-level problem.
 *
 * `key` is always present so a translation exists; `message` carries the
 * server's own text when the server rejected the value (that text names the
 * actual reason and cannot be translated).
 */
export interface OrganizationOverviewIssue {
  key: OrganizationMessageKey;
  values?: Record<string, string | number>;
  message?: string;
}

export type OrganizationOverviewErrors = Partial<
  Record<OrganizationOverviewField, OrganizationOverviewIssue>
>;

/** Fields the server accepts as nullable clearing values. */
const CLEARABLE_FIELDS: Array<Exclude<OrganizationOverviewField, 'name' | 'status'>> = [
  'code',
  'tradingName',
  'legalName',
  'description',
  'website',
  'contactEmail',
  'contactPhone',
];

const STATUS_VALUES = ['active', 'suspended', 'archived'] as const;

const STATUS_LABEL_KEYS: Record<string, OrganizationMessageKey> = {
  active: 'reactory.organizations.list.statusActive',
  suspended: 'reactory.organizations.list.statusSuspended',
  archived: 'reactory.organizations.list.statusArchived',
};

/** Pragmatic email check: one local part, one `@`, one dotted domain. */
export const OVERVIEW_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True when the value parses as an absolute http(s) URL with a host. */
export const isHttpUrl = (value: string): boolean => {
  const candidate = (value || '').trim();
  if (candidate.length === 0) return false;

  try {
    const parsed = new URL(candidate);
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      parsed.hostname.length > 0
    );
  } catch {
    return false;
  }
};

/** Project an organization onto the form's string-only draft. */
export const overviewDraftFromOrganization = (
  organization?: Organization | null,
): OrganizationOverviewDraft => ({
  name: organization?.name || '',
  code: organization?.code || '',
  tradingName: organization?.tradingName || '',
  legalName: organization?.legalName || '',
  description: organization?.description || '',
  website: organization?.website || '',
  contactEmail: organization?.contactEmail || '',
  contactPhone: organization?.contactPhone || '',
  status: (organization?.status || 'active').toString(),
});

/**
 * True when the draft differs from what was loaded.
 *
 * Comparison is on trimmed values: adding or removing trailing whitespace is
 * not an edit worth enabling Save for, and it would otherwise produce a
 * mutation that changes nothing.
 */
export const overviewDraftIsDirty = (
  baseline: OrganizationOverviewDraft,
  draft: OrganizationOverviewDraft,
): boolean =>
  (Object.keys(baseline) as OrganizationOverviewField[]).some(
    (field) => (baseline[field] || '').trim() !== (draft[field] || '').trim(),
  );

/**
 * Validate the whole form before submit.
 *
 * Only the rules the ticket states — a required name, a valid email when one is
 * given, and a valid http(s) website when one is given — plus the name length
 * the create wizard already enforces, so an organization cannot be edited into
 * a state the wizard would refuse to create.
 */
export const validateOverviewDraft = (
  draft: OrganizationOverviewDraft,
): OrganizationOverviewErrors => {
  const errors: OrganizationOverviewErrors = {};

  const name = (draft.name || '').trim();
  if (name.length === 0) {
    errors.name = { key: 'reactory.organizations.overview.field.nameRequired' };
  } else if (name.length > NAME_MAX_LENGTH) {
    errors.name = {
      key: 'reactory.organizations.overview.field.nameTooLong',
      values: { max: NAME_MAX_LENGTH },
    };
  }

  const contactEmail = (draft.contactEmail || '').trim();
  if (contactEmail.length > 0 && OVERVIEW_EMAIL_PATTERN.test(contactEmail) === false) {
    errors.contactEmail = { key: 'reactory.organizations.overview.field.emailInvalid' };
  }

  const website = (draft.website || '').trim();
  if (website.length > 0 && isHttpUrl(website) === false) {
    errors.website = { key: 'reactory.organizations.overview.field.websiteInvalid' };
  }

  return errors;
};

/**
 * Build the `UpdateOrganizationInput` payload from the changed fields only.
 *
 * Sending only what changed keeps an unrelated field from being rewritten, and
 * a cleared field is sent as `null` so the server clears it instead of keeping
 * the previous value.
 */
export const buildOverviewUpdateInput = (
  baseline: OrganizationOverviewDraft,
  draft: OrganizationOverviewDraft,
): Record<string, any> => {
  const input: Record<string, any> = {};

  const name = (draft.name || '').trim();
  if (name !== (baseline.name || '').trim()) input.name = name;

  CLEARABLE_FIELDS.forEach((field) => {
    const value = (draft[field] || '').trim();
    if (value === (baseline[field] || '').trim()) return;
    input[field] = value.length > 0 ? value : null;
  });

  const status = (draft.status || '').trim();
  if (status.length > 0 && status !== (baseline.status || '').trim()) {
    input.status = status;
  }

  return input;
};

/**
 * Decide which field a server rejection refers to.
 *
 * The server names the offending input in its message (for example
 * "contactEmail must be a valid email"), which is the only signal available:
 * GraphQL errors from this resolver are plain strings. Longest-first matching
 * keeps "contactEmail" from being read as a name problem. Anything unmatched
 * stays a form-level error — guessing would point the user at the wrong field.
 */
export const fieldForServerMessage = (
  message?: string | null,
): OrganizationOverviewField | null => {
  const text = (message || '').toLowerCase();
  if (text.length === 0) return null;

  if (/contact ?e[-_]?mail|e[-_]?mail/.test(text)) return 'contactEmail';
  if (/website|url/.test(text)) return 'website';
  if (/contact ?phone|phone|telephone/.test(text)) return 'contactPhone';
  if (/trading ?name/.test(text)) return 'tradingName';
  if (/legal ?name/.test(text)) return 'legalName';
  if (/description/.test(text)) return 'description';
  if (/status/.test(text)) return 'status';
  if (/\bcode\b/.test(text)) return 'code';
  if (/\bname\b/.test(text)) return 'name';

  return null;
};

interface ReadOnlyRowProps {
  label: string;
  value?: string | null;
  notSet: string;
}

const ReadOnlyRow: React.FC<ReadOnlyRowProps> = ({ label, value, notSet }) => (
  <Grid item xs={12} sm={6} md={3}>
    <Typography variant="caption" color="text.secondary" display="block">
      {label}
    </Typography>
    <Typography variant="body2">{value && `${value}`.length > 0 ? value : notSet}</Typography>
  </Grid>
);

/**
 * Renders the organization's identity, contact and status fields.
 *
 * Standalone-usable: every input comes from `OrganizationTabProps`, which the
 * shell supplies. Rendering it directly (as the tests do) needs no provider.
 */
export const OrganizationOverviewTab: React.FC<OrganizationTabProps> = ({
  reactory,
  t,
  organization,
  canManage,
  refresh,
  onUnsavedChanges,
  notify,
}) => {
  const admin = useOrganizationAdmin(reactory);

  const [baseline, setBaseline] = useState<OrganizationOverviewDraft>(() =>
    overviewDraftFromOrganization(organization),
  );
  const [draft, setDraft] = useState<OrganizationOverviewDraft>(() =>
    overviewDraftFromOrganization(organization),
  );
  const [errors, setErrors] = useState<OrganizationOverviewErrors>({});

  // A reloaded organization is the new truth: reset the working copy so the
  // form can never show a value the server no longer has.
  useEffect(() => {
    const next = overviewDraftFromOrganization(organization);
    setBaseline(next);
    setDraft(next);
    setErrors({});
  }, [organization]);

  const dirty = useMemo(() => overviewDraftIsDirty(baseline, draft), [baseline, draft]);

  useEffect(() => {
    onUnsavedChanges(dirty);
  }, [dirty, onUnsavedChanges]);

  // Switching tabs unmounts the tab; the shell must not keep guarding for a
  // form that no longer exists.
  useEffect(
    () => () => {
      onUnsavedChanges(false);
    },
    [onUnsavedChanges],
  );

  /**
   * Which field the last server rejection named, if any.
   *
   * `update` returns `null` on failure and stores the details on the hook, so
   * the error is read from the hook rather than from the pre-await closure.
   */
  const serverErrorField = admin.error
    ? fieldForServerMessage(admin.error.serverMessage)
    : null;

  /**
   * A rejection that names no field is shown as a form-level banner.
   *
   * Derived, not copied into local state: the hook stores its error before
   * `update` returns, so a hand-set copy could land after this derivation and
   * leave the generic message on screen next to a field error.
   */
  const formError =
    admin.error && !serverErrorField ? resolveError(t, admin.error) : null;

  // A field-scoped rejection belongs under that input, not in a banner.
  useEffect(() => {
    if (!admin.error || !serverErrorField) return;

    setErrors((previous) => ({
      ...previous,
      [serverErrorField]: {
        key: admin.error!.key,
        message: resolveError(t, admin.error),
      },
    }));
  }, [admin.error, serverErrorField]);

  const updateField = useCallback(
    (field: OrganizationOverviewField, value: string) => {
      setDraft((previous) => ({ ...previous, [field]: value }));
      setErrors((previous) => {
        if (!previous[field]) return previous;
        const next = { ...previous };
        delete next[field];
        return next;
      });
    },
    [],
  );

  const handleCancel = useCallback(() => {
    setDraft(baseline);
    setErrors({});
    admin.clearError();
    onUnsavedChanges(false);
  }, [admin, baseline, onUnsavedChanges]);

  const handleSave = useCallback(async () => {
    const validation = validateOverviewDraft(draft);
    setErrors(validation);
    admin.clearError();

    if (Object.keys(validation).length > 0) return;

    const input = buildOverviewUpdateInput(baseline, draft);
    if (Object.keys(input).length === 0) {
      // Nothing changed; treat the click as a no-op rather than a write.
      setDraft(baseline);
      return;
    }

    const saved = await admin.update(organization.id, input);

    if (!saved) {
      // The banner is derived from `admin.error`; the notification needs no
      // detail, because the form already shows the server's own message.
      notify(t('reactory.organizations.overview.saveFailed'), 'error');
      return;
    }

    // The mutation returns the saved record, so the form can settle on the
    // server's values without waiting for the reload.
    const next = overviewDraftFromOrganization(saved);
    setBaseline(next);
    setDraft(next);
    setErrors({});
    onUnsavedChanges(false);

    notify(t('reactory.organizations.overview.saved', { name: saved.name }), 'success');

    if (reactory && typeof reactory.emit === 'function') {
      reactory.emit('core.OrganizationUpdatedEvent', saved);
    }

    try {
      await refresh();
    } catch {
      // The save succeeded; a failed reload is not a failed save and must not
      // turn the notification above into a lie.
    }
  }, [admin, baseline, draft, notify, onUnsavedChanges, organization.id, reactory, refresh, t]);

  const readOnly = canManage === false;
  const fieldProps = readOnly ? { disabled: true } : {};
  const helperFor = (field: OrganizationOverviewField): string | undefined => {
    const issue = errors[field];
    if (!issue) return undefined;
    return issue.message || t(issue.key, issue.values);
  };

  return (
    <Stack spacing={3} data-testid="organization-overview-tab">
      {readOnly && (
        <Alert severity="info" variant="outlined" data-testid="organization-overview-readonly">
          {t('reactory.organizations.detail.readOnly')}
        </Alert>
      )}

      {formError && (
        <Alert severity="error" data-testid="organization-overview-form-error">
          {formError}
        </Alert>
      )}

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            {t('reactory.organizations.overview.section.identity')}
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                required
                fullWidth
                label={t('reactory.organizations.overview.field.name')}
                value={draft.name}
                onChange={(event) => updateField('name', event.target.value)}
                error={Boolean(errors.name)}
                helperText={helperFor('name')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                label={t('reactory.organizations.overview.field.code')}
                value={draft.code}
                onChange={(event) => updateField('code', event.target.value)}
                error={Boolean(errors.code)}
                helperText={helperFor('code')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                label={t('reactory.organizations.overview.field.tradingName')}
                value={draft.tradingName}
                onChange={(event) => updateField('tradingName', event.target.value)}
                error={Boolean(errors.tradingName)}
                helperText={helperFor('tradingName')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                label={t('reactory.organizations.overview.field.legalName')}
                value={draft.legalName}
                onChange={(event) => updateField('legalName', event.target.value)}
                error={Boolean(errors.legalName)}
                helperText={helperFor('legalName')}
              />
            </Grid>

            <Grid item xs={12}>
              <TextField
                {...fieldProps}
                fullWidth
                multiline
                minRows={3}
                label={t('reactory.organizations.overview.field.description')}
                value={draft.description}
                onChange={(event) => updateField('description', event.target.value)}
                error={Boolean(errors.description)}
                helperText={helperFor('description')}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            {t('reactory.organizations.overview.section.contact')}
          </Typography>

          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                type="url"
                label={t('reactory.organizations.overview.field.website')}
                value={draft.website}
                onChange={(event) => updateField('website', event.target.value)}
                error={Boolean(errors.website)}
                helperText={helperFor('website')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                type="email"
                label={t('reactory.organizations.overview.field.contactEmail')}
                value={draft.contactEmail}
                onChange={(event) => updateField('contactEmail', event.target.value)}
                error={Boolean(errors.contactEmail)}
                helperText={helperFor('contactEmail')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                fullWidth
                label={t('reactory.organizations.overview.field.contactPhone')}
                value={draft.contactPhone}
                onChange={(event) => updateField('contactPhone', event.target.value)}
                error={Boolean(errors.contactPhone)}
                helperText={helperFor('contactPhone')}
              />
            </Grid>

            <Grid item xs={12} sm={6}>
              <TextField
                {...fieldProps}
                select
                fullWidth
                label={t('reactory.organizations.overview.field.status')}
                value={draft.status}
                onChange={(event) => updateField('status', event.target.value)}
                error={Boolean(errors.status)}
                helperText={helperFor('status')}
              >
                {STATUS_VALUES.map((value) => (
                  <MenuItem key={value} value={value}>
                    {t(STATUS_LABEL_KEYS[value])}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card variant="outlined">
        <CardContent>
          <Typography variant="subtitle1" component="h2" gutterBottom>
            {t('reactory.organizations.overview.section.record')}
          </Typography>

          <Grid container spacing={2}>
            <ReadOnlyRow
              label={t('reactory.organizations.overview.field.createdAt')}
              value={formatUpdated(organization.createdAt)}
              notSet={t('reactory.organizations.list.notSet')}
            />
            <ReadOnlyRow
              label={t('reactory.organizations.overview.field.updatedAt')}
              value={formatUpdated(organization.updatedAt)}
              notSet={t('reactory.organizations.list.notSet')}
            />
            {organization.createdBy ? (
              <ReadOnlyRow
                label={t('reactory.organizations.overview.field.createdBy')}
                value={organization.createdBy}
                notSet={t('reactory.organizations.list.notSet')}
              />
            ) : null}
            {organization.updatedBy ? (
              <ReadOnlyRow
                label={t('reactory.organizations.overview.field.updatedBy')}
                value={organization.updatedBy}
                notSet={t('reactory.organizations.list.notSet')}
              />
            ) : null}
          </Grid>
        </CardContent>
      </Card>

      {!readOnly && (
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={handleCancel} disabled={!dirty || admin.saving}>
            {t('reactory.organizations.overview.cancel')}
          </Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={!dirty || admin.saving}
          >
            {admin.saving
              ? t('reactory.organizations.overview.saving')
              : t('reactory.organizations.overview.save')}
          </Button>
        </Stack>
      )}
    </Stack>
  );
};

export default OrganizationOverviewTab;
