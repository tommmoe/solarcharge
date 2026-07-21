# Repository release rule

- Every code change intended to be pushed must also bump the patch version in `custom_components/solar_charge/manifest.json` and create the matching `v<version>` release tag.
- Do not leave a push-ready code commit at a version that already has a release tag.
