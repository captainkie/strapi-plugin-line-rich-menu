# Demo deployment

The public demo runs **Strapi 5** (`examples/v5-app`) at **`line-rich-menu.fosivo.com`** —
Render (free, Docker) for compute, Render's own free Postgres for the database, and Cloudinary
(free media) for uploads. Everything in this repository is prepared for that; connecting the
pieces is one pass through three dashboards plus a short DNS sequence, and it is the owner's
call, not CI's.

## Why v5, not v4

`SECURITY.md` states in public that Strapi 4 reached end of life on 30 April 2026 and that its
dependency tree carries advisories nobody is going to patch. A public, internet-facing demo
running that exact stack, under our own domain, would contradict that document while it is
being published — the demo would *be* the known-vulnerable target the security policy warns
about. The v4 adapter stays supported, tested and shipped; it just does not get a public URL.

Both adapters share `packages/ui`, so a v5-only demo does not shortchange v4 users — the
screenshots in the README (Task 14) already come from `examples/v5-app` for the same reason.

## Why the demo talks to a mock, running in the same container

`LINE_API_BASE_URL` and `LINE_API_DATA_BASE_URL` point at `tools/line-mock`, not at
`api.line.me`. A public demo with a real LINE channel access token in it is a token anyone can
take, and the mock behaves like the real API for everything the demo shows — including the
failure paths that trigger compensation.

The mock runs as a **second process inside the same container** as Strapi
(`examples/v5-app/docker-entrypoint.sh`), bound to `127.0.0.1`, rather than as a second Render
service. Two free Render services sleep *independently*: a visitor who wakes Strapi and clicks
Publish would have their first outbound call reach a mock that is still cold — roughly a
minute of nothing, then a timeout, which looks exactly like the plugin being broken. One
container means one sleep/wake cycle and no cross-service race, and it is one fewer draw on
the free-hour pool the next section explains is already shared with another project.

The entrypoint starts the mock in the background and then `exec`s Strapi so Strapi becomes
PID 1. If the mock dies, the container keeps running unaffected — only *publishing* a menu
breaks, since that is the only thing that ever calls out to it. No process supervisor is built
for this on purpose; a demo does not need one, and it would only be a second thing that could
silently swallow a crash.

Cold start on Render free is typically on the order of a minute. That is fine here: rich menu
images are uploaded **from** us **to** `api-data.line.me` (via the mock), so nothing external
ever needs to reach the demo to make the main flow work. A public URL only becomes necessary
to demo LINE postback webhooks, which this demo does not — use `cloudflared tunnel` locally
for that instead.

## Why the image is built in CI

`examples/v5-app` builds its admin panel with **Vite**, a different bundler than older Strapi 4
demos used — so an older demo's memory reasoning does not transfer here, and this document
does not repeat it unmeasured. The number below is measured on this exact stack instead.

Peak resident set size of `npm run build` (`strapi build`) in `examples/v5-app`, with the
plugin installed from a freshly packed tarball exactly as the Dockerfile does it:

| Where measured | Peak RSS |
| --- | --- |
| macOS (Apple Silicon), `/usr/bin/time -l pnpm exec strapi build` | ≈ 1.73 GiB (1,853,865,984 bytes) |
| `node:20.20.0-bookworm-slim` container (`/usr/bin/time -v`) — same base image and same `npm run build` command the Dockerfile runs | ≈ 1.79 GiB (1,879,672 KB) |

