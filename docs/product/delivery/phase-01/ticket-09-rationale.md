# P1.09 Rationale

- `Red first:` a CLI-level test proving `media-sync status` shows recent runs and candidate states from SQLite, plus a follow-up test proving it fails cleanly without creating a database when none has been initialized.
- `Why this path:` adding a read-only SQLite open path plus a schema-presence check was the smallest acceptable way to keep `status` truly inspect-only while reusing the existing repository queries and compact formatter.
- `Alternative considered:` calling `ensureSchema()` from `status` or auto-creating an empty database was rejected because ticket 09 explicitly targets read-only operator inspection, and silent database creation would make misleading output look valid.
- `Deferred:` richer troubleshooting output, dedicated status-only summary row types, and retry orchestration remain for later tickets if operator needs justify them.
