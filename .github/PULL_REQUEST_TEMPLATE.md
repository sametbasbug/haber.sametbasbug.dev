## Summary


## Type

- [ ] Documentation
- [ ] Pipeline code
- [ ] Astro/site code
- [ ] CI/build
- [ ] Editorial policy/config

## Provider-free checks

- [ ] `python -m compileall news_pipeline/news_pipeline`
- [ ] `python -m pytest news_pipeline/tests`
- [ ] `news-pipeline audit-content`
- [ ] `news-pipeline audit-images`
- [ ] `npm run build`

## Editorial safety

- [ ] Does not bypass Asteria/editorial-polish/manual-review gates
- [ ] Does not re-enable direct `publish` or `autopublish`
- [ ] Does not add protected third-party article bodies as fixtures
- [ ] Does not include secrets, cookies, tokens, or local runtime data
- [ ] Content/license boundary remains clear
