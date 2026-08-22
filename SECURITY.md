# Security Policy

This plugin stores and uses **LINE channel access tokens** — credentials that let whoever
holds them impersonate your LINE Official Account. We take reports about it seriously.

## Reporting a vulnerability

Use GitHub's [private vulnerability reporting](https://github.com/captainkie/strapi-plugin-line-rich-menu/security/advisories/new)
first — it opens a draft advisory only you and the maintainer can see, so nothing about
an unpatched issue becomes public before a fix ships.

If you can't use that (no GitHub account, or the repository's Security tab is unreachable
for you), email **security@fosivo.com** instead. Do not open a public issue for a
suspected vulnerability — for a plugin that handles bearer credentials, a public issue
is a disclosure, not a report.

We aim to acknowledge a report within **3 business days** and to give you a fix timeline,
not just a fix, within **10 business days**. If a report turns out to affect a supported
version, we will credit you in the advisory unless you ask us not to.

## Supported versions

| Version | Supported |
|---|---|
| 1.x (`strapi-plugin-line-rich-menu`, Strapi 5) | ✅ |
| 1.x (`strapi-plugin-line-rich-menu-v4`, Strapi 4.25.x) | ✅ — plugin code only, see below |
| < 1.0 (pre-release) | ❌ |

"Supported" for the Strapi 4 adapter means: we patch vulnerabilities in code we wrote or
depend on directly, and we keep shipping it as long as paying customers run Strapi 4.25.x.
It does **not** mean Strapi 4 itself is secure — see the next section.

## The Strapi 4 position

**Strapi 4 reached end of life on 30 April 2026.** No more security patches from Strapi,
for anything, at any price. Its dependency tree carries dozens of known advisories that
nobody upstream is going to fix, spread across every severity including critical.

We are not going to print today's count here, because it changes faster than a document
does — on 21 August 2026, `scripts/audit-shipped.mjs` counted 69 distinct advisory IDs
while `pnpm audit --prod` reported 74 vulnerabilities on the same tree the same hour, and
both numbers were higher by the end of the week. Run it yourself:

```bash
pnpm audit --prod            # every advisory in the tree, Strapi 4's included
node scripts/audit-shipped.mjs   # only the ones we could actually fix
```

What is stable is the shape, and the shape is what matters: every one of those advisories
reaches you through `@strapi/strapi`, and none of them through anything we ship.

We didn't bring that dependency tree in — `@strapi/strapi` is a `peerDependency`, not a
`dependency`, of `strapi-plugin-line-rich-menu-v4` — and we can't fix it. Gating our CI on
the full advisory count would mean CI stays red forever over something we cannot act on,
which is the kind of red that people learn to ignore, and the day `sharp` or `zod` — the
two runtime dependencies we *did* choose — actually has a vulnerability, nobody would
notice it in the noise.

So `scripts/audit-shipped.mjs` gates on a narrower, useful question: does any advisory
reach us through a path that does **not** go through `@strapi/strapi`? Today the answer is
no — every advisory in the tree is Strapi 4's own. If that ever changes, CI turns red on
exactly the thing we can update.

**Running Strapi 4.25.x in production means accepting Strapi 4's own unpatched dependency
tree — with or without this plugin installed.** That's the risk you're taking on by
staying on Strapi 4 while you migrate; we'd rather you decide that on purpose than
discover it the day someone asks about your `npm audit` output.

## What the plugin itself defends

Each of these is a mechanism you can read in this codebase today, not a claim about intent:

- **Channel access tokens are encrypted at rest** with AES-256-GCM, a per-record random IV,
  and an HKDF-SHA256–derived key (`packages/core/src/crypto.ts`). The type that every normal
  read path returns (`ChannelRecord`) has no field for the token at all — only
  `ChannelService.withSecrets()` returns a type that does (`ChannelWithSecrets`). Leaking a
  token by accident is a compile error, not something a code review has to catch. The channel
  list and detail views never decrypt anything — the `••••••••abcd` preview they show comes
  from a `accessTokenLast4` column written once at save time, so there is no plaintext for
  those paths to leak in the first place.
- **Every admin route requires an RBAC permission** (`admin::hasPermissions`), with the
  `settings` permission — which can read and rotate tokens — kept separate from `publish`,
  which can only push to LINE. This is verified by acceptance tests on both adapters that log
  in as a role holding only `read` and assert every other route answers 403; on the Strapi 5
  adapter the same tests use a document ID that *looks* real so that a 403 from the policy and
  a 404 from a handler that never should have been reached can't be confused for each other.
- **Logs are scrubbed before they leave the process.** `packages/core/src/server/scrub.ts`
  redacts any object key matching `token|secret|authorization|password|credential` and strips
  bearer tokens out of strings, at every log level (`debug` included, since that's the level
  people accidentally dump whole request objects into) — the scheduler's logger is wrapped the
  same way.
- **Uploaded images are validated before they reach LINE**: format is restricted to JPEG/PNG,
  pixel count is capped before decoding (so a decompression bomb is rejected before memory is
  allocated for it), and the normalized output is capped at LINE's byte limit.

## What it does not defend

**The encryption key lives in your Strapi application's environment** (`config.encryptionKey`,
or derived from `APP_KEYS[0]` if you don't set one). Anyone who can read that environment —
or your `.env` file, or your process's memory — can derive the key and decrypt every channel
token this plugin stores. That is true of essentially every application-level secret and this
plugin does not change it: protecting your host environment is your responsibility, not
something a plugin running inside it can enforce from the inside.
