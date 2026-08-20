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
