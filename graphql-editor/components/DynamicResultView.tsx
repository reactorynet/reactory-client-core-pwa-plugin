import React from 'react';
import { Alert, Box, Typography } from '@mui/material';
import { ReactoryForm } from '@reactory/client-core/components/reactory/ReactoryForm';
import { buildFormDefinition } from '../schema/formBuilder';
import type { GraphQLSchemaView } from '../types';

/**
 * Boundary around the generated form.
 *
 * The definition is built at runtime from an introspected schema, so it can
 * contain a shape the form engine did not expect. If rendering throws, the tab
 * explains itself and the grid and raw views are unaffected — a blank page
 * would be a far worse failure for a read-only view.
 */
class FormRenderBoundary extends React.Component<
  { children: React.ReactNode; onError: (message: string) => React.ReactNode },
  { error: string | null }
> {
  state: { error: string | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error: error?.message || 'Unknown rendering error' };
  }

  render() {
    if (this.state.error) return this.props.onError(this.state.error);
    return this.props.children;
  }
}

export interface DynamicResultViewProps {
  /** The parsed schema, or null when introspection is unavailable. */
  schema: any | null;
  /** The introspection error, when there was one. */
  schemaError?: string | null;
  /** The executed document, used to find the root field's type. */
  document: string;
  /** The result payload. */
  data: Record<string, any> | null;
  /** Raw schema view, for the diagnostic footer. */
  schemaView?: GraphQLSchemaView | null;
}

/**
 * Component view: a Reactory form generated from the result's schema type.
 *
 * This is the view that needs introspection. The document tells us which fields
 * were selected; the schema tells us what they *are* — enums become selects,
 * numbers become numeric fields, nested objects become nested sections, and the
 * schema's own descriptions become help text. Inferring from the data alone
 * could not do any of that.
 */
export const DynamicResultView: React.FC<DynamicResultViewProps> = ({
  schema,
  schemaError,
  document,
  data,
  schemaView,
}) => {
  const { formDefinition, reason, typeName } = React.useMemo(
    () => buildFormDefinition({ schema, data, document }),
    [schema, data, document],
  );

  if (!formDefinition) {
    return (
      <Box sx={{ p: 2 }}>
        <Alert severity="info" role="status">
          <Typography variant="subtitle2" gutterBottom>
            The component view is unavailable.
          </Typography>
          <Typography variant="body2">{reason}</Typography>
          {schemaError ? (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Schema introspection reported: {schemaError}
            </Typography>
          ) : null}
        </Alert>
      </Box>
    );
  }

  const value = data ? data[rootFieldOf(document)] : null;

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Generated from {typeName}
        {schemaView?.typeCount ? ` \u00b7 schema of ${schemaView.typeCount} types` : ''}
        {schemaView?.compiledAt ? ` \u00b7 compiled ${schemaView.compiledAt}` : ''}
      </Typography>

      <FormRenderBoundary
        onError={(message) => (
          <Alert severity="warning" role="status">
            <Typography variant="subtitle2" gutterBottom>
              The generated form could not be rendered.
            </Typography>
            <Typography variant="body2">{message}</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              The grid and raw views still show this result.
            </Typography>
          </Alert>
        )}
      >
        <ReactoryForm
          formDef={formDefinition}
          formData={(Array.isArray(value) ? { items: value } : value) as any}
        />
      </FormRenderBoundary>
    </Box>
  );
};

/** Root field name, kept local to avoid another import for one lookup. */
const rootFieldOf = (document: string): string => {
  const match = /(?:query|mutation)\s*(?:\w+)?\s*\{\s*([A-Za-z_]\w*)/.exec(document || '');
  return match ? match[1] : '';
};

export default DynamicResultView;
