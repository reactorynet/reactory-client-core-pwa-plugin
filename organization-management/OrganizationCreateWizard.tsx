import React, { useEffect, useMemo, useState } from 'react';
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
  FormControl,
  FormControlLabel,
  FormHelperText,
  Radio,
  RadioGroup,
  Stack,
  Step,
  StepLabel,
  Stepper,
  TextField,
  Typography,
} from '@mui/material';
import { useReactory } from '@reactory/client-core/api';

import { makeTranslator, resolveError, type OrganizationMessageKey } from './i18n';
import { useDemographicDefinitions, useOrganizationAdmin } from './hooks/useOrganizationAdmin';
import type {
  Organization,
  OrganizationBrandingChoice,
  OrganizationCreateDraft,
  OrganizationError,
} from './types';

export const NAME_MAX_LENGTH = 120;
export const CODE_MAX_LENGTH = 32;
export const DESCRIPTION_MAX_LENGTH = 500;

/** Codes are used by integrations, so they stay URL/identifier friendly. */
export const CODE_PATTERN = /^[A-Za-z0-9._-]+$/;

const EMPTY_DRAFT: OrganizationCreateDraft = {
  name: '',
  code: '',
  tradingName: '',
  description: '',
  branding: 'inherit',
};

const STEPS: Array<{ id: 'identity' | 'branding' | 'demographics' | 'review'; label: OrganizationMessageKey }> = [
  { id: 'identity', label: 'reactory.organizations.wizard.step.identity' },
  { id: 'branding', label: 'reactory.organizations.wizard.step.branding' },
  { id: 'demographics', label: 'reactory.organizations.wizard.step.demographics' },
  { id: 'review', label: 'reactory.organizations.wizard.step.review' },
];

type ValidationField = 'name' | 'code' | 'description' | 'branding';

interface ValidationIssue {
  key: OrganizationMessageKey;
  values?: Record<string, any>;
}

type ValidationErrors = Partial<Record<ValidationField, ValidationIssue>>;

/**
 * Per-step validation.
 *
 * Exported because it is the wizard's actual contract: the UI only decides
 * *when* to call it. Keeping it pure also lets the rules be tested without
 * driving four MUI steps through the DOM.
 */
export const validateStep = (
  step: number,
  draft: OrganizationCreateDraft,
): ValidationErrors => {
  const errors: ValidationErrors = {};

  if (step === 0) {
    const name = (draft.name || '').trim();
    const code = (draft.code || '').trim();
    const description = (draft.description || '').trim();

    if (name.length === 0) {
      errors.name = { key: 'reactory.organizations.wizard.field.nameRequired' };
    } else if (name.length > NAME_MAX_LENGTH) {
      errors.name = {
        key: 'reactory.organizations.wizard.field.nameTooLong',
        values: { max: NAME_MAX_LENGTH },
      };
    }

    if (code.length > 0 && CODE_PATTERN.test(code) === false) {
      errors.code = { key: 'reactory.organizations.wizard.field.codeInvalid' };
    } else if (code.length > CODE_MAX_LENGTH) {
      errors.code = {
        key: 'reactory.organizations.wizard.field.codeTooLong',
        values: { max: CODE_MAX_LENGTH },
      };
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
      errors.description = {
        key: 'reactory.organizations.wizard.field.descriptionTooLong',
        values: { max: DESCRIPTION_MAX_LENGTH },
      };
    }
  }

  if (step === 1) {
    if (draft.branding !== 'inherit' && draft.branding !== 'blank') {
      errors.branding = { key: 'reactory.organizations.wizard.branding.required' };
    }
  }

  // Step 2 (demographics) has no required input — the definitions API is not
  // part of this ticket. Step 3 is the review.
  return errors;
};

export interface OrganizationCreateWizardProps {
  reactory?: any;
  open: boolean;
  onClose: () => void;
  /**
   * Called after a successful create. The host closes/refreshes/navigates; the
   * `warning` is set when the follow-up update failed but the organization was
   * created.
   */
  onCreated?: (organization: Organization, warning?: OrganizationError | null) => void | Promise<void>;
  /**
   * Set when the wizard is mounted for an existing organization. During
   * creation it is undefined, which short-circuits the demographics probe.
   */
  organizationId?: string | null;
}

