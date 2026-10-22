/**
 * DemographicForm — the whole form for a set of definitions.
 *
 * Ordering and filtering live here so every host behaves identically:
 *   - only `enabled` (and not soft-deleted) definitions render;
 *   - they render in `ordinal` order.
 *
 * The form is controlled and transport agnostic: it never fetches definitions or
 * values, never saves, and never validates. `errors` is display-only — the server
 * remains the authority and returns field-level errors on save.
 *
 * Reused by ORG-031 (definition preview), ORG-033 (admin values pane) and
 * ORG-034 (self-service My Demographics), which is why nothing here is specific
 * to organizations beyond the optional `organization` / `user` render context.
 */
import React, { useMemo } from 'react';
import { Box, Typography } from '@mui/material';

import DemographicFieldRenderer from './DemographicFieldRenderer';
import { makeTranslator } from './i18n';
import { selectRenderableDefinitions, setDemographicValue } from './utils';
import type { DemographicFormProps } from './types';

export const DemographicForm: React.FC<DemographicFormProps> = (props) => {
  const {
    definitions,
    values,
    onChange,
    errors,
    disabled,
    readOnly,
    mode: modeProp,
    organization,
    user,
    reactory,
    dataSources,
    widgetRegistry,
    t: tProp,
    emptyState,
    hideEmptyState,
    className,
    id,
  } = props;

  const t = tProp || makeTranslator(reactory);
  const mode = modeProp === 'read' || readOnly ? 'read' : 'edit';
  const renderable = useMemo(() => selectRenderableDefinitions(definitions), [definitions]);
  const currentValues = values || {};

  if (renderable.length === 0) {
    if (hideEmptyState) return null;
    return (
      <Box data-testid="demographic-form-empty" className={className}>
        {emptyState || (
          <Typography variant="body2" color="text.secondary">
            {t('reactory.demographics.form.empty')}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <Box
      id={id}
      data-testid="demographic-form"
      className={className}
      sx={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}
    >
      {renderable.map((definition) => (
        <DemographicFieldRenderer
          key={definition.key}
          definition={definition}
          value={currentValues[definition.key]}
          error={errors ? errors[definition.key] : undefined}
          disabled={disabled}
          mode={mode}
          organization={organization}
          user={user}
          reactory={reactory}
          dataSources={dataSources}
          widgetRegistry={widgetRegistry}
          t={t}
          onChange={(value) =>
            onChange?.(setDemographicValue(currentValues, definition.key, value), {
              key: definition.key,
              value,
              definition,
            })
          }
        />
      ))}
    </Box>
  );
};

export default DemographicForm;
