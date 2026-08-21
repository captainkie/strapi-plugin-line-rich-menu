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

   ```sh
   run_id=$(gh run list --workflow ci.yml --json databaseId,event -q '[.[] | select(.event=="schedule")][0].databaseId')
   gh run view "$run_id" --json jobs --jq '.jobs[] | select(.name=="mutation") | .conclusion'
   ```

   `gh run list --json name` reports the **workflow** name (`CI`), never a job name — a
   one-line `select(.name=="mutation")` on that output matches nothing, ever, and returns
   silently empty whether the job passed, failed, or never ran. Confirmed live against this
   repository: the single-line form returned nothing while the two-line form above correctly
   reported the last nightly run's actual `mutation` job conclusion.

## Pre-public checklist

Each line below is phrased as the failure it prevents, not the task it names — a checklist
that just names tasks gets skimmed and ticked; one that says what breaks reads slower, on
purpose. `docs/tests/release.test.ts` enforces the ones that can be checked mechanically;
the rest need a human because the failure mode itself requires judgment or an external
system (npm, GitHub, DNS) that the test suite has no read access to.

- [ ] **Branch merged.** A published artifact that corresponds to no commit on `main` cannot
      be reproduced or audited afterwards.
- [ ] **`changeset version` run.** Both packages sit at `0.0.0` today. Publishing that is not
      recoverable — the version number is part of what npm will never let you overwrite.
- [ ] **README present inside the `npm pack` output — checked against a real tarball, not
      assumed.** `files` in both `package.json`s lists `README.md`, but `npm pack` only
      includes it if the copy step in `release.yml` actually ran first; a `cp` to the wrong
      file or the wrong path would still make the workflow's text look correct.
      `docs/tests/release.test.ts` runs this exact check today as part of the normal test
      suite. To repeat it by hand:

      ```sh
      cp README.md packages/strapi-v5/README.md
      cd packages/strapi-v5 && npm pack --pack-destination /tmp && cd -
      tar tzf /tmp/strapi-plugin-line-rich-menu-*.tgz | grep -qx package/README.md
      ```

      `npm pack --workspace strapi-plugin-line-rich-menu` from the repo root does **not**
      work here and will not work — this repo is a pnpm workspace (`pnpm-workspace.yaml`),
      and the root `package.json` declares no npm `"workspaces"` key, so npm reports
      "No workspaces found" instead of packing anything. `cd` into the package directory
      first, as above.
- [ ] **Screenshots final.** npm renders the README it ships, images included — a stale
      screenshot becomes part of the published artifact, not just of the repo.
- [ ] **`security@fosivo.com` spelled correctly in `SECURITY.md`.** The routing rule's
      destination is already verified through an existing address on the same zone, so a
      typo in the local part is the one failure mode left, and it is cheap to eyeball.
- [ ] **Repository is public before the first publish.** npm provenance attestation requires
      it; a private repo fails at the attestation step, after every other gate above has
      already passed — the most expensive place for this to fail.
- [ ] **Full-history secret scan is clean.** Going public exposes every commit ever made, not
      just the tip of `main`; a secret committed and later deleted is still reachable through
      `git log`. `docs/tests/release.test.ts` asserts no `.env*` file other than
      `.env.example` was ever committed, in any commit. That check is necessary but not
      sufficient — separately run `gitleaks detect --log-opts=--all` from the repo root and
      **read** the finding list rather than trusting the exit code: `.gitleaksignore` records
      the specific, already-reviewed matches (test fixtures that happen to look like keys),
      so "zero findings" and "only the recorded findings" are different outcomes, and only
      the second one is a pass. A new, unrecorded finding means stop and look at it — it is
      not automatically a real secret, but it is not automatically safe either.

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

## What is prepared but deliberately not done

Two things in this repository are one command away and stay that way until the owner runs
them. Neither is an oversight; both are decisions that belong to a person.

| Action | Command | Why it waits |
|---|---|---|
| Publish 1.0.0 to npm | `git tag v1.0.0 && git push --follow-tags` | Publishing a name is irreversible in practice — `npm unpublish` works for 72 hours and leaves the version as a permanent hole |
| Make the repository public | GitHub → Settings → Danger Zone | It turns on CodeQL, unblocks rulesets and is what npm provenance requires — and it exposes every commit in the history at once |

Everything that can be checked ahead of either one is checked by `.github/workflows/release.yml`,
which runs the same gates as CI and then stops at `changeset publish`.
