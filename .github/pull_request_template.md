## Summary


## Type

- [ ] Documentation
- [ ] Pipeline code
- [ ] Astro/site code
- [ ] CI/build
- [ ] Editorial policy/config

## Checks

- [ ] `python -m compileall news_pipeline/news_pipeline`
- [ ] `news-pipeline audit-content`
- [ ] `news-pipeline audit-images`
- [ ] `npm run build`

## Safety notes

- [ ] Does not include secrets, cookies, or local runtime data
- [ ] Does not bypass editorial/manual-review gates
- [ ] Does not add protected third-party article bodies as fixtures
- [ ] Content/license boundary remains clear
