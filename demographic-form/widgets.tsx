/**
 * Built-in controls — the fallback half of the widget registry.
 *
 * Every control implements the frozen widget contract (plan decision D8):
 *
 *   { value, onChange, error, disabled, definition, organization, user, reactory, mode }
 *
 * The renderer injects a `t` translator for these registry controls only; a
 * definition-bound custom component receives exactly the contract above. The
 * wrapper boxes carry `data-demographic-widget` so a host (and the test suite)
 * can assert which control a value type resolved to without depending on MUI
 * internals.
 *
 * `object` **and** `array` both render through the shared `ReactoryForm`
 * (ticket ORG-032: "object/array → ReactoryForm with `definition.schema`"). That
 * is deliberate rather than convenient: the form engine's `ArrayField` already
 * models array-of-object correctly, whereas a bespoke list of text inputs coerced
 * every row to a string and destroyed stored objects on the first keystroke.
 */
import React from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  FormHelperText,
  IconButton,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import { Add as AddIcon, Delete as DeleteIcon } from '@mui/icons-material';

import { DateWidget } from '@reactory/client-core/components/reactory/ux/mui/widgets/DateSelector';

import { buildReadOnlyUiSchema, normaliseArraySchema } from './formSchema';
import { makeTranslator } from './i18n';
import type {
  DemographicBuiltInWidgetProps,
  DemographicDataSource,
  DemographicDefinition,
  DemographicValueType,
  DemographicWidgetRegistry,
} from './types';
import {
  coerceNumericInput,
  demographicControlId,
  formatDemographicDate,
  normaliseOptions,
  optionLabelFor,
} from './utils';

/** Resolve the translator for a built-in control (injected or SDK-bound). */
const translatorFor = (props: DemographicBuiltInWidgetProps) =>
  props.t || makeTranslator(props.reactory);

/**
 * Key used for the control's DOM id and test hook.
 *
 * A multi-valued definition renders the same control once per row, so the row
 * index is suffixed to keep ids and test ids unique. Only the built-in controls
 * receive `instanceKey`; a bound custom widget keeps the exact D8 contract.
 */
const composeControlKey = (key: string, instanceKey?: number | string): string =>
  instanceKey === undefined || instanceKey === null ? key : `${key}-${instanceKey}`;

const controlKeyOf = (props: DemographicBuiltInWidgetProps): string =>
  composeControlKey(props.definition.key, props.instanceKey);

/** DOM id for this control, used by the field's `<label for>`. */
const controlIdOf = (props: DemographicBuiltInWidgetProps): string =>
  demographicControlId(controlKeyOf(props));

/**
 * Accessible name for this control.
 *
 * Rows of a `multiValued` definition get a distinct name ("Previous employers
 * item 2") instead of repeating the definition title, so assistive technology
 * can tell two rows apart.
 */
const controlLabelOf = (props: DemographicBuiltInWidgetProps): string =>
  props.instanceLabel || props.definition.title;

/** Shared wrapper so every fallback exposes the same test/host hooks. */
const ControlWrapper: React.FC<{
  definition: DemographicDefinition;
  widget: string;
  instanceKey?: number | string;
  readOnly?: boolean;
  children: React.ReactNode;
}> = ({ definition, widget, instanceKey, readOnly, children }) => (
  <Box
    data-demographic-widget={widget}
    data-demographic-key={definition.key}
    data-read-only={readOnly ? 'true' : undefined}
    data-testid={`demographic-control-${composeControlKey(definition.key, instanceKey)}`}
    sx={{ width: '100%' }}
  >
    {children}
  </Box>
);

/**
 * Resolve `core.ReactoryForm` through the component registry.
 *
 * Same call shape as `ApplicationSettingsPanel`, and tolerant of a broken
 * loader: a throwing `getComponent` yields `null` so the caller can render its
 * translated "form engine unavailable" note instead of crashing the form.
 */
export const resolveReactoryForm = (reactory: any): React.ComponentType<any> | null => {
  if (!reactory || typeof reactory.getComponent !== 'function') return null;

  try {
    return (
      reactory.getComponent('core.ReactoryForm@1.0.0') ||
      reactory.getComponent('core.ReactoryForm') ||
      null
    );
  } catch {
    return null;
  }
};

