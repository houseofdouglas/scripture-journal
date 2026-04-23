# Scripture Ingestion Script

Fetches all four LDS Standard Works from `churchofjesuschrist.org`, parses
each chapter into the `ScriptureChapter` schema, and uploads JSON to S3.

**Idempotent** — chapters already in S3 are skipped (HeadObject check).
Safe to re-run; only missing chapters are fetched and uploaded.

---

## Prerequisites

1. AWS credentials configured (`~/.aws/credentials` or environment variables)
2. The app data S3 bucket already exists (created by `terraform apply`)
3. Node.js 22 + npm installed

```bash
npm install
```

---

## Running against dev

```bash
BUCKET_NAME=scripture-journal-app-818371815071-dev \
ENV=dev \
tsx scripts/ingest-scripture.ts
```

Output legend:
- `.` — chapter already existed in S3 (skipped)
- `+` — chapter fetched and uploaded
- Error lines printed immediately for any failures

---

## Running against prod

```bash
BUCKET_NAME=scripture-journal-app-818371815071-prod \
ENV=prod \
tsx scripts/ingest-scripture.ts
```

---

## Notes

- The script pauses 200ms between fetches to avoid hammering the CJC servers.
- Expect the full ingestion to take ~2–4 hours on first run (thousands of chapters).
- Re-runs after a partial failure are safe — already-uploaded chapters are skipped.
- If a chapter fails to parse (HTML structure changes), an error is logged but
  the script continues. Check the summary at the end; exit code 1 if any errors.
