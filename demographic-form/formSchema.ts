/**
 * JSON-Schema helpers for the `ReactoryForm`-backed value types.
 *
 * `object` and `array` definitions are rendered by the shared form engine, which
 * is driven entirely by the definition's `schema`. Two things must be true for
 * that to work safely:
 *
 *  1. an `array` definition always produces an `array` schema — a definition
 *     saved without `schema.items` must still render (and must never be coerced
 *     into something else);
 *  2. read-only surfaces must produce a uiSchema that actually locks the fields.
 *
 * The second point is not cosmetic. `IReactoryFormProps.mode` selects which
 * mutation the form would use; it does **not** disable its inputs. The form's
 * fields honour the rjsf flags — `MaterialSchemaField` computes
 * `disabled = props.disabled || uiSchema['ui:disabled']` and
 * `readonly = props.readonly || uiSchema['ui:readonly']` — so a read-only
 * demographics surface has to ship those flags, at the root *and* on every
 * property. `graphql-editor/schema/formBuilder.ts` builds its result viewer the
 * same way (`readOnlyUiSchema`), which is the in-repo precedent followed here.
 */

/** Flags applied to every node of a read-only uiSchema. */
const READ_ONLY_FLAGS = { 'ui:readonly': true, 'ui:disabled': true } as const;

/**
 * Coerce a definition schema into a usable `array` schema.
 *
 * A `type` that is not `array` is replaced rather than trusted: the value type
 * *is* the authority on the stored shape (`value` is an array for every `array`
 * definition), and passing a non-array schema to the form engine would render a
 * scalar control that then writes a scalar back — the exact corruption class
 * this module must not have.
 */
export const normaliseArraySchema = (schema: any): Record<string, any> => {
  const source = schema && typeof schema === 'object' && !Array.isArray(schema) ? schema : {};
  const items =
    source.items && typeof source.items === 'object' && !Array.isArray(source.items)
      ? source.items
      : {};

  return { ...source, type: 'array', items };
};

/**
 * Build a uiSchema that renders a form (and every nested field) read-only.
 *
 * Walks `properties` and `items` so nested objects are covered too — the rjsf
 * `ObjectField` does propagate `readonly` to children, but relying on that alone
 * would silently break if a host swapped in a different field implementation,
 * and this costs nothing.
 */
export const buildReadOnlyUiSchema = (schema: any): Record<string, any> => {
  const uiSchema: Record<string, any> = { ...READ_ONLY_FLAGS };

  const walk = (node: any, target: Record<string, any>): void => {
    if (!node || typeof node !== 'object') return;

    if (node.type === 'object' && node.properties && typeof node.properties === 'object') {
      Object.keys(node.properties).forEach((key) => {
        const child = node.properties[key];
        target[key] = { ...READ_ONLY_FLAGS };

        if (child && typeof child === 'object') {
          if (child.description) target[key]['ui:help'] = child.description;
          // A bare enum renders as a combobox; the shared viewer makes it a
          // read-only select so the value is legible rather than truncated.
          if (Array.isArray(child.enum) && child.enum.length > 0) {
            target[key]['ui:widget'] = 'select';
          }
          walk(child, target[key]);
        }
      });
      return;
    }

    if (node.type === 'array' && node.items && typeof node.items === 'object') {
      walk(node.items, target);
    }
  };

  walk(schema, uiSchema);
  return uiSchema;
};
