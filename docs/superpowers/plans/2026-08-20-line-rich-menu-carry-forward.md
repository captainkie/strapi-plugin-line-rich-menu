# Carry-forward from Plan 01

Things Plan 01 deliberately left undone, with the reasoning. Recorded here because
the working notes that held them are scratch and get deleted; this is the durable copy.

Nothing below is a defect in what shipped. Each is either a decision that belongs to a
later plan, or a known limit that was cheaper to name than to close early.

---

## For Plan 02 — `packages/ui`

**The form-state ⇄ payload mapper is a deliverable, not glue.** See spec §5.4. The editor
holds an action as a flat object with every field present so switching type does not
discard what the user typed; the API wants a discriminated union. The mapper between them
needs a round-trip test.

**`richMenuPayloadSchema` has no `z.ZodType<RichMenuPayload>` annotation.** `validateRichMenu`
casts its return, so the exported function's contract is sound. Only direct use of the raw
schema constant relies on structural inference — which is what a `zodResolver` would do.
Decide there, with the resolver in front of you; annotating it blindly erases everything a
resolver wants beyond `parse`.

**The SVG safety test greps `/<script|\son\w+\s*=/i`, and `renderTemplateSvg` coerces its
six numerics.** That makes injection impossible *today*, because only numbers reach the
markup. The moment a user-supplied area label reaches the thumbnail, escaping becomes
load-bearing and the coercion no longer covers it.

**`chatBarMode` exists in the data model** (spec §5.5) because the chat bar is two settings,
not one. Storing only the resulting text loses which mode the user picked.

---

## For Plan 03 — the Strapi 4 adapter

**Compensation leaves a dangling alias.** If `upsertAlias` succeeds and `setDefault` fails,
`compensate` deletes the created menu but the alias still points at the deleted id, breaking
any `richmenuswitch` targeting it. The property test proves *no orphan menus*; it does not
prove *no orphan state*, and its name should not be read as though it did.

Fixing this properly needs to know whether the alias existed before the publish — which is
adapter context, not something the pure machine can know. It is a spec question for §8, not
a patch to `machine.ts`.

**`normalize` must run at upload time, not inside the publish request.** Measured during
Plan 01: an incompressible image walks the whole size ladder through mozjpeg and takes over
five seconds. Composing several areas and then normalising inside one request will meet a
proxy timeout. Spec §4.3 carries the detail.

**Close the size loop explicitly.** `normalize` returns the rung it actually landed on;
`payload.size` must come from that return value, and `sizeNameFor()` maps back to the name
the database holds. `plan()` orders validate → create → upload, so committing `payload.size`
before normalising is the trap. `tools/line-mock/tests/integration.test.ts` demonstrates the
correct order.

**`compose` reports issue path `parts.N.bounds` while `schema` reports `areas.N.bounds`** for
the same invariant. A UI mapping paths to form fields has to know both.

---

## For Plan 04 — release

**CodeQL is gated on `repository.visibility == 'public'`** and skips today. GitHub Advanced
Security is organisation-only, so it cannot run on a personal-account private repo at any
price. It starts working by itself the day the repo goes public.

**`.github/rulesets/main.json` is committed but not applied.** Branch protection and rulesets
are refused on a private repo owned by a personal account on the Free plan. One command
applies it once the repo is public; `.github/rulesets/README.md` has the reasoning for each
rule, including why zero required approvals is correct for a sole maintainer and why
`mutation` must never be a required check.

**Mutation testing runs nightly and after merge to `main`, never on a PR.** It is far too
slow to gate a pull request. That means a PR gutting assertions merges green and breaks the
nightly run afterwards.

---

## Known limits in what shipped

**The integration test only ever lands on the top size rung.** Both cases feed a
solid-colour image that fits at 2500px, so the ladder never descends — and the descent is
the actual failure it was written to catch. A case forcing `maxBytes` low would make it a
true regression test.

**Validation codes reuse zod's internal codes** (`too_small`, `unrecognized_keys`) alongside
the project's own. Stable within zod ^3, would shift on a zod 4 upgrade.

