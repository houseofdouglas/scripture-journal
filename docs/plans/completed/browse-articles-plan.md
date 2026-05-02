# Execution Plan: Browse Articles

**Started**: 2026-04-27
**Status**: IN PROGRESS
**Spec**: [docs/specs/browse-articles.md](../../specs/browse-articles.md)
**Tasks**: [docs/tasks/browse-articles-tasks.md](../../tasks/browse-articles-tasks.md)

## Progress

- [x] BA-01 — Add ArticleIndex type and Zod schema
- [x] BA-02 — Repository: read and update ArticleIndex
- [x] BA-03 — Infra: CloudFront invalidation permission and env var
- [x] BA-04 — Service: maintain ArticleIndex after successful import
- [x] BA-05 — Tests: service and handler coverage for index maintenance
- [x] BA-06 — UI: useArticleIndex query hook
- [x] BA-07 — UI: ArticleBrowserPage, Nav link, and route

## Dependency Map

```
BA-01 → BA-02 → BA-04 → BA-05
BA-03 ──────────↗
BA-01 → BA-06 → BA-07
```

BA-03 and BA-06 can start immediately in parallel with BA-02.

## Decisions & Notes

(Updated as work proceeds)