/** Shared "the form engine is not available" panel for object/array. */
const FormUnavailable: React.FC<{ props: DemographicBuiltInWidgetProps }> = ({ props }) => {
  const t = translatorFor(props);
  return (
    <ControlWrapper
      definition={props.definition}
      instanceKey={props.instanceKey}
      widget="ReactoryFormUnavailable"
    >
      <Alert
        severity="info"
        data-testid={`demographic-form-unavailable-${props.definition.key}`}
      >
        {t('reactory.demographics.widget.formUnavailable', {
          valueType: props.definition.valueType,
        })}
      </Alert>
    </ControlWrapper>
  );
};

/** `valueType: 'string'` → TextField. */
export const DemographicTextWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition } = props;
  const text = value === null || value === undefined ? '' : String(value);

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="TextField">
      <TextField
        id={controlIdOf(props)}
        fullWidth
        size="small"
        type="text"
        value={text}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        disabled={disabled}
        error={Boolean(error)}
        required={Boolean(definition.required)}
        inputProps={{ 'aria-label': controlLabelOf(props) }}
      />
    </ControlWrapper>
  );
};

/** `valueType: 'number'` → numeric TextField. */
export const DemographicNumberWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition } = props;
  const text = typeof value === 'number' ? `${value}` : typeof value === 'string' ? value : '';

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="NumberField">
      <TextField
        id={controlIdOf(props)}
        fullWidth
        size="small"
        type="number"
        value={text}
        onChange={(event) => onChange(coerceNumericInput(event.target.value))}
        disabled={disabled}
        error={Boolean(error)}
        required={Boolean(definition.required)}
        inputProps={{ 'aria-label': controlLabelOf(props) }}
      />
    </ControlWrapper>
  );
};

/** `valueType: 'boolean'` → Switch. */
export const DemographicBooleanWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, disabled, definition } = props;
  const t = translatorFor(props);

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="Switch">
      <Stack direction="row" spacing={1} alignItems="center">
        <Switch
          id={controlIdOf(props)}
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          disabled={disabled}
          inputProps={{ 'aria-label': controlLabelOf(props) }}
        />
        <Typography variant="body2" color="text.secondary">
          {Boolean(value)
            ? t('reactory.demographics.boolean.yes')
            : t('reactory.demographics.boolean.no')}
        </Typography>
      </Stack>
    </ControlWrapper>
  );
};

/**
 * `valueType: 'date'` → the shared `DateSelectorWidget`.
 *
 * `DateWidget` has no `disabled`/`readOnly` contract (it only maps its own
 * uiSchema options onto the picker), so read mode renders the stored value as a
 * disabled field instead of an interactive picker.
 */
export const DemographicDateWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition } = props;
  const t = translatorFor(props);

  if (disabled) {
    return (
      <ControlWrapper
        definition={definition}
        instanceKey={props.instanceKey}
        widget="ReadOnlyValue"
        readOnly
      >
        <TextField
          id={controlIdOf(props)}
          fullWidth
          size="small"
          value={formatDemographicDate(value) || t('reactory.demographics.field.notSet')}
          disabled
          inputProps={{ 'aria-label': controlLabelOf(props) }}
        />
      </ControlWrapper>
    );
  }

  const dateFormat =
    definition.schema && typeof definition.schema.dateFormat === 'string'
      ? definition.schema.dateFormat
      : 'YYYY-MM-DD';

  return (
    <ControlWrapper
      definition={definition}
      instanceKey={props.instanceKey}
      widget="DateSelectorWidget"
    >
      <DateWidget
        formData={value ?? undefined}
        onChange={(next: any) => onChange(next === undefined || next === null ? null : next)}
        schema={{ title: definition.title, format: definition.schema?.format }}
        uiSchema={{
          'ui:options': {
            label: definition.title,
            dateFormat,
          },
        }}
        error={Boolean(error)}
        required={Boolean(definition.required)}
      />
    </ControlWrapper>
  );
};

