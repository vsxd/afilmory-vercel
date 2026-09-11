# Dependency policy

Dependencies are pinned or lockfile-resolved and reviewed through four layers:

1. every pull request runs a production advisory audit and dependency review;
2. weekly automation audits development dependencies too;
3. Dependabot groups patch/minor updates separately from major updates;
4. CI emits a CycloneDX production SBOM for each tested revision.

Major updates remain separate Dependabot pull requests outside the minor/patch
groups. Maintainers triage that backlog at least monthly. A major update is not
merged until its migration notes are reviewed, build and browser checks pass, and
behavioral changes are recorded in `CHANGELOG.md`. Large framework upgrades may
be split into an issue with independently reviewable milestones.

`pnpm-workspace.yaml` permits install scripts only for dependencies with a known
native/build requirement. Each allowlist addition must name the direct or
transitive source in its PR and explain why the script is necessary. Stale names
must be removed.
