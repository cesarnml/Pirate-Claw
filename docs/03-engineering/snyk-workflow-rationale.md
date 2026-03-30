# Snyk Workflow Rationale

- `Red first:` the repo had no automated dependency or source-security scan in CI, so a known vulnerability or obvious code-security issue could merge without any dedicated signal.
- `Why this path:` adding a separate Snyk job to the existing GitHub Actions workflow was the smallest acceptable change because it preserved the current Bun validation pipeline, added both dependency and source scanning, and required only one repository secret.
- `Alternative considered:` SonarQube was rejected for now because this repo already gets broad code-quality coverage from formatting, linting, typechecking, and tests, while the bigger gap was security-specific scanning.
- `Deferred:` SARIF upload, GitHub code-scanning integration, and any SonarQube adoption remain follow-up work after the team sees whether the Snyk signal-to-noise ratio is worth expanding.
