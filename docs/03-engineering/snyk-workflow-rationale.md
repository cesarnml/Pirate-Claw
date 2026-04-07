# Snyk Workflow Rationale

- `Red first:` the repo had no automated dependency or source-security scan in CI, so a known vulnerability or obvious code-security issue could merge without any dedicated signal.
- `Why this path:` adding a separate Snyk job to the existing GitHub Actions workflow was the smallest acceptable change because it preserved the current Bun validation pipeline, added both dependency and source scanning, and required only one repository secret.
- `Alternative considered:` broad SonarQube PR triage was initially rejected because this repo already gets broad code-quality coverage from formatting, linting, typechecking, and tests, while the bigger gap was security-specific scanning.
- `Current scope:` the repo now carries explicit SonarQube Cloud support for standalone PR review orchestration, but only imports failed-check annotations into the `ai-review` flow. Lower-severity warning noise remains in SonarQube itself instead of entering the delivery triage loop by default.
- `Still deferred:` SARIF upload, GitHub code-scanning integration, and any broader SonarQube warning-level ingestion remain follow-up work if the team decides the extra signal is worth the operator overhead.
