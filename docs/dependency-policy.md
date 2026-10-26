# Dependency policy

Dependencies are pinned or lockfile-resolved and reviewed through four layers:

1. every pull request runs a production advisory audit and dependency review;
2. weekly automation audits development dependencies too;
3. Dependabot checks routine updates monthly, with one group per ecosystem;
4. CI emits a CycloneDX production SBOM for each tested revision.

Routine npm updates share one group across production and development
dependencies; GitHub Actions share another. Each ecosystem has a limit of one
open routine update PR. Major updates join these groups and still require review
of migration notes, build and browser checks, and a `CHANGELOG.md` entry for
behavioral changes. Large framework upgrades may be split into independently
reviewable milestones.

When enabled in the repository's GitHub settings, security update PRs use
separate groups and are advisory-triggered rather than waiting for the monthly
schedule. This configuration does not enable that repository setting. The
high-severity audit/review thresholds and weekly full audit remain in place.
Changing Dependabot configuration can trigger an immediate check, so the
open-PR limit is not a monthly quota.

Automatic major version updates for `jotai` and `@types/node` are deferred until
the supported Node.js runtime contract is reviewed. Jotai 3 requires Node.js
22.12 or newer, while the project still declares Node.js 20 support; Node.js 26
types should not be adopted independently of the runtime. These are
`update-types` ignores only, so security updates remain eligible. This policy
does not certify the existing dependency tree's Node.js 20 compatibility.
The pinned local/CI toolchain uses Node.js 22.22.2 so jsdom and the patched
Undici can start browser-environment tests. The Node.js 20 CI job only checks
contracts and types, not the full runtime or test suite.

React Scan remains on 0.5.6: 0.5.7 adds React Doctor and dependencies rejected by
the existing license policy. Revisit that update when its dependency licenses
can satisfy the policy; do not bypass the review by broadening the allowlist.

`pnpm-workspace.yaml` permits install scripts only for dependencies with a known
native/build requirement. Each allowlist addition must name the direct or
transitive source in its PR and explain why the script is necessary. Stale names
must be removed.