**Three Thai error messages remain in core**, outside the validation path: `crypto.ts` twice
and `client.ts` once. Spec §11.7 has the UI translate by code, so `Error.message` is
developer-facing — but §12 makes `en` the default and these are inconsistent with the rest.

**`Number(null)`, `Number('')` and `Number([])` are all `0`**, so `maxAttempts` clamps to 1
and retries are silently off. Off the declared type contract, but reachable from a
JavaScript adapter passing an empty environment variable rather than an unset one.

**A fractional `maxAttempts` sleeps once past its final attempt.** 1.5 falls out of the retry
loop having already slept. This is also the path that makes the trailing `throw lastError`
reachable and covered, so truncating the value would need another way to cover that line.

---

## From Plan 02's whole-branch review — accepted as Minor, not fixed

Each was judged real but not merge-blocking. Recorded here because the working notes that held
them are scratch, and a Minor nobody wrote down is a Minor nobody fixes.

**The identical-string i18n guard only catches byte-identical values.** `th.json` has
`"editor.actions": "Action"` against `en.json`'s `"Actions"` — untranslated English that slips
past the allowlist by one character. Worth also flagging Thai values containing no Thai
characters at all (`/[฀-๿]/`), with the same allowlist as the escape hatch.

**`ImageField` owns its error while every sibling takes one as a prop.** So `applyTemplate`
cannot clear it: upload a wrong-ratio image, switch large → compact, and the banner still
reads "must match the template's proportions (2500×1686)" while the template is now 2500×843.
Actively wrong information, not merely stale.

**`TemplatePicker` still wraps two testids in `<span>` inside `ui.Button`** (the confirm and
cancel-confirm buttons), sitting next to a correct `testId` on the apply button. Nothing false
today because no test asserts `toBeDisabled()` on them — but it is the forbidden pattern
beside the mandated one, which is how the pattern spreads.

**The conditional-spread ceremony buys nothing.** `{...(x === undefined ? {} : { x })}` appears
in five files while `ActionForm` passes `error={error}` directly. `exactOptionalPropertyTypes`
is off in `tsconfig.base.json`, so the spreads carry the cost of the strict style without its
guarantee. Either enable the flag — which would make them meaningful — or delete them.

**`eslint-plugin-react-hooks` is not installed.** It is the linter that would have caught the
split between `RichMenuList`'s `[channelId, http, t]` dependency array and `ChannelSettings`'s
`useEffect(reload, [])` closing over `http`/`t`. Two idioms for one concern, in adjacent files.

**`port.test.tsx` asserts `toBeGreaterThanOrEqual(15)`** under the title "stub port has
everything UIPort declares". The stub has 16; deleting one still passes. Typecheck is the real
guard so nothing is false, but the test does not prove its own title — assert the sorted key
list.

**`chatBar.defaultLabel` flows into a field capped at 14 characters with no guard.** Strapi apps
routinely override plugin translations; a 20-character override produces a `too_big` error
pointed at a field the user cannot edit, because it is disabled in default mode. Add a length
assertion for both languages to `i18n.test.ts`.

**`CanvasEditor` interpolates `url(${imageUrl})` unescaped.** Server-controlled today, so this
is defence in depth rather than a live hole — but a `")` in the value breaks out of the token.

**`packages/ui` pulls `sharp` into every consumer's install graph** via core's dependency. The
`/browser` subpath keeps it out of the bundle, which two guards protect, but not out of the
install. Worth an `optionalDependencies` or peer arrangement at release time.

**Drag and resize are built, tested, and unreachable.** `Preview` never forwards
`onBoundsChange`/`snap`, and it is the only place a page renders a `CanvasEditor`, so `editable`
is always false and `canvas-editor-drag.test.tsx` covers a capability no user can reach. With no
add/remove-area control either, "1–20 areas" tops out at whatever a template provides, and spec
§5.2's claim that custom layout costs almost nothing extra is true but undelivered. **Decide in
Plan 04 whether v1.0 ships custom layout or documents its absence.**

## Release-task items

`packages/ui/package.json` and `packages/core/package.json` have no `description`,
`repository`, `author`, or `publishConfig.access: "public"`. The last one makes `npm publish`
fail outright for a scoped package.

