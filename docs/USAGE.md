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