Measured three separate times across this task (twice on macOS, once inside the actual
`node:20.20.0-bookworm-slim` base image on linux/amd64) and landed in the same 1.7–1.8 GiB band
every time, including after the `config/plugins.js` and `config/database.js` changes below —
this is Vite/Rollup bundling a full Strapi admin panel plus a plugin, not noise. Both figures
are well over the 512 MB a Render free instance has. Vite's production build still runs
Rollup under the hood, and bundling a full Strapi admin panel plus a plugin is memory-hungry
regardless of how fast the *dev* server is — dev-server speed and production-bundle memory use
are different things, and this project has been burned before by a justification nobody
actually measured. So the same operational answer as ever applies, for a re-derived reason:
`strapi build` still cannot run on the Render instance itself. It runs once, in
`.github/workflows/demo-image.yml`, on a GitHub-hosted runner with several GB of RAM to spare,
and Render only ever pulls and runs an image that is already finished. `render.yaml` has no
`buildCommand` for exactly this reason — do not add one.

Building in CI also has the two benefits that would matter even if the number above had come
in under 512 MB: every deploy runs the exact bytes CI built and tested, and Render's cold start
never has to wait behind a build — it only has to start a process.

## Do not point an uptime pinger at this demo

**No uptime pinger, cron ping, or "keep-alive" job may ever be pointed at
`line-rich-menu.fosivo.com`.**

Render's free tier gives a workspace 750 instance-hours a month, and that pool is **shared**
with every service in the workspace — not just this one. Render free services spin down after
roughly 15 minutes idle and only burn hours while awake, so several mostly-idle services
coexist fine inside 750 hours. What does **not** coexist is a service kept permanently awake —
that alone can consume most or all of the shared pool.

The instinct, once someone notices the roughly-a-minute cold start above, is to add a cron job
that pings the demo every few minutes to keep it warm. **Do not.** In a workspace that hosts
anything else, that pinger does not just make this demo expensive — it exhausts the shared
allowance and suspends the *other* services too, and it does so with a failure that looks
nothing like its cause: an unrelated project simply stops, weeks later, for no visible reason.
If the cold start has to go away, the answer is a paid Render plan or a workspace that holds
nothing else, never a pinger on this one.

### `render.yaml`'s `healthCheckPath` is not the pinger the section above forbids

It is worth saying explicitly, because it is the line in `render.yaml` most likely to look like
one. Render's own docs describe a configured health check as doing two things: gating whether a
*newly deployed* instance starts receiving traffic, and detecting a hung *already-running*
instance so Render stops routing to it. Free-tier spin-down, separately, is governed entirely by
genuine external inbound HTTP/WebSocket traffic reaching the service — Render's own
control-plane health probe is not that.

Render's documentation does not spell out this interaction in one place, so it was checked two
other ways rather than assumed.

The circumstantial argument: if setting `healthCheckPath` kept a free instance permanently
awake, that would be a well-known, zero-effort way to defeat free-tier spin-down — and it
appears nowhere as one. Every documented workaround for keeping a free service awake is an
*external* uptime monitor hitting a public endpoint on its own schedule (the thing this section
forbids), never "just configure a health check."

The empirical one, which is stronger: a free-tier Render service with `healthCheckPath`
configured, last deployed and then left alone for a month, still reports itself unsuspended with
no quota suspension against it. Had its health check counted as keep-alive traffic, that service
would have run continuously for roughly 730 hours in the first month alone and been suspended
for exhausting the 750-hour allowance well before anyone looked. It was not. A health check on a
sleeping free instance does not wake it.

If that ever turns out to be wrong, the symptom will be a service in this workspace running out
of hours for no visible reason. Verify with Render support before assuming a different cause —
and do not delete this line reflexively, because without it a hung instance keeps receiving
traffic.

### The scheduler is off on this demo

`LINE_RM_SCHEDULER` is `'false'` here, deliberately, even though the scheduler is a real and
fully tested feature (the acceptance suite covers a scheduled job being claimed and completed).
Two reasons, both about what an *unattended public demo on a sleep-cycling free instance* does
to a feature that is otherwise fine:

- The cron only runs while the container is awake. A schedule set for a specific time will
  silently not fire if Render happens to be asleep at that minute, and "I scheduled a menu
  change and it didn't happen" reads as a broken scheduler to anyone testing it — the same
  hosting-causes-a-false-negative shape the in-container LINE mock already avoids.
