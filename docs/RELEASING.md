# Releasing

Two commands in this document are the owner's to run, not CI's, not an agent's:
`npm publish` (via `pnpm release`) and making the repository public. Everything else
below is automated or verifiable ahead of time.

## Before tagging

1. `pnpm install --frozen-lockfile`
2. `pnpm typecheck && pnpm lint && pnpm test:coverage`
3. `pnpm build` — the only command that exercises `resolveJsonModule` through tsup's
   `dts: true`, and the only one that produces what `check:deps` and `verify` inspect

   Copy the root README into both published packages — npm renders the README that ships
   inside the tarball, not the one at the repo root, and a symlink cannot survive `npm pack`:

   ```sh
   cp README.md packages/strapi-v4/README.md
   cp README.md packages/strapi-v5/README.md
   ```

4. `pnpm check:deps && pnpm verify`
5. `pnpm e2e:v4 && pnpm e2e:v5`
6. **Check the last nightly mutation run was green.** Mutation testing runs nightly and
   after merge to `main`, never on a pull request — it is far too slow to gate one. That
   means a PR that guts assertions merges green and only breaks the run afterwards. The
   nightly result is therefore a release gate, not background noise:
   `gh run list --workflow ci.yml --json conclusion,name -q '.[] | select(.name=="mutation")' | head -1`

## Publishing (owner only)

```sh
pnpm changeset            # describe the release
pnpm version-packages     # writes versions + CHANGELOG
git commit -am "chore(release): 1.0.0" && git tag v1.0.0
git push --follow-tags
```

The `release` workflow takes it from there: it builds, verifies, and runs
`changeset publish` with `--provenance` under GitHub Actions OIDC. Provenance requires a
**public** repository — on a private one npm rejects the attestation and the publish fails.

To publish by hand instead:

```sh
NPM_CONFIG_PROVENANCE=true pnpm release
```

## After the repository goes public

Three things start working on their own or with one command:

- **CodeQL** — the job in `ci.yml` is gated on `github.event.repository.visibility == 'public'`
  and skips today. GitHub Advanced Security is organisation-only, so it cannot run on a
  personal-account private repo at any price. It begins running by itself.
- **Branch protection** — `.github/rulesets/main.json` is committed but not applied, because
  rulesets are refused on private repos owned by a personal account on the Free plan.
  Apply it once: `gh api -X POST repos/captainkie/strapi-plugin-line-rich-menu/rulesets --input .github/rulesets/main.json`
  Read `.github/rulesets/README.md` first — it explains why zero required approvals is
  correct for a sole maintainer and why `mutation` must never be a required check.
- **npm provenance** — see above.
