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

`core` and `ui` are internal workspace packages — both `package.json`s set `private: true` and are
never published — bundled into each adapter at build time, so an installed plugin is a single
package with no workspace-only dependency.

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

Five content types, all `draftAndPublish: false`. Four stay hidden from Content Manager —
"published" here means *published to LINE*, and two competing notions of published in one table is
a confusion that buys nothing. The fifth, `line-member`, is the deliberate exception.

**`rich-menu`** — name, size, chat bar text/mode, `selected`, `templateKey`, `areas` (bounds +
action as JSON), the raw and normalised image file ids, normalised mime and dimensions, `aliasId`,
`status`, `lineRichMenuId`, `linePublishedAt`, `lastError`, and `audience` (`'all' | 'members'`,
defaulting to `'all'`).

**`line-channel`** — name, channel id, and the encrypted `channelAccessToken` / `channelSecret`,
both `private: true`, plus `accessTokenLast4` written once at save time, and `memberRichMenuId` —
the LINE rich menu id currently enabled for members on this channel, or `null`.

**`rich-menu-schedule`** — one row per pending operation: `runAt`, `op`, `state`, `lockedBy`,
`lockedAt`, `lastError`, `cursor`. See [Scheduling](#scheduling) for what `cursor` is for and which
ops actually use it.

**`rich-menu-audit`** — actor, action, before, after, result, error code, for everything that
touched LINE.

**`line-member`** — `channel` (required), `lineUserId`, `displayName`, `linkedRichMenuId`,
`linkedAt`. `channel` is required rather than merely sensible: a LINE user id is scoped to one
Official Account, so the same person following two of your channels holds two different, unrelated
ids, and a member row with no channel would be an id nobody could resolve back to an account. This
is the one content type in the plugin left visible in Content Manager, because managing that list
by hand is the entire feature — deliberately no webhook, no CSV import, no bespoke REST endpoint of
its own for populating it.

Neither `rich-menu.audience` nor `line-channel.memberRichMenuId` is paired with a stored "is this
live right now" flag, and that is deliberate, carrying forward the same rule the account default
already followed: **which menu is active is derived, never stored.** For `audience: 'all'` that
means asking LINE for the account default directly (`GET /v2/bot/user/all/richmenu`); for
`audience: 'members'` it means comparing `memberRichMenuId` against the menu in question. A cached
boolean would drift from whichever of those is actually true the moment a console edit or a
half-finished background job changed the real answer without anyone updating the flag to match —
asking the source of truth on every read is slower than trusting a column, but it cannot go stale.

Deriving it that way has one consequence worth naming, because two guards exist only to enforce it:
the two reads answer *different questions*, so a row whose `audience` says `'all'` while
`memberRichMenuId` still points at it is invisible — the screen would ask LINE for the account
default and never look at the pointer. Both writes that could produce that pairing are refused
rather than corrected. Activating a menu that is not `audience: 'members'` answers `409
menu_not_members_audience`; changing `audience` away from `'members'` on the menu a channel is
currently pointing at answers `409 menu_active_for_members`. Neither one "fixes" the other half for
the caller — unlinking members is a decision about real people's chats, not something to infer from
an edit to a form field.

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

Two more ops ride the same table: `link-members` and `unlink-members`, queued by each adapter's
`activate`/`deactivate` controller handlers rather than by a display period. Both walk LINE's
bulk-link and bulk-unlink endpoints, which accept at most 500 user ids per call, so a channel with
more members than that is worked through 500 at a time, possibly across several ticks, instead of
inside the request that flipped the toggle — the same reasoning as [Images](#images): the slow,
failure-prone part happens off to the side rather than inside a request a proxy's timeout can cut
off partway through.

The two jobs are not symmetric, on purpose. `link-members` pages with a keyset cursor (`id >
cursor`, never an offset) written back onto the schedule row after every chunk, because its source
— "members of this channel" — does not shrink while the job runs; without a remembered position, a
job resumed after a crash would send everyone from the first member again. `unlink-members` carries
no cursor and must not grow one: its source is "members still holding this menu's LINE id," which
shrinks by exactly one chunk's worth every time a chunk succeeds, because unlinking a member clears
that field the moment it happens. A job with no memory that resumes against a query which has
already forgotten what it did is still correct; paging the same set by a remembered cursor would
not be, and would need one anyway to know it was done.

`unlink-all` (the "Unlink everyone" action — see [USAGE.md](USAGE.md#two-menus-two-audiences)) is
deliberately not one of these jobs. It exists for members a chunked job cannot reach — rows deleted
while LINE was unreachable, or people linked to a menu before this feature existed — by calling
`POST /v2/bot/richmenu/batch` for the whole menu in one shot, synchronously inside the request that
asked for it, never through the scheduler. LINE's quota on that endpoint — three requests per hour,
per account — is the reason it stays a manual, confirmed action rather than something the
scheduler could ever call on its own.

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
