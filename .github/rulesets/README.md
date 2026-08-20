# Branch protection

`main.json` is a GitHub repository ruleset, ready to apply. It is not active yet.

## Why it is not applied

Branch protection and rulesets are unavailable on **private** repositories owned by a
personal account on the Free plan. Both the classic protection API and the newer rulesets
API answer:

```
403 Upgrade to GitHub Pro or make this repository public to enable this feature.
```

So there are two ways to turn this on: pay for GitHub Pro, or make the repository public.
The plan is to go public at 1.0.0, and this file is waiting for that day.

## Applying it

```sh
gh api -X POST repos/captainkie/strapi-plugin-line-rich-menu/rulesets \
  --input .github/rulesets/main.json
```

Verify it took:

```sh
gh api repos/captainkie/strapi-plugin-line-rich-menu/rulesets --jq '.[] | "\(.name) \(.enforcement)"'
```

## What it enforces, and why each rule is there

| Rule | Effect |
|---|---|
| `deletion` | `main` cannot be deleted |
| `non_fast_forward` | no force pushes onto `main` — published history stays published |
| `pull_request` | every change reaches `main` through a PR, including the owner's |
| `required_status_checks` | `quality`, `secrets`, `dependencies` and `codeql` must pass, and the branch must be up to date with `main` first |

**`required_approving_review_count` is 0 on purpose.** A single maintainer cannot approve
their own pull request, so requiring one approval would block every merge. Zero still
forces the change through a PR, which is where the value is: CI runs, the diff is
reviewable, and nothing lands on `main` untested.

**`mutation` is deliberately not a required check.** That job is gated on
`github.event_name == 'push'`, so it never runs on a pull request. Requiring a check that
cannot report on PRs would deadlock every merge.

**`codeql` is included because this ruleset only ever applies once the repository is
public**, and CodeQL works on public repositories at no cost. It is gated off in the
workflow while the repo is private, since GitHub Advanced Security is an
organization-level product and cannot be enabled on a personal-account private repo at
any price — not even with Pro.

**`bypass_actors` is empty**, so the rules apply to the owner too. That is the intent, but
it does mean an emergency fix also has to go through a PR. If that is ever genuinely
blocking, set the ruleset's enforcement to `disabled` in the GitHub UI, fix, and turn it
back on — rather than adding a permanent bypass that quietly undoes the protection.
