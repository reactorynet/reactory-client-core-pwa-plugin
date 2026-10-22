/**
 * DemographicFieldRenderer — one definition in, one control out.
 *
 * The renderer owns everything that is identical for every value type and every
 * binding:
 *
 *  - the label, required marker, description and sensitive (PII) marker;
 *  - widget resolution (bound `componentFqn`, else the `valueType` fallback);
 *  - the translated warning when a bound FQN cannot be resolved;
 *  - per-field validation messages (display-only — the server is authoritative);
 *  - read-only / disabled propagation;
 *  - the repeatable wrapper for `multiValued` definitions.
 *
 * It is fully controlled: `value` in, `onChange` out. In particular a `sensitive`
 * definition is never pre-filled from a cache — the only value it can show is
 * the one the caller passed in.
 */
import React from 'react';
import { Alert, Box, Chip, Typography } from '@mui/material';

import { makeTranslator } from './i18n';
import { resolveDemographicWidget } from './resolve';
import { demographicControlId, normaliseFieldErrors, normaliseValueType } from './utils';
import { DemographicMultiValueField } from './widgets';
import type {
  DemographicBuiltInWidgetProps,
  DemographicFieldRendererProps,
  DemographicRenderMode,
} from './types';

/**
 * Render one demographic definition.
 *
 * `mode` defaults to `edit`; `readOnly` is an override that forces read. The
 * effective `disabled` is the union of the caller's `disabled`, `readOnly` and
 * read mode, which is what keeps read-only surfaces (ORG-034's policy gate,
 * ORG-033's viewer role) from needing to know each control's internals.
 */
export const DemographicFieldRenderer: React.FC<DemographicFieldRendererProps> = (props) => {
  const {
    definition,
    value,
    onChange,
    error,
    disabled,
    readOnly,
    mode: modeProp,
    organization,
    user,
    reactory,
    dataSources,
    widgetRegistry,
    t: tProp,
  } = props;

  const mode: DemographicRenderMode = modeProp === 'read' || readOnly ? 'read' : 'edit';
  const isDisabled = Boolean(disabled) || mode === 'read';
  const t = tProp || makeTranslator(reactory);
  const messages = normaliseFieldErrors(error);
  const required = Boolean(definition?.required);
  const valueType = normaliseValueType(definition?.valueType);
  const controlId = demographicControlId(definition?.key || '');

  const resolved = resolveDemographicWidget({
    definition,
    value,
    onChange: (next: unknown) => onChange?.(next),
    error: messages.length > 0 ? messages[0] : null,
    disabled: isDisabled,
    mode,
    organization,
    user,
    reactory,
    dataSources,
    widgetRegistry,
    t,
  });

  const { Component, props: componentProps, missingFqn, unsupportedValueType, multiValued } =
    resolved;

  /**
   * Only point the visible title at a control when exactly one element carries
   * that id. A `multiValued` field renders one control per row, and the
   * form-engine (object/array) and date controls manage their own labelling, so
   * a `for` there would be dangling — every input is instead named with an
   * `aria-label` (per row for `multiValued`).
   */
  const labelFor =
    !multiValued && valueType !== 'object' && valueType !== 'array' && valueType !== 'date'
      ? controlId
      : undefined;

  // For multiValued definitions each row renders the *same* resolved control
  // (bound widget included) with a scalar value, and the rows are re-assembled.
  // For multiValued definitions each row renders the *same* resolved control
  // (bound widget included) with a scalar value, and the rows are re-assembled.
  const control = multiValued ? (
    <DemographicMultiValueField
      {...(componentProps as DemographicBuiltInWidgetProps)}
      renderItem={({ value: itemValue, onChange: onItemChange, index }) => {
        // Registry controls take the row's key/label so each row gets a unique
        // DOM id and accessible name. A bound custom widget keeps the exact D8
        // contract, so it receives neither.
        const rowProps =
          resolved.source === 'registry'
            ? {
                instanceKey: index,
                instanceLabel: t('reactory.demographics.array.itemLabel', {
                  title: definition.title,
                  index: index + 1,
                }),
              }
            : {};

        return (
          <Component
            {...componentProps}
            {...rowProps}
            value={itemValue}
            onChange={onItemChange}
          />
        );
      }}
    />
  ) : (
    <Component {...componentProps} />
  );

  return (
    <Box
      data-testid={`demographic-field-${definition.key}`}
      data-demographic-key={definition.key}
      data-value-type={definition.valueType}
      data-mode={mode}
      role={multiValued ? 'group' : undefined}
      aria-label={multiValued ? definition.title : undefined}
      sx={{ display: 'flex', flexDirection: 'column', gap: 0.5, width: '100%' }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
        {/* The title is the <label> only when one control owns `labelFor`; the
            markers sit outside it so the Chip keeps a valid phrasing context.
            A `multiValued` field names its group here and each row separately. */}
        {labelFor ? (
          <Box component="label" htmlFor={labelFor} sx={{ cursor: 'pointer' }}>
            <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600 }}>
              {definition.title}
            </Typography>
          </Box>
        ) : (
          <Typography variant="subtitle2" component="span" sx={{ fontWeight: 600 }}>
            {definition.title}
          </Typography>
        )}
        {required && (
          <Box
            component="span"
            data-testid={`demographic-required-${definition.key}`}
            aria-label={t('reactory.demographics.field.required')}
            sx={{ color: 'error.main', lineHeight: 1 }}
          >
            *
          </Box>
        )}
        {definition.sensitive && (
          <Chip
            size="small"
            variant="outlined"
            color="warning"
            data-testid={`demographic-sensitive-${definition.key}`}
            label={t('reactory.demographics.field.sensitive')}
          />
        )}
      </Box>

      {definition.description && (
        <Typography variant="caption" color="text.secondary">
          {definition.description}
        </Typography>
      )}

      {missingFqn && (
        <Alert
          severity="warning"
          data-testid={`demographic-widget-warning-${definition.key}`}
          sx={{ mt: 0.5 }}
        >
          {t('reactory.demographics.widget.missing', { fqn: missingFqn, valueType })}
        </Alert>
      )}

      {unsupportedValueType && (
        <Alert
          severity="info"
          data-testid={`demographic-widget-unsupported-${definition.key}`}
          sx={{ mt: 0.5 }}
        >
          {t('reactory.demographics.widget.unsupportedType', {
            valueType: String(definition.valueType),
          })}
        </Alert>
      )}

      {control}

      {messages.length > 0 && (
        <Box data-testid={`demographic-errors-${definition.key}`} role="alert">
          {messages.map((message, index) => (
            <Typography
              key={`${definition.key}-error-${index}`}
              variant="caption"
              color="error"
              component="p"
              sx={{ m: 0 }}
            >
              {message}
            </Typography>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default DemographicFieldRenderer;
