/**
 * Public surface of the shared demographic form renderer (ORG-032).
 *
 * Consumers (ORG-031 definition preview, ORG-033 admin values pane, ORG-034
 * self-service demographics) import everything demographics-rendering related
 * from here, so the value-type → control mapping, the `componentPropsMap`
 * resolution and the widget contract cannot drift between hosts.
 *
 * Nothing here talks to GraphQL: the caller supplies definitions and values and
 * owns persistence.
 */
export { default as DemographicForm } from './DemographicForm';
export { default as DemographicFieldRenderer } from './DemographicFieldRenderer';

export {
  DEFAULT_WIDGET_REGISTRY,
  DemographicArrayWidget,
  DemographicBooleanWidget,
  DemographicDateWidget,
  DemographicEnumWidget,
  DemographicMultiEnumWidget,
  DemographicMultiValueField,
  DemographicNumberWidget,
  DemographicObjectWidget,
  DemographicReferenceWidget,
  DemographicTextWidget,
  createWidgetRegistry,
  findDataSource,
  resolveReactoryForm,
} from './widgets';

/**
 * JSON-Schema helpers for the `ReactoryForm`-backed value types (`object` and
 * `array`). Exported because ORG-031's definition builder shows the same
 * read-only preview this module renders.
 */
export { buildReadOnlyUiSchema, normaliseArraySchema } from './formSchema';

export {
  buildRenderContext,
  resolveDemographicWidget,
  resolveWidgetComponent,
} from './resolve';
export type {
  ResolveDemographicWidgetOptions,
  ResolvedDemographicWidget,
} from './resolve';

export { getPath, isSafePropsMapPath, resolvePropsMap } from './propsMap';

export {
  demographicControlId,
  formatDemographicDate,
  isDemographicValueType,
  normaliseFieldErrors,
  normaliseOptions,
  normaliseValueType,
  optionLabelFor,
  ordinalOf,
  selectRenderableDefinitions,
  setDemographicValue,
} from './utils';

/**
 * `translate` is deliberately not re-exported: `organization-management` already
 * exports a symbol of that name and two `export *` barrels would collide.
 * `makeTranslator` is the supported entry point.
 */
export { DEMOGRAPHIC_MESSAGES, makeTranslator } from './i18n';
export type { DemographicMessageKey } from './i18n';

export { DEMOGRAPHIC_VALUE_TYPES } from './types';
export type {
  DemographicBuiltInWidgetProps,
  DemographicChangeHandler,
  DemographicDataSource,
  DemographicDefinition,
  DemographicErrors,
  DemographicFieldError,
  DemographicFieldRendererProps,
  DemographicFormProps,
  DemographicOption,
  DemographicReference,
  DemographicReferenceOption,
  DemographicRenderContext,
  DemographicRenderMode,
  DemographicTranslator,
  DemographicValueChange,
  DemographicValues,
  DemographicValueType,
  DemographicWidgetBinding,
  DemographicWidgetComponent,
  DemographicWidgetContract,
  DemographicWidgetRegistry,
} from './types';
