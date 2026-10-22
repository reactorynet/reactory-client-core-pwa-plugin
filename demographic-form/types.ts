/**
 * Contracts for the shared demographic form renderer (ORG-032).
 *
 * This module is deliberately transport agnostic, mirroring `theme-editor/`:
 * it never talks to GraphQL and never owns persistence. Callers (ORG-031
 * definition preview, ORG-033 admin values pane, ORG-034 self-service
 * demographics) supply the definitions and the current values, and receive the
 * next values through `onChange`.
 *
 * The shapes below mirror the `DemographicDefinition` GraphQL type in
 * `reactory-express-server/src/modules/reactory-core/graph/types/Demographics`,
 * but they are hand-written and permissive: this plugin has no codegen step and
 * is compiled inside the pwa-client workspace.
 */
import type { ComponentType, ReactNode } from 'react';
import type { DemographicMessageKey } from './i18n';

/** The nine value types the server accepts (`DemographicDefinition.valueType`). */
export const DEMOGRAPHIC_VALUE_TYPES = [
  'string',
  'number',
  'boolean',
  'date',
  'enum',
  'multi-enum',
  'object',
  'array',
  'reference',
] as const;

export type DemographicValueType = (typeof DEMOGRAPHIC_VALUE_TYPES)[number];

/**
 * Interaction mode handed to a widget and honoured by every built-in control.
 *
 * `read` is the frozen name from plan decision D8 — do not rename it to `view`
 * here: ORG-031/ORG-033/ORG-034 all bind to this contract.
 */
export type DemographicRenderMode = 'edit' | 'read';

/** One choice of an `enum` / `multi-enum` definition. */
export interface DemographicOption {
  key: string;
  label?: string | null;
  ordinal?: number | null;
  deprecated?: boolean | null;
}

/** Structural reference target (business unit, team, region, …). */
export interface DemographicReference {
  model: string;
  multiple?: boolean | null;
}

/**
 * Optional custom input binding.
 *
 * `componentPropsMap` follows the existing Reactory `ui:props-map` /
 * `propertyMap` convention: the **key is a dotted source path in the render
 * context** and the **value is the destination prop name**, e.g.
 * `{ 'definition.options': 'options', 'organization.id': 'organizationId' }`.
 */
export interface DemographicWidgetBinding {
  componentFqn?: string | null;
  componentProps?: Record<string, unknown> | null;
  componentPropsMap?: Record<string, string> | null;
}

/**
 * An organization-scoped demographic definition.
 *
 * `valueType` is typed as `DemographicValueType | string` because the wire type
 * is `String!`: a newer server may introduce a type this build does not know
 * yet, and that must degrade to a text input rather than crash the form.
 */
export interface DemographicDefinition {
  id?: string | null;
  organization?: string | null;
  key: string;
  title: string;
  description?: string | null;
  icon?: string | null;
  category?: string | null;
  valueType: DemographicValueType | string;
  /** JSON Schema fragment used for `object` / `array` (and extra validation). */
  schema?: any;
  options?: DemographicOption[] | null;
  reference?: DemographicReference | null;
  widget?: DemographicWidgetBinding | null;
  required?: boolean | null;
  /** When true the stored value is an array of the declared `valueType`. */
  multiValued?: boolean | null;
  /** PII marker: gates reporting/export and audit logging. */
  sensitive?: boolean | null;
  searchable?: boolean | null;
  enabled?: boolean | null;
  ordinal?: number | null;
  roles?: string[] | null;
  system?: boolean | null;
  /** Soft delete marker, mirrored from the model so a stale payload is skipped. */
  deleted?: boolean | null;
}

/** Values keyed by `definition.key` — the shape the caller owns. */
export type DemographicValues = Record<string, unknown>;

/** A per-field error: one message, several messages, or nothing. */
export type DemographicFieldError = string | string[] | null | undefined;

/** Field errors keyed by `definition.key`, as returned by the server on save. */
export type DemographicErrors = Record<string, DemographicFieldError>;

/** What changed, alongside the next values, on every edit. */
export interface DemographicValueChange {
  key: string;
  value: unknown;
  definition: DemographicDefinition;
}

/**
 * Called with the complete next values record plus the single change.
 *
 * Both are supplied because the two consumers need different things: a
 * side-drawer editor persists one key, while a form owns the whole record.
 */
export type DemographicChangeHandler = (
  values: DemographicValues,
  change: DemographicValueChange,
) => void;

/** Translator bound to the demographic message catalogue. */
export type DemographicTranslator = (
  key: DemographicMessageKey,
  values?: Record<string, string | number>,
) => string;

