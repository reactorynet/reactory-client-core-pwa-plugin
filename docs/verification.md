# Verifying this plugin

The plugin is mounted into the PWA client as a git submodule at
`src/components/plugins/reactory-core`. It has **no `tsconfig.json`**, **no
`package.json`** and **no `node_modules`** of its own: everything it compiles
against — TypeScript, React, `@reactorynet/reactory-core`, the
`@reactory/client-core/*` path aliases — comes from the consumer workspace at
`/Users/wernerw/Projects/reactory/reactory-pwa-client`. Verification therefore
always runs in the consumer's context, never standalone.

## Disposable-clone recipe

Do **not** check a branch out inside the consumer's submodule. Clone the plugin
into a scratch directory instead, borrow the consumer's `node_modules`, and
throw the clone away.

```bash
CONSUMER=/Users/wernerw/Projects/reactory/reactory-pwa-client
PLUGIN_REPO=/Users/wernerw/Projects/reactory/reactory-client-core-pwa-plugin
BRANCH=<branch-to-verify>

# The consumer tracks the plugin as a gitlink; read the path out of its index
# so nobody has to hard-code it.
SUBPATH=$(git -C "$CONSUMER" ls-files -s \
  | grep 160000 \
  | awk '$1=="160000" && $4 ~ /reactory-core/ {print $4}')

TMP=$(mktemp -d)
git clone --shared --no-checkout "$CONSUMER/$SUBPATH" "$TMP/plugin"
git -C "$TMP/plugin" fetch --no-tags "$PLUGIN_REPO" \
  "refs/heads/$BRANCH:refs/heads/$BRANCH"
git -C "$TMP/plugin" checkout "$BRANCH"

# No node_modules of its own: reuse the consumer's.
ln -s "$CONSUMER/node_modules" "$TMP/plugin/node_modules"

(cd "$TMP/plugin" && npx --no-install tsc --noEmit)

rm -rf "$TMP"
```

`--shared` makes the clone an alternate of the mount's object store, so nothing
is copied and the clone sees every object the consumer already has. That also
means the clone depends on that object store: do not delete or move the mount
while a clone is still alive.

### Why the extra `fetch`

The submodule mount is a detached checkout (`1394785`) that only carries a
subset of the plugin's branches. A clone of it inherits **those** refs, so a
bare `git checkout <branch>` fails with

```
error: pathspec '<branch>' did not match any file(s) known to git
```

for any branch the mount has not fetched. Fetching the branch from the plugin
repository fixes that and costs nothing, because the objects are already
shared. Checking the branch tip out by SHA works for the same reason.

## Current `tsc` limitation

`tsc --noEmit` in the clone has no project file to compile — the plugin has no
`tsconfig.json` — so the compiler prints its usage summary and exits `1`:

```
Version 5.5.3
tsc: The TypeScript Compiler - Version 5.5.3

COMMON COMMANDS
...
```

Until this repository grows a `tsconfig.json`, an isolated type-check needs a
throwaway project file inside the clone (never committed). The plugin sources
are otherwise type-checked as part of the consumer's program, because the
consumer's `tsconfig.json` includes `src/**/*` and the mount lives under
`src/components/plugins/reactory-core`.

## Tests

Do not expect to run the Jest suite in the disposable clone. The runner lives in
the consumer workspace (`jest` via `package.json`, plus `jest.ci.config.ts`), and
`__tests__/componentRegistration.test.ts` imports `../../__index`, which only
resolves when the plugin sits at `src/components/plugins/reactory-core` next to
the consumer's generated `plugins/__index.ts`. A clone in a temp directory has no
such sibling.

## Never do this

- Do not `git checkout` inside
  `reactory-pwa-client/src/components/plugins/reactory-core`. That detaches the
  developer's primary checkout of the plugin.
- Do not commit the consumer's recorded gitlink. Its index already disagrees with
  the submodule HEAD (`768772a` vs `1394785`) — pre-existing drift, unrelated to
  whichever branch you are verifying. Only the consumer repository should move
  that pointer, deliberately, in its own commit.
