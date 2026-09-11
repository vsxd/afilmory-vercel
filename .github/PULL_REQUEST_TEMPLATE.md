## Summary

-

## Risk and compatibility

- User-visible behavior:
- Manifest/config/cache compatibility:
- Privacy, accessibility, performance, or security impact:

## Verification

List checks actually run and explain any that are not applicable. Documentation-only
changes need Markdown formatting and `git diff --check`.

- [ ] `pnpm contracts`
- [ ] `pnpm format:check`
- [ ] `pnpm lint`
- [ ] `pnpm type-check`
- [ ] `pnpm test:coverage` and `pnpm coverage:check:partitions`
- [ ] `pnpm deploy:smoke` (uses the synthetic gallery; no photo credentials needed)
- [ ] Relevant E2E/deployment smoke checks, or an explanation below
- [ ] Synthetic fixture regenerated and drift-checked when schema/E2E data changed
- [ ] Tests and documentation cover new behavior and configuration
- [ ] `CHANGELOG.md` updated for notable Project Code changes
- [ ] No secrets, private manifests, personal filenames, or exact GPS data are included
- [ ] I have the right to submit this contribution under the repository's inbound terms

## Notes

-

Optional DCO attestation: contributors who prefer a commit-level certification may
add `Signed-off-by` with `git commit -s`; see `docs/CONTRIBUTING.md`.
