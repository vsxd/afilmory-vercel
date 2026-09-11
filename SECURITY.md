# Security Policy

## Supported versions

Security fixes are made on the `main` branch and included in the next release.
Only the latest tagged release receives fixes; older deployments should upgrade
before requesting support.

| Version               | Supported |
| --------------------- | --------- |
| Latest release        | Yes       |
| `main`                | Yes       |
| Older tagged releases | No        |

## Reporting a vulnerability

Please use GitHub's **Security → Report a vulnerability** flow for this
repository. It creates a private security advisory visible only to maintainers
and invited collaborators. Do not include vulnerability details, private photo
URLs, credentials, or personal GPS data in a public issue.

Include the affected commit or release, deployment/storage mode, reproduction
steps, impact, and any suggested mitigation. Use synthetic photos and redacted
configuration whenever possible. If private vulnerability reporting is not
available, open a public issue asking maintainers to establish a private channel
without disclosing the vulnerability itself.

Maintainers aim to acknowledge reports within three business days and provide an
initial assessment within seven. Timelines are targets rather than guarantees.
Coordinated disclosure will be agreed with the reporter after a fix is available.

## Secrets and cache credentials

The default local `photos/` library, `.env`, and `.env.*` variants are ignored
by Git (the public `.env.template` remains tracked). Add any custom local photo
directory to `.gitignore` before populating it. Ignore rules do not remove files
that are already tracked.

Never commit `.env`, object-store credentials, real photo manifests, or cache
tokens. Cache tokens should be fine-grained, restricted to the dedicated cache
repository, and granted only repository contents read/write access. They do not
need organization administration, workflow, package, issue, or source-repository
permissions. Keep the cache repository private: exact-location mode can contain
precise coordinates in both the manifest and geocoding cache. See [the cache
security guide](docs/cache-security.md).

## Published photo metadata

`PHOTO_LOCATION_MODE=coarse|strip` limits location data in the generated manifest
and geocoding requests. It does not sanitize original photos: local originals
are copied unchanged, and S3/CDN originals are served from the configured source.
Downloadable originals may still contain exact GPS and other private EXIF.
Remove sensitive metadata from the source files before publishing them.