- A schedule that *does* fire mutates the demo's shared state — expiring a display period,
  clearing the default menu — with no visitor watching and no way to attribute the change to
  "the scheduler ran," which is confusing on a resource multiple strangers may be using at once.

Scheduling is exercised by the automated test suite instead of the public demo. Set
`LINE_RM_SCHEDULER` to `'true'` only if a future maintainer decides a live demonstration of
scheduling is worth the false-negative risk above — that is a call to make deliberately, not a
default to flip back without re-reading this paragraph.

## One-time setup

Written after actually doing it. Each step below has a trap in it, and every one of them cost
a failed deploy the first time.

1. **Make the container image public.** `.github/workflows/demo-image.yml` pushes to
   `ghcr.io/<owner>/line-rich-menu-demo`, and a GHCR package inherits the repository's
   visibility — so while the repo is private, Render's pull fails with `unable to fetch image
   with provided input`, which does not mention permissions at all. Flip the package to public
   in its own settings, or give Render a registry credential. Public is the better trade: a
   credential that does not exist cannot leak or need rotating.

2. **Database — use Render's own free Postgres, in the same region as the service.** Neon works
   too, but a Postgres in the same account is one fewer service to hold an account for, and it
   gives you the thing that matters next.

   **Use the *internal* connection string and set `DATABASE_SSL=false`.** The external string
   fails from inside Render with `Connection terminated unexpectedly`, which reads like a
   network fault and is not one: `config/database.js` verifies certificates properly rather than
   setting `rejectUnauthorized: false`, and Render's internal host does not present a
   publicly-trusted certificate. The fix is the internal address, not a weaker TLS check —
   loosening verification to make an error go away is how a real certificate problem gets
   ignored later.

3. **Secrets.** `render.yaml` declares `ADMIN_JWT_SECRET`, `API_TOKEN_SALT`,
   `TRANSFER_TOKEN_SALT`, `JWT_SECRET` and `LINE_RM_ENCRYPTION_KEY` as `generateValue: true`,
   and Render fills them in when it reads the blueprint. **If you create the service through the
   API instead, you must generate all five yourself** — miss them and the container exits 1 on
   boot. `JWT_SECRET` in particular is `users-permissions`' own, separate from
   `ADMIN_JWT_SECRET`, and it only throws when `NODE_ENV !== 'development'`, so no amount of
   local `strapi develop` will ever show you the failure.

4. **Cloudinary is optional, and the demo currently runs without it.** With no `CLOUDINARY_*`
   set, `config/plugins.js` keeps the local `strapi-provider-upload-absolute-url` provider and
   the app boots normally — uploaded images simply live on Render's ephemeral disk and disappear
   on the next deploy. That is a real limitation and the README says so plainly rather than
   letting a visitor discover it and conclude the plugin lost their file. Add the three
   variables whenever you want images to persist; nothing else changes.

5. **Register the administrator before you publish the link.** A fresh Strapi hands superadmin
   to whoever reaches `/admin` first — so a demo URL shared while `GET /admin/init` still
   reports `hasAdmin: false` is an invitation to claim the demo. Create the account, then check
   `/admin/init` says `true`, then publish. Seed one channel named **Demo LINE OA** with any
   fake access token; the in-container mock accepts anything, and the channel list will show the
   token masked to its last four characters, which is worth seeing on a live host.

   This demo does **not** run `scripts/seed.js` in production — that script is for `pnpm e2e:v5`
   and reads `E2E_*` credentials that are never set on Render.

6. **Then take superadmin away from the account whose password you are about to publish.** Step 5
   leaves you holding a superadmin, and a superadmin's password printed in a public README is a
   Strapi whose Content-Type Builder, admin user list, API tokens and entire database are open to
   anyone who reads the page. A demo account and a superadmin account are not the same thing, and
   the first admin Strapi creates is always the second one.

   Create a second, private Super Admin first — otherwise Strapi correctly refuses to demote the
   last one — then:

   ```sh
   STRAPI_URL=https://your-demo.example.com \
   SUPERADMIN_EMAIL=... SUPERADMIN_PASSWORD=... DEMO_EMAIL=demo@example.com \
   DEMO_ALLOW_CHANNEL_SETTINGS=true \
   node examples/v5-app/scripts/demo-restrict.mjs
   ```

   It rewrites Strapi's stock **Editor** role — Community Edition cannot create new roles, so the
   demo borrows one — down to four permissions by default: `read`, `write` and `publish` from this
   plugin, plus `plugin::upload.assets.create` for the editor's image field. Everything else the
   Editor role ships with (the whole Content Manager, i18n, the rest of the Media Library) is
   replaced, not merged: what has to be true is "this account holds four permissions", not "this
   account holds four permissions plus whatever was there before".

   The fifth, `plugin::line-rich-menu.settings`, is the permission that sets and rotates LINE
   channel access tokens, and it is **opt-in** through `DEMO_ALLOW_CHANNEL_SETTINGS=true` rather
   than part of the default set. If your demo talks to a real LINE Official Account, leave it off:
   handing it to an account whose password is printed in a README means handing over that
   account's credentials, even though no route in this plugin ever returns a token to a client.

   This demo turns it on, for three reasons that were checked rather than assumed. A channel
   record has **no base-URL field** (`server/src/content-types/line-channel.ts`) — the endpoint
   comes only from `LINE_API_BASE_URL` in the environment, so no visitor can point the demo at a
   host of their choosing. That endpoint is the `line-mock` in the same container, which accepts
   any token, so the credential on offer is fake to begin with. And without the permission, the
   Channels page still renders but its **Add an account** and **Test connection** buttons answer
   `403` when pressed — the plugin's UI does not currently hide controls the account cannot use,
   so a first-time visitor reads that as a broken plugin rather than a restricted login.

   Two details measured on the live host rather than assumed:

   - **`plugin::upload.read` is not needed.** It looks like it should be: the upload controller
     sanitises its response with the *read* ability, so an account without it could plausibly get
     back a file object stripped of the `url` the editor needs. A real upload as the restricted
     account comes back with `url` intact. Leaving the permission out also keeps Media Library out
     of the demo's navigation entirely.
   - **`PUT /admin/roles/:id/permissions` answers `200` with an empty `data` array when nothing
     changed.** A script that reports what that response contains says "restricted to zero
     permissions" on its second run — and would say exactly the same on a run that wrote nothing
     at all. `demo-restrict.mjs` reads the role back with a `GET` and compares, because the only
     thing a `200` here proves is that the request was well-formed.

   Verify from the outside afterwards, as the demo account: `/admin/users`, `/admin/roles`,
   `/admin/api-tokens`, `/content-type-builder/content-types` and `POST /line-rich-menu/channels`
   must all answer `403`, while `GET /line-rich-menu/menus` answers `200`.

## The public hostname and its Cloudflare protection

The demo lives at `line-rich-menu.fosivo.com` — Fosivo Labs' own subdomain, not a customer's.
The zone is a working one that serves other things besides this demo, which is why several
decisions below are about not disturbing its neighbours.

Getting from "Render service exists" to "hostname is live and protected" is a specific
**order**, because reversing it is not cheap to undo:

1. **Create the Render service first, and add `line-rich-menu.fosivo.com` as its custom domain
   in Render — before any DNS record exists.** A CNAME pointing at a hostname Render does not
   yet claim resolves to Render's generic 404 page, and that response caches.
2. **Create the CNAME as `dns-only`** (grey cloud, not proxied), and wait for Render to report
   the certificate issued. Render's TLS certificate comes from an ACME HTTP-01 challenge, and
   Cloudflare's proxy would intercept `/.well-known/acme-challenge/` for its own purposes if
   the record were already orange-clouded — so issuance has to happen with Cloudflare out of
   the path.
3. **Flip the record to proxied**, then put **one** Cloudflare custom rule in front of the
   hostname: block the highest-volume scanner traffic a public host receives (`.php`, `.env`,
   `.git`, `wp-*`, phpMyAdmin paths) before it ever reaches Render — which also means that
   traffic never wakes the sleeping instance, protecting the free-hour pool from the section
   above.

   **Do not put a Managed Challenge in front of `/admin/login`.** That rule was deployed here and
   then removed, because it broke the demo's login outright. `/admin/login` is not the login
   *page* — that is `/admin/auth/login` — it is the API endpoint the admin panel POSTs to. A
   Managed Challenge answers with an HTML interstitial, the admin panel parses the reply as JSON,
   and the user sees `The string did not match the expected pattern`, a message that points
   nowhere near Cloudflare.

   It was removed rather than narrowed to the page, because the path was only the visible half of
   the mistake: **a challenge cannot protect an API endpoint at all.** It defends by asking a
   browser to solve something, and a credential-stuffing script calling the endpoint directly
   never renders the challenge, let alone solves it. The rule locked out the only population it
   could actually reach — real users — while the attack it was aimed at went through untouched.

   Credential stuffing is still the attack worth caring about on a real Strapi admin, and what
   answers it is Strapi's own limiter: `@strapi/admin` puts `admin::rateLimit` on `POST
   /admin/login` and `POST /admin/register-admin`, defaulting to five attempts per five minutes
   keyed on the submitted email, the path and the caller's IP
   (`server/src/middlewares/rateLimit.js`). It is enforced by the layer that knows what a login
   is, it answers with JSON like every other Strapi error, and it is easy to confirm — run a
   handful of scripted logins and the sixth comes back `429 RateLimitError`.

   (A Cloudflare rate-limiting rule was evaluated and dropped. The Free plan allows exactly
   **one** per zone, and in this zone that slot was already taken by brute-force protection for
   another host. Watch for the trap in the API if you deploy this yourself:
   `PUT /zones/{id}/rulesets/phases/{phase}/entrypoint` **replaces the entire phase** with the
   rules you send, so a call carrying only your own rules deletes everyone else's and still
   returns HTTP 200 `"success": true`. Read the phase, merge, then write.)

   Cloudflare's **Bot Fight Mode** is deliberately left off — it is zone-wide with no
   per-hostname exception, and this zone also serves API hosts whose callers are programs, not
   browsers; turning it on to protect the demo would start challenging those callers too,
   breaking someone else's project days later in a way that would not point back here. Note
   that **Browser Integrity Check is on** for this zone, though, which is a milder version of
   the same idea and does reach the demo: a request with an unusual or missing `User-Agent` —
   `Python-urllib/3.x`, for instance — is answered with Cloudflare error `1010` before Strapi
   ever sees it, while `curl` and real browsers pass. Worth knowing before you conclude the demo
   API is down.
4. **Verify** by requesting the hostname and checking the response carries a `cf-ray` header —
   that header is the proof Cloudflare is actually in the path; without it, every rule above is
   deployed and inert. Then confirm the block rule by requesting `/wp-login.php` and getting a
   `403` from Cloudflare rather than a `404` from Strapi.

If Render's certificate ever fails to renew (it renews over the same HTTP-01 mechanism as step
2), the remedy is the same sequence in miniature: flip the record back to `dns-only` for an
hour, let the renewal complete, then flip it back to proxied. The symptom — a TLS error on a
site that has worked for months — will not look like it points at Cloudflare's proxy setting,
which is exactly why it is worth writing down here.

## Rejected alternatives

Fly.io no longer has a meaningful free tier (a 7-day, 2 VM-hour trial only). Koyeb closed
free-tier signups after the Mistral acquisition in early 2026. If Render's free tier ever
changes terms, Northflank, Zeabur and Back4App are the fallbacks worth evaluating first.
