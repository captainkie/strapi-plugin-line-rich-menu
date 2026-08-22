# How this plugin is built

The design, and the reasoning behind the parts that are not obvious. For *using* the plugin see
[USAGE.md](USAGE.md); for the security posture see [SECURITY.md](../SECURITY.md).

- [The problem](#the-problem)
- [Package layout](#package-layout)
- [The UIPort seam](#the-uiport-seam)
- [The Repo seam](#the-repo-seam)
- [Data model](#data-model)
- [The publish pipeline](#the-publish-pipeline)
- [Images](#images)
- [Scheduling](#scheduling)
- [Credentials at rest](#credentials-at-rest)
- [Permissions](#permissions)
- [Errors](#errors)
- [Testing strategy](#testing-strategy)

## The problem

One plugin has to run inside two incompatible host applications. Strapi 4 and Strapi 5 differ in
almost every layer this plugin touches:

| | Strapi 4 | Strapi 5 |
|---|---|---|
| Data API | `entityService`, numeric ids | `documents()`, `documentId` strings |
| Design system | DS v1 | DS v2, built on Radix |
| Admin bundler | webpack 5 | Vite |
| Router | react-router v5 (`Switch`, `component`) | v6 (`Routes`, `element`) |
| Plugin entry | root shims | `exports` map, `@strapi/sdk-plugin` |

Publishing two unrelated codebases would mean every fix landing twice and drifting immediately.
The design answer is that **everything version-specific lives behind two seams**, and everything
else is shared code that has no idea which Strapi it is running inside.

## Package layout

```
packages/
  core/          ทั้งหมดที่ไม่รู้จัก Strapi เลย — schema, LINE client, publish, images, crypto
  ui/            React ทั้งหมด วาดผ่าน UIPort เท่านั้น ไม่ import design system ตรง ๆ
  strapi-v4/     adapter: UIPort impl (DS v1) + Repo impl (entityService) + routes
  strapi-v5/     adapter: UIPort impl (DS v2) + Repo impl (documents) + routes
tools/
  line-mock/     LINE Messaging API ปลอม สำหรับ e2e
examples/
  v4-app/        Strapi 4.25.x จริง ติดตั้งปลั๊กอินจาก tarball
  v5-app/        Strapi 5.x จริง ติดตั้งปลั๊กอินจาก tarball
```

`core` and `ui` are published as `@fosivo/line-rich-menu-{core,ui}` but bundled into each adapter
at build time, so an installed plugin is a single package with no workspace-only dependency.

The example apps install **from `npm pack` output**, not from a workspace link, because the tarball
is what a user actually receives and a workspace link hides packaging mistakes until release day.

## The UIPort seam

`packages/ui/src/port.ts` declares every UI primitive the shared code is allowed to use — inputs,
buttons, modals, layout, toasts, navigation, translation, and four theme colours. Each adapter
implements it against its own design system.

Rules that make the seam hold:

- **No file in `packages/ui` imports a design system.** If a component needs something the port
  does not have, the port grows a member; it does not reach around.
- **The port is a contract, not a convenience.** `RadioGroup` is a group owning `value`/`onChange`
  with dumb `Radio` children, rather than self-contained radios, because DS v2 sits on Radix where
  a standalone radio item cannot exist. Shaping the port around the *harder* implementation is what
  keeps both possible.
- **Two declared exemptions:** `CanvasEditor` and `Preview` draw LINE's own surfaces — the chat
  wallpaper, LINE green, the phone frame — with inline styles rather than through the port. Those
  pixels belong to LINE's product, not to Strapi's chrome, and must look identical in both hosts.

The payoff is verifiable rather than asserted: `packages/ui` renders unchanged against DS v1 and
DS v2 with nothing different but the port implementation.

## The Repo seam

`Repo<T>` is a five-method interface — `findMany`, `findOne`, `create`, `update`, `delete` — that
lets the whole service layer live in `packages/core/src/server/` with no Strapi import anywhere.
Each adapter maps it to its own data API and, critically, owns the id translation: v5's `documentId`
strings and v4's numeric ids never leak into shared code.

`ImageStore` is the second seam of the same kind, covering file read/write/URL through Strapi's
upload plugin, so the plugin never touches a filesystem and works with any upload provider.

## Data model

Four content types, all `draftAndPublish: false` and all hidden from Content Manager — "published"
here means *published to LINE*, and two competing notions of published in one table is a confusion
that buys nothing.

**`rich-menu`** — name, size, chat bar text/mode, `selected`, `templateKey`, `areas` (bounds +
action as JSON), the raw and normalised image file ids, normalised mime and dimensions, `aliasId`,
`status`, `lineRichMenuId`, `linePublishedAt`, `lastError`.

**`line-channel`** — name, channel id, and the encrypted `channelAccessToken` / `channelSecret`,
both `private: true`, plus `accessTokenLast4` written once at save time.

**`rich-menu-schedule`** — one row per pending operation: `runAt`, `op`, `state`, `lockedBy`,
`lockedAt`, `lastError`.

**`rich-menu-audit`** — actor, action, before, after, result, error code, for everything that
touched LINE.

### One shape that has caused repeated defects

`templateKey` is `null` whenever a layout has been hand-edited. It has been read as "which canvas
is this" in five separate places, and each time the defect was different: the canvas vanished, the
canvas silently resized, a custom layout could not be published, could not take an image, and
finally saving a hand-edited layout silently deleted the uploaded image.

The question those places were actually asking is answered by `size`, which does not get cleared.
Every known instance is fixed; **the shape that invites the mistake is still there**, and this
paragraph exists so the sixth is caught in review rather than in production.

## The publish pipeline

`packages/core/src/publish/` owns the sequence, with no Strapi knowledge:

1. Validate against the LINE schema (`packages/core/src/schema.ts`)
2. `POST /v2/bot/richmenu` — create, receive the LINE rich menu id
3. `POST /v2/bot/richmenu/{id}/content` — upload the normalised bytes
4. Optionally set as the account default
5. Persist the LINE id and status

**Compensation is part of the design, not error handling bolted on.** A failure at step 3 deletes
the menu created at step 2 before returning. Rich menus count against a per-account limit, and an
orphan nobody knows about is worse than a failure someone can see.

The publish path is rate limited per channel by an in-memory token bucket, built once per Strapi
instance — rebuilding it per request would hand every request a full bucket, which is the same as
having no limiter while looking like you have one.

## Images

`packages/core/src/image/` normalises at **save** time, not publish time.

The ladder walks LINE's accepted canvas sizes downward through mozjpeg until the result fits the
1 MB limit, then records which rung it landed on. Publish reads that result and never invokes
sharp — so the slow, memory-hungry, failure-prone step happens while a human is watching the save
spinner rather than at the moment they are trying to ship.

Decompression bombs are rejected **before** decoding: `.metadata()` is read first and anything
above 100 megapixels is refused, so the memory is never allocated. Format is restricted to JPEG and
PNG, and the output is capped at LINE's byte limit.

## Scheduling

A display period becomes two rows in `rich-menu-schedule`: `set-default` at the start and
`clear-default` at the end.

Claiming uses a single conditional `UPDATE` through knex — `where state = 'pending' and (lockedAt
is null or lockedAt < now - ttl)` — so **multiple Strapi instances are safe**: exactly one wins each
row, and a claim held by a process that died expires on its own.

The claim targets the adapter's own id column (`document_id` on v5, `id` on v4). Getting this wrong
does not throw; it claims zero rows forever, and the tick report reads `due: n, claimed: 0`, which
is indistinguishable by eye from "nothing was due". That is why the column name is an exported
constant with a test rather than a literal.

`POST /schedules/tick` exposes the same routine for external schedulers, and carries the same
`publish` permission as everything else that reaches LINE. It is not exempt.

## Credentials at rest

Channel access tokens are encrypted with **AES-256-GCM**, a per-record random IV, and a key derived
via **HKDF-SHA256** from `config.encryptionKey` — or from `APP_KEYS[0]` if you do not set one.

The type that every ordinary read path returns, `ChannelRecord`, **has no field for the token at
all.** Only `ChannelService.withSecrets()` returns a type that does. Leaking a token by accident is
a compile error rather than something code review has to notice.

Logs are scrubbed before leaving the process: any key matching `token|secret|authorization|password|
credential` is redacted and bearer tokens are stripped from strings, at every level including
`debug` — which is precisely the level people dump whole request objects into.

The threat this does **not** address is stated plainly in [SECURITY.md](../SECURITY.md): anyone who
can read your application's environment can derive the key.

## Permissions

Four, and the split between them is the point:

| Permission | Can |
|---|---|
| `read` | See menus and channels, token previews only |
| `write` | Create and edit drafts |
| `publish` | Push to LINE, set the default, reconcile, run the tick |
| `settings` | Create channels and set access tokens |

Every route is `type: 'admin'` with an `admin::hasPermissions` policy — deny by default, no
exceptions, including `/schedules/tick`. Separating `settings` from `publish` means you can let
somebody ship menus without ever letting them see the Official Account's access token.

## Errors

Failures that are the caller's fault answer `4xx` with a machine-readable `code`; only genuine
server faults answer `500`. A `POST /menus` naming a channel that does not exist is a `400`, not an
internal error — the caller can act on the first and cannot act on the second, and logs full of
"internal errors" that are nothing of the kind train people to ignore the real ones.

Writes that span several rows run inside a transaction, so a failure part-way cannot leave an
orphan draft whose retry then fails with `alias_id_taken` — a message describing a problem the
first attempt invented.

## Testing strategy

- **Unit** — `packages/*/tests`, including mutation testing on `core`, where the logic that decides
  what reaches LINE lives.
- **Acceptance** — `examples/v{4,5}-app` run **real Strapi** with the plugin installed from a
  tarball, against `tools/line-mock`. This is the only layer that can prove the plugin loads at all:
  RBAC, the admin bundle, the scheduler's database lock, and the upload provider are all things a
  unit test can only pretend to exercise.
- **Docs** — `docs/tests/` asserts that this documentation, `render.yaml`, the Dockerfile and the
  release workflow still describe what the code does.

One rule outranks the rest, and it was learned expensively: **a new assertion is not believed until
it has been watched failing on purpose.** This project has repeatedly produced guards that were
green while enforcing nothing — a coverage floor that excluded the package it protected, a
token-leak guard that existed on one adapter only, a `pipefail` interaction that reported present
files as missing, a screenshot test that photographed an empty page, and a gitleaks config that
would have disabled the scanner entirely. Every one looked correct while being useless.
