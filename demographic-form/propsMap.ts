/**
 * `propsMap` resolution.
 *
 * Reactory already has one convention for "map values out of the host context
 * into a component's props": `ui:props-map`, `propertyMap`, `RouteSlot.propsMap`
 * and `TabbedNavigation.componentPropsMap` all use the `object-mapper` shape
 *
 *   { '<source.dotted.path>': '<destinationProp>' }
 *
 * e.g. `{ 'definition.options': 'options', 'organization.id': 'organizationId' }`.
 *
 * `DemographicDefinition.widget.componentPropsMap` is stored by the server as
 * `Any`, so this module resolves the shape directly instead of calling
 * `reactory.utils.objectMapper`:
 *
 *  - it keeps the renderer transport agnostic and unit-testable without an SDK;
 *  - a missing path is *omitted* rather than delivered as `undefined`, so the
 *    widget's own default still applies (object-mapper would set the key).
 *
 * Security
 * --------
 * The map is user-authored data that reaches a recursive object write. A path
 * containing `__proto__`, `prototype` or `constructor` would let a crafted
 * definition mutate `Object.prototype` (prototype pollution) — reachable through
 * ORG-031's definition builder, which is an admin surface but not a trusted one.
 * Both the source and destination paths are therefore rejected outright; the
 * entry is skipped rather than thrown, so one bad key cannot break a form.
 */

/** Segments that must never appear in a mapped path. */
const UNSAFE_SEGMENTS = ['__proto__', 'prototype', 'constructor'];

/** True when a dotted path is safe to read or write. */
export const isSafePropsMapPath = (path: unknown): path is string =>
  typeof path === 'string' &&
  path.length > 0 &&
  path
    .split('.')
    .every((segment) => segment.length > 0 && UNSAFE_SEGMENTS.indexOf(segment) < 0);

/** Read a dotted path, returning `undefined` when any segment is absent. */
export const getPath = (source: unknown, path: string): unknown => {
  if (!isSafePropsMapPath(path)) return undefined;
  return path.split('.').reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, source);
};

/** Write a dotted destination path, creating intermediate objects. */
const setPath = (target: Record<string, unknown>, path: string, value: unknown): void => {
  if (!isSafePropsMapPath(path)) return;

  const segments = path.split('.');
  let cursor: Record<string, unknown> = target;

  segments.forEach((segment, index) => {
    if (index === segments.length - 1) {
      cursor[segment] = value;
      return;
    }
    const next = cursor[segment];
    if (next === null || typeof next !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  });
};

/**
 * Resolve a Reactory props map against a context object.
 *
 * Only non-empty safe string destinations are honoured; anything else in the
 * stored JSON is ignored rather than thrown, because the map is user-authored
 * data.
 */
export const resolvePropsMap = (
  context: unknown,
  propsMap: Record<string, unknown> | null | undefined,
): Record<string, unknown> => {
  if (!propsMap || typeof propsMap !== 'object' || Array.isArray(propsMap)) return {};

  return Object.keys(propsMap).reduce<Record<string, unknown>>((resolved, sourcePath) => {
    const destination = propsMap[sourcePath];
    if (typeof destination !== 'string' || destination.trim().length === 0) return resolved;

    const target = destination.trim();
    // Reject a poisoned path on either side before touching the context.
    if (!isSafePropsMapPath(sourcePath) || !isSafePropsMapPath(target)) return resolved;

    const value = getPath(context, sourcePath);
    if (value === undefined) return resolved;

    setPath(resolved, target, value);
    return resolved;
  }, {});
};