/** `valueType: 'enum'` → Select over `definition.options`. */
export const DemographicEnumWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition } = props;
  const t = translatorFor(props);
  const options = normaliseOptions(definition, value);
  const selected = value === null || value === undefined ? '' : String(value);

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="Select">
      <Select
        id={controlIdOf(props)}
        fullWidth
        size="small"
        // `displayEmpty` is required for `renderValue` to run while the value is
        // blank; without it MUI renders nothing and the placeholder is lost.
        displayEmpty
        value={selected}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        disabled={disabled}
        error={Boolean(error)}
        required={Boolean(definition.required)}
        inputProps={{ 'aria-label': controlLabelOf(props) }}
        renderValue={(current) =>
          current === '' ? (
            <em>{t('reactory.demographics.select.placeholder', { title: definition.title })}</em>
          ) : (
            optionLabelFor(definition, current)
          )
        }
      >
        <MenuItem value="">
          <em>{t('reactory.demographics.select.placeholder', { title: definition.title })}</em>
        </MenuItem>
        {options.map((option) => (
          <MenuItem key={option.key} value={option.key}>
            {option.label}
          </MenuItem>
        ))}
      </Select>
      {options.length === 0 && (
        <FormHelperText>{t('reactory.demographics.select.noOptions')}</FormHelperText>
      )}
    </ControlWrapper>
  );
};

/** `valueType: 'multi-enum'` → multiple Autocomplete. */
export const DemographicMultiEnumWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition } = props;
  const t = translatorFor(props);
  const options = normaliseOptions(definition, value);
  const selected = Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="Autocomplete">
      <Autocomplete
        multiple
        id={controlIdOf(props)}
        size="small"
        disableCloseOnSelect
        disabled={disabled}
        options={options.map((option) => option.key)}
        value={selected}
        onChange={(_event, next) => onChange(Array.isArray(next) ? next : [])}
        getOptionLabel={(option) => optionLabelFor(definition, option)}
        isOptionEqualToValue={(option, current) => option === current}
        renderInput={(params) => (
          <TextField
            {...params}
            placeholder={t('reactory.demographics.multiEnum.placeholder')}
            error={Boolean(error)}
            required={Boolean(definition.required)}
            // `params.id` is the Autocomplete's own id, so the field label's
            // `for` resolves to a real input.
            inputProps={{ ...params.inputProps, 'aria-label': controlLabelOf(props) }}
          />
        )}
      />
      {options.length === 0 && (
        <FormHelperText>{t('reactory.demographics.multiEnum.noOptions')}</FormHelperText>
      )}
    </ControlWrapper>
  );
};

/** Shared `ReactoryForm` body for the object/array value types. */
const SchemaFormField: React.FC<{
  props: DemographicBuiltInWidgetProps;
  schema: Record<string, any>;
  formData: unknown;
  emptyData: unknown;
  /** Only emit when the engine returned the declared shape. */
  isAcceptable: (next: unknown) => boolean;
}> = ({ props, schema, formData, emptyData, isAcceptable }) => {
  const { onChange, disabled, definition, reactory } = props;
  const ReactoryForm = resolveReactoryForm(reactory);

  if (!ReactoryForm) return <FormUnavailable props={props} />;

  const formDef = {
    nameSpace: 'demographics',
    name: `demographic-${definition.key}`,
    version: '1.0.0',
    title: definition.title,
    description: definition.description || undefined,
    schema,
    // `mode` alone does not disable the engine's inputs; the rjsf flags do.
    uiSchema: disabled ? buildReadOnlyUiSchema(schema) : {},
  };

  return (
    <ControlWrapper
      definition={definition}
      instanceKey={props.instanceKey}
      widget="ReactoryForm"
      readOnly={disabled}
    >
      <ReactoryForm
        formDef={formDef}
        formData={formData === null || formData === undefined ? emptyData : formData}
        mode={disabled ? 'view' : 'edit'}
        // Belt and braces for engine builds that read these props directly.
        readOnly={Boolean(disabled)}
        disabled={Boolean(disabled)}
        onChange={(event: any) => {
          const next = event?.formData ?? event?.data ?? event;
          if (isAcceptable(next)) onChange(next);
        }}
      />
    </ControlWrapper>
  );
};

/**
 * `valueType: 'object'` → `ReactoryForm` driven by `definition.schema`.
 *
 * Resolved through the component registry (like `ApplicationSettingsPanel`)
 * rather than imported directly, so a host that overrides `core.ReactoryForm`
 * keeps control of object editing.
 */
