# Using the plugin

A walk through the whole job: connect an Official Account, build a menu, schedule it, push it to
LINE, and fix it when LINE says no.

The [README](../README.md) covers installation and `config/plugins.js`. This picks up from a
working install.

- [Connect a LINE Official Account](#connect-a-line-official-account)
- [Build a menu](#build-a-menu)
- [The image](#the-image)
- [Actions](#actions)
- [Chat bar](#chat-bar)
- [Display period](#display-period)
- [Publish](#publish)
- [Tabbed menus with aliases](#tabbed-menus-with-aliases)
- [Scheduling](#scheduling)
- [Two menus, two audiences](#two-menus-two-audiences)
- [When LINE and Strapi disagree](#when-line-and-strapi-disagree)
- [Troubleshooting](#troubleshooting)

## Connect a LINE Official Account

**Channel settings → Add an account.** You need three values from the
[LINE Developers console](https://developers.line.biz/console/), under your Messaging API channel:

| Field | Where it comes from |
|---|---|
| Channel ID | Basic settings |
| Channel secret | Basic settings |
| Channel access token | Messaging API → Channel access token (long-lived) |

Press **Test connection** before saving. It calls `GET /v2/bot/info` and shows the Official
Account's display name — if it shows the wrong account, you pasted a token from a different
channel, which is the single most common setup mistake and is otherwise invisible until you
publish to the wrong place.

The token is encrypted with AES-256-GCM before it touches the database and is never returned to
the browser again. The channel list shows `••••••••abcd` — the last four characters, stored
separately at save time, so no screen ever needs to decrypt anything. See
[SECURITY.md](../SECURITY.md).

Requires the `settings` permission.

## Build a menu

**Create rich menu** → pick a template.

Seven large (2500×1686) and five compact (2500×843) templates. LINE accepts a fixed set of canvas
sizes and the picker shows which apply to each template. If none of them fit, turn on **Adjust the
layout manually** and drag the areas — the canvas stays the same size, but the areas become yours
to move and resize, and you can add up to LINE's limit of 20.

Changing to a template with a *different canvas size* discards the uploaded image, because the
image was normalised to the old size. Changing between templates of the same size keeps it.

## The image

Upload a JPEG or PNG matching the canvas aspect ratio. The plugin rejects a mismatched ratio in
the browser before it uploads, so you find out immediately rather than at publish time.

**Normalisation happens when you save, not when you publish.** The image is walked down a ladder
of LINE's accepted sizes through mozjpeg until it fits LINE's 1 MB limit. A hard-to-compress image
can take **more than 10 seconds** inside one save request — if you sit behind a proxy with a short
timeout, raise it.

Doing this at save time rather than publish time is deliberate: the slow, failure-prone step
happens while you are sitting there watching, not at the moment you are trying to ship.

## Actions

Every area gets one action. The nine LINE supports:

| Action | What the user gets | Notable limit |
|---|---|---|
| `message` | Sends text to the chat as if they typed it | 300 chars |
| `uri` | Opens a link | 1000 chars, must be `http`/`https`/`tel`/`line` |
| `postback` | Sends data to your webhook, optionally showing text | 300 chars |
| `datetimepicker` | Opens a date / time / datetime picker | mode is required |
| `richmenuswitch` | Switches to another menu — see [aliases](#tabbed-menus-with-aliases) | alias must exist |
| `clipboard` | Copies text | 1000 chars |
| `camera` | Opens the camera | label only |
| `cameraRoll` | Opens the photo picker | label only |
| `location` | Opens the location picker | label only |

Every limited field shows a live counter, because LINE's limits differ per field and per action
type, and a `maxLength` with no counter just stops accepting keystrokes with nothing on screen
explaining why.

Selecting an area on the canvas highlights its card in the list, and the reverse — the green
outline on the phone and the green card are the same selection.

## Chat bar

The bar under the menu. **Menu bar label** is the text LINE shows there (default: `Menu`), and
**Default behaviour** decides whether the menu starts open or collapsed when a user enters the
chat.

The preview honours both, and you can tap the bar in the preview to open and close it, exactly as
a real user can regardless of the default you set.

## Display period

Optional start and end, each a date field and a separate time field. Leave both empty and the menu
has no schedule at all — it is shown whenever you make it the default.

The end must be after the start. This is checked before save on every path, including **Save
draft**, because a menu whose period ends before it begins is shown to nobody and saves perfectly
cleanly otherwise.

Setting a period does not publish anything by itself. See [Scheduling](#scheduling).

## Publish

**Publish** does, in order:

1. Validates the whole menu against LINE's schema
2. Creates the rich menu on LINE (`POST /v2/bot/richmenu`)
3. Uploads the normalised image (`POST /v2/bot/richmenu/{id}/content`)
4. Optionally sets it as the account default
5. Records the LINE rich menu ID against your row

**If any step fails, the partially-created menu on LINE is deleted before the error is returned.**
A failed publish leaves nothing behind on LINE — the alternative is orphans that count against
your account's rich menu limit and that nobody knows exist.

Requires the `publish` permission. Publishing is rate limited per channel, in memory, per process —
see [Known limits](../README.md#known-limits) if you run several instances.

## Tabbed menus with aliases

An **alias ID** is a name you give a published menu so other menus can switch to it. Give menu A
the alias `tab-a` and menu B the alias `tab-b`, then give an area on A a `richmenuswitch` action
pointing at `tab-b`. Tapping it swaps the menu without leaving the chat — that is how every
multi-tab LINE menu you have seen is built.

Alias IDs are unique per channel, enforced by the plugin rather than by the database, so the same
alias can exist on two different Official Accounts.

## Scheduling

If the scheduler is enabled in `config/plugins.js`, a menu with a display period is set as the
account default at its start time and cleared at its end, without anyone pressing anything.

```js
scheduler: { enabled: true, cron: '* * * * *', lockTtlMs: 300000 }
```

Jobs are claimed with a database-level lock, so **running several Strapi instances is safe** — one
instance claims a job, the others skip it. `lockTtlMs` is how long a claim survives if the
instance holding it dies mid-job.

If you would rather run it from outside — a Kubernetes CronJob, a platform scheduler, anything —
turn the internal scheduler off and call the endpoint yourself:

```sh
curl -X POST https://your-strapi/line-rich-menu/schedules/tick \
  -H "Authorization: Bearer <admin JWT>"
```

That route requires `publish` like every other route that touches LINE. It is not public, and
calling it more often than necessary is harmless — jobs that are not due are skipped.

## Two menus, two audiences

Every menu has an **audience**: `all` or `members`. `all` is the default, and it is exactly what
this plugin always did — whichever menu you set as the account default, by hand or through
[Scheduling](#scheduling), is what everyone who opens the chat sees. `members` is for showing a
*second*, different menu to a specific list of LINE users without touching that default. The
current-menu card at the top of the rich menu list shows both at once — who "Everyone" is seeing
right now and who "Members" is seeing — each read live from LINE rather than guessed from the
database, so it can never disagree with what a user actually has open.

### Setting a menu's audience

**Audience** is a two-option field in the rich menu editor, in **Main settings** next to the title
and the display period: **Everyone** or **Members**. New menus start on Everyone, so a members menu
is always something you chose rather than something you ended up with. Opening an existing menu
fills the field in from what that menu already is, so renaming it or swapping its image and pressing
Save leaves the audience alone.

Setting the field is not the same as switching the menu on. Audience is a *label* — what this menu
is for. The [members toggle](#the-members-toggle) below is the *action* that makes it the menu your
members actually hold. A menu on Everyone cannot be switched on at all; its toggle stays disabled
and says so, rather than letting you press a button that is guaranteed to fail.

If you drive the API directly instead, `POST`/`PUT /line-rich-menu/menus` accepts `audience` as
`"all"` or `"members"`. Leaving the key out of the body means *unchanged* — never *reset to
`all`* — so a partial update from a script cannot quietly demote a members menu.

#### Turning a live members menu back to Everyone

Once a menu is switched on for members, changing its audience back to Everyone is refused with
**409 `menu_active_for_members`**. It is not a bug to work around: a menu labelled Everyone while
your members are still holding it is invisible on this screen — "active" for an Everyone menu is
read from LINE's account default, not from the members pointer — so nothing would show you the real
state, and there would be no way to switch it off from the UI either.

**Turn the members toggle off first, then change the audience.** The plugin deliberately will not
do that for you: switching the toggle off unlinks every member from the menu, and that is a decision
about real people's chats, not a detail to be inferred from an edit to a form field.

### Creating members

**LINE member** is a content type you can see and edit in Content Manager — unlike every other
content type this plugin defines, which stay hidden — because managing that list by hand is the
whole feature: there is no webhook, no CSV import, and no separate REST endpoint of its own for
adding people. Each row needs a **channel** and a **LINE user ID**. The channel is required, not
just convenient: a LINE user ID is scoped to one Official Account, so the same person following two
of your channels holds two different, unrelated IDs — a member row with no channel would be an ID
nobody could resolve back to an account.

Add a member while that channel's members menu is already switched on, and the plugin links that
one person to LINE immediately, inside the same save — it does not wait for the background job
described next. Delete a member who was linked, and the plugin unlinks them the same way. Both are
best-effort: a LINE failure here is logged and written to the audit trail rather than blocking the
edit, because Content Manager already told you the row saved successfully, and undoing that to
match a failed LINE call would throw away work that already succeeded.

### The members toggle

Once a menu is published and its audience is `members`, its row in the rich menu list grows a
working **Enable for members** toggle. Every row has one, but it stays disabled until the menu is
both published and set to Members, because activating it in any other state answers with an error
the plugin already knows is coming; a menu on Everyone says as much in a line under its toggle.
Turning it on asks how many members are on file for that channel,
shows you the number so you know what you are about to do, and — once you confirm — links every one
of them to the menu; LINE's own default for everyone else is left untouched. Turning it off unlinks
everyone currently held to that menu.

Linking goes through LINE's bulk-link endpoint, which accepts at most 500 user IDs per request, so
turning the toggle on for a channel with more members than that runs as a background job, 500 at a
time, rather than inside the request that pressed the toggle — a channel with fifty thousand members
would otherwise mean a hundred LINE calls and ten thousand row updates inside one HTTP request,
which is exactly what a proxy timeout or a mid-deploy restart cuts off part way through. That job
remembers where it stopped: each chunk's position is saved before the next one starts, so if LINE
hard-fails partway through — a real error, not a timeout — the job stops and waits for you to press
the toggle again to resume from that point, rather than silently retrying forever or starting over
from the first member. Turning the toggle off does not need the same bookkeeping, because its job
draws from "everyone still holding this menu," a set that shrinks by itself every time a chunk
succeeds — re-running it after a crash just continues, by definition, with nothing to remember in
between.

### "Sent," not "delivered"

Every place this feature reports on an action — the toggle above, and **Unlink everyone** below —
says the command was **sent**, never that it was delivered or applied. That word choice is
deliberate, not vague: LINE's bulk-link and bulk-unlink calls both answer with an empty `202` the
instant they accept the request, and there is no way to ask afterwards whether any given user
actually received the change. Saying "delivered" would be reporting something this plugin has no
way to check.

You can check one member at a time, though: each **LINE member** row has a **Verify** action that
calls `GET /v2/bot/user/{userId}/richmenu` for that person and shows which menu LINE says they are
currently holding. It is a spot check rather than a report, because that endpoint only ever answers
for one user per call — there is no bulk version of *reading back* what happened, only of asking
LINE to make it happen.

### Unlink everyone, at most three times an hour

The toggle's off switch only reaches people the plugin's own member rows still point at. If a row
went missing some other way — LINE was unreachable when someone unfollowed and the record never
caught up, or a person was linked to this menu before this feature existed — that job has nothing
left to find them by. **Unlink everyone**, on the rich menu list, reaches past the plugin's own
records entirely and asks LINE directly to drop this one menu from every user still holding it,
known to this plugin or not.

That directness has a cost. It goes through `POST /v2/bot/richmenu/batch`, which LINE caps at
**three requests per hour, per account** — not per menu, not per plugin instance. A fourth attempt
inside the same hour fails, reported the same generic way as any other failure here, without
repeating LINE's reason back to you — so if you have pressed this three times in the last hour, the
fix is to wait for the hour to turn over, not to keep retrying. It is meant to be a rare maintenance
action, which is why the confirmation dialog spells the limit out before you spend one of the three.

## When LINE and Strapi disagree

They will, eventually: someone deletes a menu in LINE's own console, a publish dies at exactly the
wrong moment, or a menu was created by a different tool.

**Channel settings → Check for orphaned menus** compares both sides and reports:

- **Orphaned rich menus** — on LINE, unknown here. Delete them from this screen; they count
  against your account limit.
- **Missing from LINE** — recorded here as published, absent there. Publish them again.

Reconcile only reads, apart from the delete you explicitly press. Requires `publish`.

## Troubleshooting

**"Could not save" with no field marked.** The server rejected the whole payload. Every field-level
problem marks its own field, so a bare toast means the shape was wrong — usually a menu with no
areas at all.

**"Could not save" on a menu that is switched on for members.** If the only thing you changed was
the audience — Members back to Everyone — the server refused it with `menu_active_for_members`,
because that menu is still the one your members are holding. Turn its **Enable for members** toggle
off first, then change the audience. See
[Turning a live members menu back to Everyone](#turning-a-live-members-menu-back-to-everyone).

**The members toggle is greyed out.** It needs both things: the menu must be published, and its
audience must be **Members**. If the audience is the problem, a line under the toggle says so; if
there is no such line, the menu has not been published yet.

**A blank title.** Title is required on every save path including drafts. It is not filled in for
you, because a database full of "Untitled" is worse than being asked once.

**Publish fails with an image error.** LINE re-checks the image on its side. If the plugin
normalised it successfully but LINE refuses it, the usual cause is a menu whose areas do not tile
the canvas — LINE requires areas within bounds and non-overlapping.

**The scheduler never fires.** Check `scheduler.enabled`, then check the instance is actually
awake at the scheduled minute. A cron set for a specific minute does not fire if the process is
asleep then; platforms that sleep idle instances will miss it. This is why the public demo runs
with the scheduler off.

**Images vanish after a redeploy.** Your upload provider is writing to a local disk that the
platform discards. Configure a real provider (S3, Cloudinary) — the plugin stores files through
Strapi's upload plugin and never touches the filesystem itself.

**403 on everything.** The role is missing plugin permissions. `read` alone shows menus but blocks
every write; `publish` is separate from `write`; `settings` is separate again and is the only one
that can reach channel tokens.
