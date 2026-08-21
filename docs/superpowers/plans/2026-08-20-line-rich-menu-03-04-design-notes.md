# Design notes for Plans 03 and 04

Decisions taken before writing the two adapter plans, with reasoning. Recorded because a plan
that simply asserts a structure is much harder to argue with later than one that shows why.

---

## 1. The service layer lives in `core`, not in each adapter

Spec §3.1's tree has no shared server package: `strapi-v4` and `strapi-v5`, each estimated at
300–400 lines. Taken literally, everything above the data layer — publish orchestration, audit
writing, secret redaction, the scheduler tick, rate limiting — would be written twice.

That reading contradicts §3.2, which states the principle directly: lift whatever does not need
Strapi into `core`, where it can be tested without booting Strapi. And §6.2 already defines the
seam that makes it possible:

```ts
export interface Repo<T> {
  findMany(params): Promise<T[]>; findOne(id): Promise<T | null>
  create(data): Promise<T>; update(id, data): Promise<T>; delete(id): Promise<void>
}
```

A service written against `Repo<T>` has no Strapi dependency at all. It belongs in `core` by
`core`'s own charter.

**Decision.** Plan 03 builds the service layer in `packages/core/src/server/`, written against
`Repo<T>` and the existing `LineClient`, with its own tests that never boot Strapi. Each adapter
supplies three things and nothing more: a `Repo` implementation, a `UIPort` implementation, and
its version's registration boilerplate.

**What this costs if wrong:** `core` grows a server-side surface that a browser bundle must not
pull in. Mitigated the way it already is for `sharp` — the `/browser` subpath stays the only
entry the admin bundle imports, and Task 1 of Plan 03 extends the existing import guard test to
prove `server/` is unreachable from it.

**What it buys:** one implementation of the publish path rather than two that drift, one test
suite over it, and a Plan 04 that is genuinely thin — which matters, because Plan 04 is where
Strapi 5 support lands and it should not be re-litigating publish semantics.

---

## 2. Compensation captures prior state before mutating (resolves the Plan 01 carry-forward)

The carry-forward left this open for §8: if `upsertAlias` succeeds and `setDefault` then fails,
`compensate` deletes the created menu but the alias still points at the deleted id.

Reordering does not fix it. Make the alias swap last and `setDefault` becomes the step that can
succeed before a later failure deletes the menu the default now points at — LINE is then left
with no default at all, which is worse than a stale alias.

**Decision.** Capture before each mutation, restore exactly what was captured:

- before `setDefault` — `GET /v2/bot/user/all/richmenu` for the current default (404 = none)
- before `upsertAlias` — `GET /v2/bot/richmenu/alias/{aliasId}` for the current target (404 = none)

`compensate` restores both, then deletes the new menu. This is adapter-level knowledge the pure
machine cannot have, which is exactly why Plan 01 could not close it.

The existing property test asserts *no orphan menus* and is named as though it asserts *no orphan
state*. Plan 03 narrows that name and adds a test for the state property it does not cover.

---

## 3. Publish must not run inside the request

Measured in Plan 01: an incompressible image walks the whole size ladder through mozjpeg and
takes over five seconds. §4.3 and the carry-forward both say normalize belongs at upload time.

**Decision.** `normalize` runs when the image is uploaded, not when the menu is published. The
publish path consumes an already-normalized file and the rung it landed on, and `payload.size`
comes from that returned rung rather than from what the form believed. `sizeNameFor()` maps back
to the name the database holds.

---

## 4. Plan 04 gets the release work, not just the v5 adapter

Because §1 of these notes moves the shared work into Plan 03, Plan 04 carries: the v5 adapter
(DS v2, `documents()`, `@strapi/sdk-plugin`), i18n wiring for both versions, `examples/v5-app`,
the README with screenshots, the demo deployment, and the 1.0.0 publish.

**Publishing to npm and making the repository public are the user's calls, not mine.** Plan 04
prepares both to the point where each is a single command, and stops there.