export const DemographicObjectWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, definition } = props;
  const schema =
    definition.schema && typeof definition.schema === 'object'
      ? definition.schema
      : { type: 'object', properties: {} };

  return (
    <SchemaFormField
      props={props}
      schema={schema}
      formData={value}
      emptyData={{}}
      isAcceptable={(next) => Boolean(next) && typeof next === 'object' && !Array.isArray(next)}
    />
  );
};

/**
 * `valueType: 'array'` → `ReactoryForm` driven by `definition.schema`.
 *
 * The engine owns the repeatable rows, so array-of-object values survive an
 * edit intact (a bespoke list of text inputs coerced each row to a string and
 * corrupted the stored object). The emitted value is only accepted when it is
 * still an array, so a malformed engine callback cannot replace an array with a
 * scalar either.
 */
export const DemographicArrayWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, definition } = props;

  return (
    <SchemaFormField
      props={props}
      schema={normaliseArraySchema(definition.schema)}
      formData={value}
      emptyData={[]}
      isAcceptable={(next) => Array.isArray(next)}
    />
  );
};

/** Find the caller-supplied source for a reference model. */
export const findDataSource = (
  dataSources: DemographicDataSource[] | undefined,
  model: string | null | undefined,
): DemographicDataSource | null => {
  if (!Array.isArray(dataSources) || typeof model !== 'string' || model.length === 0) return null;
  return dataSources.find((source) => source && source.model === model) || null;
};

/**
 * `valueType: 'reference'` → select populated by a caller-supplied data source.
 *
 * This is the `SelectWithDataWidget` pattern (plan §3.4) without the GraphQL
 * coupling: `reference.model` selects a source, and the caller owns fetching.
 * The renderer never builds a query.
 *
 * With no source there is nothing to choose from, so *both* shapes render
 * disabled — an empty but interactive control would let a user clear a stored
 * value they cannot re-select.
 */
export const DemographicReferenceWidget: React.FC<DemographicBuiltInWidgetProps> = (props) => {
  const { value, onChange, error, disabled, definition, dataSources } = props;
  const t = translatorFor(props);
  const model = definition.reference?.model || '';
  const multiple = Boolean(definition.reference?.multiple);
  const source = findDataSource(dataSources, model);
  const items = source?.items || [];
  const isDisabled = Boolean(disabled) || !source;

  const helper = source?.error ? (
    <FormHelperText error>{source.error}</FormHelperText>
  ) : source?.loading ? (
    <FormHelperText>{t('reactory.demographics.reference.loading')}</FormHelperText>
  ) : !source ? (
    <FormHelperText error data-testid={`demographic-reference-missing-${definition.key}`}>
      {t('reactory.demographics.reference.noSource', { model })}
    </FormHelperText>
  ) : items.length === 0 ? (
    <FormHelperText>{t('reactory.demographics.reference.empty')}</FormHelperText>
  ) : null;

  if (multiple) {
    const selected = Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === 'string')
      : [];
    const disabledItems = items.filter((item) => item.disabled).map((item) => item.value);

    return (
      <ControlWrapper
        definition={definition}
        instanceKey={props.instanceKey}
        widget="ReferenceSelect"
        readOnly={isDisabled}
      >
        <Autocomplete
          multiple
          id={controlIdOf(props)}
          size="small"
          disableCloseOnSelect
          disabled={isDisabled}
          options={items.map((item) => item.value)}
          value={selected}
          onChange={(_event, next) => onChange(Array.isArray(next) ? next : [])}
          getOptionLabel={(option) => items.find((item) => item.value === option)?.label || option}
          isOptionEqualToValue={(option, current) => option === current}
          getOptionDisabled={(option) => disabledItems.indexOf(option) >= 0}
          renderInput={(params) => (
            <TextField
              {...params}
              placeholder={t('reactory.demographics.reference.placeholder', {
                title: definition.title,
              })}
              error={Boolean(error)}
              inputProps={{ ...params.inputProps, 'aria-label': controlLabelOf(props) }}
            />
          )}
        />
        {helper}
      </ControlWrapper>
    );
  }

  const selected = value === null || value === undefined ? '' : String(value);

  return (
    <ControlWrapper
      definition={definition}
      instanceKey={props.instanceKey}
      widget="ReferenceSelect"
      readOnly={isDisabled}
    >
      <Select
        id={controlIdOf(props)}
        fullWidth
        size="small"
        displayEmpty
        value={selected}
        onChange={(event) => onChange(event.target.value === '' ? null : event.target.value)}
        disabled={isDisabled}
        error={Boolean(error)}
        required={Boolean(definition.required)}
        inputProps={{ 'aria-label': controlLabelOf(props) }}
        renderValue={(current) =>
          current === '' ? (
            <em>
              {t('reactory.demographics.reference.placeholder', { title: definition.title })}
            </em>
          ) : (
            items.find((item) => item.value === current)?.label || String(current)
          )
        }
      >
        <MenuItem value="">
          <em>{t('reactory.demographics.reference.placeholder', { title: definition.title })}</em>
        </MenuItem>
        {items.map((item) => (
          <MenuItem key={item.value} value={item.value} disabled={item.disabled}>
            {item.label}
          </MenuItem>
        ))}
      </Select>
      {helper}
    </ControlWrapper>
  );
};