/** One option of a caller-supplied reference data source. */
export interface DemographicReferenceOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/**
 * A caller-supplied data source for `reference` definitions.
 *
 * The renderer never builds a query: `reference.model` is matched against
 * `model` here, and the caller owns fetching (this is the `SelectWithDataWidget`
 * pattern without the GraphQL coupling).
 */
export interface DemographicDataSource {
  /** Matches `definition.reference.model`, e.g. `BusinessUnit`. */
  model: string;
  items: DemographicReferenceOption[];
  loading?: boolean;
  /** Untranslatable server text; shown verbatim when present. */
  error?: string | null;
}

/**
 * The prop contract handed to a widget (plan decision D8).
 *
 * This is frozen: ORG-031's live preview and ORG-033's inline editor bind to it.
 * A definition's `componentProps` / `componentPropsMap` are merged in *before*
 * these, so the contract can never be shadowed by a binding.
 */
export interface DemographicWidgetContract {
  value: unknown;
  onChange: (value: unknown) => void;
  /** First field-level message, or null. The renderer prints the full list. */
  error: string | null;
  disabled: boolean;
  definition: DemographicDefinition;
  organization?: any;
  /** Present when an administrator edits on behalf of a member. */
  user?: any;
  reactory?: any;
  mode: DemographicRenderMode;
}

/**
 * Internal props of the built-in controls.
 *
 * `t` is injected by the renderer for the registry widgets only — it is not part
 * of the public custom-widget contract, which stays exactly as documented.
 */
export interface DemographicBuiltInWidgetProps extends DemographicWidgetContract {
  t?: DemographicTranslator;
  dataSources?: DemographicDataSource[];
  /**
   * Row index for a `multiValued` definition, so a control rendered once per row
   * keeps a unique DOM id and test hook. Injected by the renderer; never part of
   * the public custom-widget contract.
   */
  instanceKey?: number | string;
  /**
   * Accessible name for a `multiValued` row ("Previous employers item 2").
   * Injected alongside `instanceKey` so every row of the same definition has a
   * distinct name instead of repeating the definition title; never part of the
   * public custom-widget contract.
   */
  instanceLabel?: string;
}

export type DemographicWidgetComponent = ComponentType<any>;

/** `valueType` → built-in control. Callers may override individual entries. */
export type DemographicWidgetRegistry = Partial<
  Record<DemographicValueType, DemographicWidgetComponent>
>;

/** Everything a `componentPropsMap` path can resolve against. */
export interface DemographicRenderContext {
  definition: DemographicDefinition;
  organization?: any;
  user?: any;
  reactory?: any;
  mode: DemographicRenderMode;
  value?: unknown;
}

export interface DemographicFieldRendererProps {
  definition: DemographicDefinition;
  /** Current value for this definition (controlled). */
  value?: unknown;
  onChange?: (value: unknown) => void;
  /** Field error(s) for this definition. */
  error?: DemographicFieldError;
  /** Disables the input. `readOnly` and `mode: 'read'` also disable it. */
  disabled?: boolean;
  readOnly?: boolean;
  /** `edit` (default) or `read`. */
  mode?: DemographicRenderMode;
  organization?: any;
  user?: any;
  reactory?: any;
  dataSources?: DemographicDataSource[];
  widgetRegistry?: DemographicWidgetRegistry;
  /** Optional translator override; defaults to `reactory.i18n` + catalogue. */
  t?: DemographicTranslator;
}

export interface DemographicFormProps {
  /**
   * Definitions to render. Disabled ones (`enabled === false`) are omitted and
   * the remainder are ordered by `ordinal`.
   */
  definitions: DemographicDefinition[];
  values?: DemographicValues | null;
  onChange?: DemographicChangeHandler;
  /** Server field errors keyed by definition key. Display-only. */
  errors?: DemographicErrors | null;
  disabled?: boolean;
  readOnly?: boolean;
  mode?: DemographicRenderMode;
  organization?: any;
  user?: any;
  reactory?: any;
  /** Reference options, one entry per `reference.model`. */
  dataSources?: DemographicDataSource[];
  /** Overrides for individual `valueType` fallbacks. */
  widgetRegistry?: DemographicWidgetRegistry;
  t?: DemographicTranslator;
  /** Rendered instead of the translated note when nothing is renderable. */
  emptyState?: ReactNode;
  /** Render nothing when no enabled definition exists. */
  hideEmptyState?: boolean;
  className?: string;
  id?: string;
}
