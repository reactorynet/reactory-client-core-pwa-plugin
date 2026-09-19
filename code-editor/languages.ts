import hljs from 'highlight.js/lib/core';
import sqlLanguage from 'highlight.js/lib/languages/sql';
import graphqlLanguage from 'highlight.js/lib/languages/graphql';
import jsonLanguage from 'highlight.js/lib/languages/json';
import yamlLanguage from 'highlight.js/lib/languages/yaml';

/**
 * highlight.js grammars used by the editors in this plugin.
 *
 * Centralised so registration happens once, in one module, rather than being
 * scattered across each editor that happens to need a language. The host also
 * registers yaml/json/javascript/typescript against the same core instance for
 * the form-engine RichEditor; `registerLanguage` is idempotent for a repeated
 * grammar, so overlapping with the host is harmless.
 */

export type CodeLanguage = 'sql' | 'graphql' | 'json' | 'yaml';

hljs.registerLanguage('sql', sqlLanguage);
hljs.registerLanguage('graphql', graphqlLanguage);
hljs.registerLanguage('json', jsonLanguage);
hljs.registerLanguage('yaml', yamlLanguage);

export { hljs };