`pnpm -r build` was never in the verified set for Plan 02. It is the only command that exercises
`resolveJsonModule` through tsup's `dts: true`. Run it before tagging.

---

## From Plan 03 — per-file coverage is not currently enforceable

`perFile: true` works only in the **top-level** `thresholds` object. Inside a glob-keyed
threshold Vitest accepts the key and silently ignores it — verified by placing a file at 40%
lines / 50% branches under `packages/core/src/server/` and watching the gate stay green.

So a weak file can still hide behind strong ones inside a glob. It already happened once:
`server/channels.ts` sat at 87% branch while its glob showed 95%, and the untested branches
were the "only one default channel" business rule.

Turning it on at the top level requires `packages/ui` to pass per-file first. As of Plan 03's
start these files fall short, most by one or two points:

| File | Short on |
|---|---|
| `api.ts` | functions 20% |
| `components/ActionForm.tsx` | lines 88%, statements 88%, functions 33% |
| `components/CanvasEditor.tsx` | branches 89.58% |
| `components/ChatBarSettings.tsx` | branches 88.88% |
| `components/ImageField.tsx` | branches 89.65% |
| `components/MainSettings.tsx` | functions 66.66% |
| `components/Preview.tsx` | functions 50% |
| `pages/RichMenuEditor.tsx` | branches 87.67% |
| `styles.ts` | branches 75% |

The function metric is structurally low for React components, since every inline handler prop
counts as a function — a realistic `functions` floor for `packages/ui` is nearer 70 than 90,
which the current glob threshold already reflects. The branch gaps are genuine and worth
closing.

---

## From Plan 03's whole-branch review — accepted tradeoffs, for Plan 04 to check

**The stale-publish guard depends on `updatedAt` being touched on every write.** I4's fix refuses
a second publish while one is running, and recovers from a crashed publish by treating the
`publishing` row as stale after a TTL. That TTL is read from `updatedAt`, which Strapi 4 bumps on
every write. **This was not verified for Strapi 5's document service.** If v5 does not bump it the
same way, a crashed publish wedges that menu permanently — check before porting.

**The in-memory fake `Repo` does not simulate `updatedAt` being bumped.** This already cost one
genuinely confusing debugging session: the guard silently failed to fire and the test looked like
an infinite loop. Plan 04's v5 tests will hit the same thing unless the fake bumps it.

**`PUBLISHING_STALE_AFTER_MS` is five minutes by reasoning, not by measurement.** Nobody has timed
a real publish against a slow LINE response with a large image. Worth measuring once there is real
usage rather than guessing again.

**The stale-publish guard is check-then-set, not compare-and-swap.** `Repo<T>` has no conditional
update primitive, and adding one would mean every adapter implementing it. The race window shrank
from the whole publish duration to a single `await`, which is a large improvement and not a
guarantee. Accepted deliberately; revisit if concurrent publishes ever become common.

**Mutation testing was not re-run after the two fix rounds.** The nightly job covers it, but the
score has not been checked against the ~120 tests added since.

---

## For Plan 04's README task — state the Strapi 4 security position plainly

Strapi 4.25.x reached end of life on **30 April 2026**. Its own dependency tree carries **70+
known vulnerabilities, including criticals**, and will never be patched because nobody maintains
it. That is a property of running Strapi 4, not of this plugin: `@strapi/strapi` is a
**peerDependency**, so the customer brings their own, and they have those advisories with or
without us. What the plugin itself adds at runtime is `sharp` and `zod`, both current.

CI reflects this honestly rather than hiding it: `scripts/audit-shipped.mjs` blocks on advisories
reachable **without** going through `@strapi/strapi`, and a separate non-blocking job keeps
scanning the whole tree so the upstream state stays visible.

The README must say this in the v4 section, in plain language — a customer choosing between the
v4 and v5 packages deserves to know that one of them targets EOL software. **Do not bury it in a
footnote and do not omit it.** It is also the strongest honest argument for migrating to Strapi 5,
which serves the customer better than silence does.