/**
 * Four-step organization creation wizard.
 *
 * Step contract:
 *   1. Identity — required name; optional code/trading name/description.
 *   2. Branding — records inherit-vs-blank only. ORG-013 owns theme editing.
 *   3. Demographics — placeholder; degrades to "configure later" because
 *      `OrganizationDemographicDefinitions` ships with ORG-030/ORG-031.
 *   4. Review — summary, then `createOrganization` + the branding follow-up.
 *
 * Not registered as a component: it is a controlled dialog (`open`/`onClose`),
 * so as a route target it would render closed (a blank page). Mount it from
 * `OrganizationListPanel` or route to `OrganizationCreatePage` instead.
 */
export const OrganizationCreateWizard: React.FC<OrganizationCreateWizardProps> = ({
  reactory: propReactory,
  open,
  onClose,
  onCreated,
  organizationId,
}) => {
  const hookReactory = useReactory();
  const reactory = propReactory || hookReactory;
  const t = makeTranslator(reactory);

  const admin = useOrganizationAdmin(reactory);
  const demographics = useDemographicDefinitions(reactory, organizationId || null);

  const [activeStep, setActiveStep] = useState(0);
  const [draft, setDraft] = useState<OrganizationCreateDraft>(EMPTY_DRAFT);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submitting, setSubmitting] = useState(false);
  // A key, not a sentence: the Alert resolves it like every other string.
  const [submitError, setSubmitError] = useState<OrganizationMessageKey | null>(null);

  const clearError = admin.clearError;

  // A closed wizard is a fresh wizard: no half-filled draft survives.
  useEffect(() => {
    if (open) return;
    setActiveStep(0);
    setDraft(EMPTY_DRAFT);
    setErrors({});
    setSubmitError(null);
    clearError();
  }, [open, clearError]);

  const updateField = (field: keyof OrganizationCreateDraft, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => {
      if (!previous[field as ValidationField]) return previous;
      const next = { ...previous };
      delete next[field as ValidationField];
      return next;
    });
  };

  const handleNext = () => {
    const stepErrors = validateStep(activeStep, draft);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    setActiveStep((previous) => Math.min(previous + 1, STEPS.length - 1));
  };

  const handleBack = () => {
    setErrors({});
    setActiveStep((previous) => Math.max(previous - 1, 0));
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
  };

  const handleSubmit = async () => {
    const stepErrors = validateStep(0, draft);
    if (Object.keys(stepErrors).length > 0) {
      setErrors(stepErrors);
      setActiveStep(0);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    clearError();

    try {
      const result = await admin.create({
        name: draft.name,
        code: draft.code,
        tradingName: draft.tradingName,
        description: draft.description,
        branding: draft.branding,
      });

      if (!result) {
        setSubmitError('reactory.organizations.wizard.review.error');
        return;
      }

      // Await the host (refresh + navigation) before leaving the submitting
      // state, so the wizard cannot be re-submitted while the list reloads.
      if (typeof onCreated === 'function') {
        await onCreated(result.organization, result.warning || null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const brandingLabel = (choice: OrganizationBrandingChoice): string =>
    choice === 'blank'
      ? t('reactory.organizations.wizard.branding.blank')
      : t('reactory.organizations.wizard.branding.inherit');

  const demographicsContent = useMemo(() => {
    if (demographics.status === 'loading') {
      return (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={18} />
          <Typography variant="body2">
            {t('reactory.organizations.wizard.demographics.loading')}
          </Typography>
        </Stack>
      );
    }

    // The definitions API is not in this build (or there is no organization to
    // scope it to yet). Either way the step degrades to "configure later".
    const body =
      demographics.status === 'unavailable' && demographics.reason === 'error'
        ? t('reactory.organizations.wizard.demographics.loadFailedBody')
        : demographics.status === 'unavailable' && demographics.reason === 'not-implemented'
          ? t('reactory.organizations.wizard.demographics.unavailableBody')
          : t('reactory.organizations.wizard.demographics.placeholderBody');

    return (
      <Stack spacing={1.5} data-testid="organization-demographics-placeholder">
        <Typography variant="subtitle2">
          {t('reactory.organizations.wizard.demographics.placeholderTitle')}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {body}
        </Typography>
      </Stack>
    );
  }, [demographics, t]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      aria-labelledby="organization-create-wizard-title"
    >
      <DialogTitle id="organization-create-wizard-title">
        {t('reactory.organizations.wizard.title')}
      </DialogTitle>

      <DialogContent dividers>
        <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 3 }}>
          {STEPS.map((step) => (
            <Step key={step.id}>
              <StepLabel>{t(step.label)}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {(admin.error || submitError) && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {admin.error ? resolveError(t, admin.error) : t(submitError as OrganizationMessageKey)}
          </Alert>
        )}

        {activeStep === 0 && (
          <Stack spacing={2}>
            <Typography variant="body2" color="text.secondary">
              {t('reactory.organizations.wizard.identityHint')}
            </Typography>

            <TextField
              required
              autoFocus
              fullWidth
              label={t('reactory.organizations.wizard.field.name')}
              value={draft.name}
              onChange={(event) => updateField('name', event.target.value)}
              error={Boolean(errors.name)}
              helperText={errors.name ? t(errors.name.key, errors.name.values) : undefined}
            />

            <TextField
              fullWidth
              label={t('reactory.organizations.wizard.field.code')}
              value={draft.code}
              onChange={(event) => updateField('code', event.target.value)}
              error={Boolean(errors.code)}
              helperText={errors.code ? t(errors.code.key, errors.code.values) : undefined}
            />

            <TextField
              fullWidth
              label={t('reactory.organizations.wizard.field.tradingName')}
              value={draft.tradingName}
              onChange={(event) => updateField('tradingName', event.target.value)}
            />

            <TextField
              fullWidth
              multiline
              minRows={3}
              label={t('reactory.organizations.wizard.field.description')}
              value={draft.description}
              onChange={(event) => updateField('description', event.target.value)}
              error={Boolean(errors.description)}
              helperText={
                errors.description ? t(errors.description.key, errors.description.values) : undefined
              }
            />
          </Stack>
        )}

        {activeStep === 1 && (
          <Stack spacing={1.5}>
            <Typography variant="body2" color="text.secondary">
              {t('reactory.organizations.wizard.branding.hint')}
            </Typography>

            <FormControl error={Boolean(errors.branding)}>
              <RadioGroup
                value={draft.branding}
                onChange={(event) => updateField('branding', event.target.value)}
                aria-label={t('reactory.organizations.wizard.branding.title')}
              >
                <FormControlLabel
                  value="inherit"
                  control={<Radio />}
                  label={t('reactory.organizations.wizard.branding.inherit')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4, mb: 1 }}>
                  {t('reactory.organizations.wizard.branding.inheritHint')}
                </Typography>

                <FormControlLabel
                  value="blank"
                  control={<Radio />}
                  label={t('reactory.organizations.wizard.branding.blank')}
                />
                <Typography variant="caption" color="text.secondary" sx={{ ml: 4 }}>
                  {t('reactory.organizations.wizard.branding.blankHint')}
                </Typography>
              </RadioGroup>
              {errors.branding && (
                <FormHelperText>{t(errors.branding.key, errors.branding.values)}</FormHelperText>
              )}
            </FormControl>
          </Stack>
        )}

        {activeStep === 2 && demographicsContent}

        {activeStep === 3 && (
          <Stack spacing={2}>
            <Box>
              <Typography variant="subtitle1" component="h2">
                {t('reactory.organizations.wizard.review.title')}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {t('reactory.organizations.wizard.review.hint')}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.wizard.field.name')}
              </Typography>
              <Typography variant="body1">{draft.name.trim()}</Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.wizard.field.code')}
              </Typography>
              <Typography variant="body1">
                {draft.code.trim() || t('reactory.organizations.wizard.review.notSet')}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.wizard.field.tradingName')}
              </Typography>
              <Typography variant="body1">
                {draft.tradingName.trim() || t('reactory.organizations.wizard.review.notSet')}
              </Typography>
            </Box>

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.wizard.field.description')}
              </Typography>
              <Typography variant="body1">
                {draft.description.trim() || t('reactory.organizations.wizard.review.notSet')}
              </Typography>
            </Box>

            <Divider />

            <Box>
              <Typography variant="caption" color="text.secondary">
                {t('reactory.organizations.wizard.review.branding')}
              </Typography>
              <Typography variant="body1">{brandingLabel(draft.branding)}</Typography>
            </Box>
          </Stack>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={handleClose} disabled={submitting}>
          {t('reactory.organizations.wizard.cancel')}
        </Button>
        <Box sx={{ flex: 1 }} />
        {activeStep > 0 && (
          <Button onClick={handleBack} disabled={submitting}>
            {t('reactory.organizations.wizard.back')}
          </Button>
        )}
        {activeStep < STEPS.length - 1 ? (
          <Button variant="contained" onClick={handleNext}>
            {t('reactory.organizations.wizard.next')}
          </Button>
        ) : (
          <Button variant="contained" onClick={handleSubmit} disabled={submitting}>
            {submitting
              ? t('reactory.organizations.wizard.creating')
              : t('reactory.organizations.wizard.create')}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default OrganizationCreateWizard;
