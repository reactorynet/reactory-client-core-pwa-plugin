/**
 * Widget resolution — the renderer's decision table.
 *
 * Order per definition (ticket ORG-032 / plan §3.4):
 *   1. `definition.widget.componentFqn` resolved through the Reactory component
 *      registry, with `componentProps` and `componentPropsMap` applied.
 *   2. Otherwise the built-in control for `definition.valueType`.
 *
 * A `componentFqn` that cannot be resolved must never take the form down: the
 * result carries `missingFqn`, the field renders the built-in fallback, and the
 * user sees a translated warning naming the FQN. That is an acceptance
 * criterion, not a nicety — a definition whose custom widget was removed from
 * the registry would otherwise render an empty screen.
 */
import type {
  DemographicDataSource,
  DemographicDefinition,
  DemographicRenderContext,
  DemographicRenderMode,
  DemographicTranslator,
  DemographicValueType,
  DemographicWidgetComponent,
  DemographicWidgetRegistry,
} from './types';
import { resolvePropsMap } from './propsMap';
import { createWidgetRegistry } from './widgets';
import { isDemographicValueType, normaliseValueType } from './utils';

export interface ResolveDemographicWidgetOptions {
  definition: DemographicDefinition;
  value?: unknown;
  onChange: (value: unknown) => void;
  /** First field-level message, or null. */
  error?: string | null;
  disabled: boolean;
  mode: DemographicRenderMode;
  organization?: any;
  user?: any;
  reactory?: any;
  dataSources?: DemographicDataSource[];
  widgetRegistry?: DemographicWidgetRegistry;
  /** Injected into registry controls only; never into a bound custom widget. */
  t?: DemographicTranslator;
}

export interface ResolvedDemographicWidget {
  Component: DemographicWidgetComponent;
  /** Props to spread onto `Component`. */
  props: Record<string, any>;
  /** `definition` when a bound widget resolved, `registry` for a built-in. */
  source: 'definition' | 'registry';
  /** FQN that could not be resolved, when a fallback happened. */
  missingFqn: string | null;
  /** True when `definition.valueType` is not one of the nine documented types. */
  unsupportedValueType: boolean;
  valueType: DemographicValueType;
  /**
   * True when the server stores an array of `valueType` values, i.e. the field
   * needs the repeatable wrapper. `multi-enum` and `array` are already arrays.
   */
  multiValued: boolean;
}

/**
 * Resolve an FQN through `reactory.getComponent`.
 *
 * The registry returns `null`/`undefined` for an unknown key, but a broken
 * loader may also throw — both are treated as "not resolvable" so the caller
 * falls back instead of surfacing a React error boundary.
 */
export const resolveWidgetComponent = (
  reactory: any,
  componentFqn: string,
): DemographicWidgetComponent | null => {
  if (!reactory || typeof reactory.getComponent !== 'function') return null;

  try {
    const resolved = reactory.getComponent(componentFqn);
    if (!resolved) return null;

    const kind = typeof resolved;
    if (kind === 'function') return resolved as DemographicWidgetComponent;
    // `React.memo` / `forwardRef` return objects; a registry entry is allowed to
    // be either, so accept object-ish components and let React decide.
    if (kind === 'object') return resolved as unknown as DemographicWidgetComponent;
    return null;
  } catch {
    return null;
  }
};

/** The object a `componentPropsMap` resolves dotted paths against. */
export const buildRenderContext = (
  options: Pick<
    ResolveDemographicWidgetOptions,
    'definition' | 'organization' | 'user' | 'reactory' | 'mode' | 'value'
  >,
): DemographicRenderContext => ({
  definition: options.definition,
  organization: options.organization,
  user: options.user,
  reactory: options.reactory,
  mode: options.mode,
  value: options.value,
});

/** Resolve the widget and its props for one definition. */
export const resolveDemographicWidget = (
  options: ResolveDemographicWidgetOptions,
): ResolvedDemographicWidget => {
  const {
    definition,
    value,
    onChange,
    error = null,
    disabled,
    mode,
    organization,
    user,
    reactory,
    dataSources,
    widgetRegistry,
    t,
  } = options;

  const valueType = normaliseValueType(definition?.valueType);
  const unsupportedValueType = !isDemographicValueType(definition?.valueType);
  const registry = createWidgetRegistry(widgetRegistry);
  const Fallback = registry[valueType] || registry.string;

  // The frozen D8 contract. Applied last so a binding cannot shadow it.
  const contract = {
    value,
    onChange,
    error,
    disabled,
    definition,
    organization,
    user,
    reactory,
    mode,
  };

  const registryProps = { ...contract, t, dataSources };

  const multiValued =
    Boolean(definition?.multiValued) && valueType !== 'multi-enum' && valueType !== 'array';

  const binding = definition?.widget || null;
  const componentFqn =
    binding && typeof binding.componentFqn === 'string' ? binding.componentFqn.trim() : '';

  if (componentFqn.length > 0) {
    const Bound = resolveWidgetComponent(reactory, componentFqn);

    if (Bound) {
      const mapped = resolvePropsMap(buildRenderContext(options), binding.componentPropsMap);
      const declared =
        binding && binding.componentProps && typeof binding.componentProps === 'object'
          ? binding.componentProps
          : {};

      return {
        Component: Bound,
        // Precedence: componentProps < componentPropsMap < contract.
        props: { ...declared, ...mapped, ...contract },
        source: 'definition',
        missingFqn: null,
        unsupportedValueType,
        valueType,
        multiValued,
      };
    }

    return {
      Component: Fallback,
      props: registryProps,
      source: 'registry',
      missingFqn: componentFqn,
      unsupportedValueType,
      valueType,
      multiValued,
    };
  }

  return {
    Component: Fallback,
    props: registryProps,
    source: 'registry',
    missingFqn: null,
    unsupportedValueType,
    valueType,
    multiValued,
  };
};
