# Acceptance Report: Rich Article Blocks
Date: 2026-10-02
Result: PASS. Two live checks are pending real content (see "Open").

## Summary

Shipped in #11, with deploy fixes #12–#14 and a mobile fix #15. Verified live on notes.xzvf.mobi by re-importing the reference article (*The AI-Native SDLC Playbook*) and inspecting both the stored JSON and the rendered page in a browser at 1004 px and 375 px.

- **Automated:** 699 unit/component tests and 104 Playwright tests (chromium) pass. `tsc --noEmit` and `eslint --max-warnings 0` are clean. Service-layer line coverage is 93%.
- **Found during the live check and fixed:**
  - At 375 px the article page was laid out 675 px wide. One text block held a long unbroken run of URLs (the reference's link-card "Resources" box), and text blocks didn't wrap long tokens.
  - #15 adds `overflow-wrap: break-word` to block content and an E2E fixture block covering it. After deploy, `scrollWidth == clientWidth == 375`.
- **Deploy pipeline:**
  - This feature was the first to run Terraform in CI.
  - The deploy role lacked read permissions Terraform needs during refresh. #12 and #13 updated the deploy policy and fitted it under IAM's 6,144-character limit. #14 added the companion `scripture-journal-deploy-read` policy.
  - The final apply was 2 added, 2 changed, 0 destroyed.

## Live results (reference article, `c6426255…`)

| Criterion | Result | Evidence |
|---|---|---|
| Re-import of a text-only article returns a new version, keeping old annotations | ✅ | Stored with `previousVersionId` = `8bcdd17a…` (the prior text-only import) |
| Content root excludes page chrome | ✅ | No block contains "Copy link", "Related posts", or "Reading time" |
| Headings 10 / 21 / 38 (h2 / h3 / h4), in order | ✅ | Stored JSON; 21 h3 and 38 h4 rendered |
| 19 lists, ordered/unordered matching source | ✅ | 19 list blocks; 14 `<ol>` and 5 `<ul>` rendered |
| 13 code blocks with languages markdown ×6, javascript ×3, yaml ×2, json, bash | ✅ | Stored JSON, in source order; 13 `<pre>` rendered |
| One table: Stage / Traditional SDLC / AI-native SDLC, 6 rows | ✅ | Stored JSON and rendered `<table>` |
| 4 figures stored in `content/assets/`, 3 captions + 1 "Figure" fallback | ✅ | 4 PNG assets with intrinsic sizes 1400×538, 2048×1296, 2048×1638, 1400×637 |
| Figures keep their aspect ratio and are never wider than their intrinsic width | ✅ | At 1004 px, 2048×1296 rendered 820×519; at 375 px, all 4 rendered at 299 px wide with the correct ratio |
| "View original size" opens the image at its intrinsic size; Esc closes it and returns focus | ✅ | Dialog image 2048×1296; focus returned to the trigger |
| Table and code scroll inside their own containers at 375 px; no page overflow | ✅ (after #15) | Table and `<pre>` have `scrollWidth > clientWidth`; page `scrollWidth` 375 |
| Assets served with `nosniff` and immutable caching | ✅ | `curl -I`: `content-type: image/png`, `x-content-type-options: nosniff`, `cache-control: public, max-age=31536000, immutable` |
| Leading CSS-block label separated | ✅ | "Traditional An idea passes…" |

## Open

- **SVG CSP header on a stored SVG:** the reference article's diagrams are PNGs, so no SVG asset exists yet. The CloudFront behaviour and policy are deployed (the Terraform apply created `assets_svg`). Verify with `curl -I` on the first imported SVG.
- **churchofjesuschrist.org talk re-import:** covered by automated tests (the `talk.html` fixture: no nav or footnote text, 29 paragraphs byte-identical, `NEW_VERSION` on re-import). Not yet re-imported live.

## Follow-ups

- **CSS-aware block boundaries.** Layouts styled only with CSS (link-card grids, key/value grids) are imported as their text in source order, but grouping follows tags, not visual boxes. In the reference, the 15 link cards became one block. A general, CSS-driven approach was prototyped with jsdom computed styles and needs its own spec.
- **Hardcoded names in `deploy.yml`:** the distribution ID, Lambda name, and SPA bucket are hardcoded. They could come from `terraform output`, now that Terraform runs in the same job.