/**
 * Repeatable wrapper for `definition.multiValued` definitions.
 *
 * The server stores an array of the declared `valueType` for a multi-valued
 * definition, so each row is rendered with the *same* resolved control (widget
 * binding included) and the rows are re-assembled into one array. Each row is
 * given its own remove button and accessible name, and the renderer injects the
 * per-row `instanceKey`/`instanceLabel` so ids and labels stay distinct.
 */
export const DemographicMultiValueField: React.FC<
  DemographicBuiltInWidgetProps & {
    renderItem: (args: {
      value: unknown;
      onChange: (value: unknown) => void;
      index: number;
    }) => React.ReactNode;
  }
> = (props) => {
  const { value, onChange, disabled, definition, renderItem } = props;
  const t = translatorFor(props);
  const items = Array.isArray(value) ? value : [];

  return (
    <ControlWrapper definition={definition} instanceKey={props.instanceKey} widget="MultiValueField">
      <Stack spacing={1}>
        {items.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {t('reactory.demographics.array.empty')}
          </Typography>
        )}
        {items.map((item, index) => (
          <Stack
            key={`${definition.key}-multi-${index}`}
            direction="row"
            spacing={1}
            alignItems="center"
            data-testid={`demographic-multi-item-${definition.key}-${index}`}
          >
            <Box sx={{ flex: 1 }}>
              {renderItem({
                value: item,
                index,
                onChange: (next) => {
                  const copy = items.slice();
                  copy[index] = next;
                  onChange(copy);
                },
              })}
            </Box>
            <IconButton
              size="small"
              disabled={disabled}
              aria-label={t('reactory.demographics.array.remove', { index: index + 1 })}
              data-testid={`demographic-multi-remove-${definition.key}-${index}`}
              onClick={() => onChange(items.filter((_unused, position) => position !== index))}
            >
              <DeleteIcon fontSize="small" />
            </IconButton>
          </Stack>
        ))}
        <Box>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={disabled}
            data-testid={`demographic-multi-add-${definition.key}`}
            onClick={() => onChange(items.concat([null]))}
          >
            {t('reactory.demographics.array.add', { title: definition.title })}
          </Button>
        </Box>
      </Stack>
    </ControlWrapper>
  );
};

/**
 * The default `valueType` → control registry.
 *
 * Exported so ORG-031 can show the same mapping it renders, and so a host can
 * extend it: `{ ...DEFAULT_WIDGET_REGISTRY, date: MyDateControl }`.
 */
export const DEFAULT_WIDGET_REGISTRY: Record<DemographicValueType, React.ComponentType<any>> = {
  string: DemographicTextWidget,
  number: DemographicNumberWidget,
  boolean: DemographicBooleanWidget,
  date: DemographicDateWidget,
  enum: DemographicEnumWidget,
  'multi-enum': DemographicMultiEnumWidget,
  object: DemographicObjectWidget,
  array: DemographicArrayWidget,
  reference: DemographicReferenceWidget,
};

/** Convenience for hosts that only want to override a subset. */
export const createWidgetRegistry = (
  overrides?: DemographicWidgetRegistry | null,
): Record<DemographicValueType, React.ComponentType<any>> => ({
  ...DEFAULT_WIDGET_REGISTRY,
  ...(overrides || {}),
});
