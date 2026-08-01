## Summary


## Type

- [ ] Documentation
- [ ] Pipeline code
- [ ] Astro/site code
- [ ] CI/build
- [ ] Editorial policy/config

## Provider-free checks

- [ ] `newsroom/.venv/bin/python -m pytest newsroom/tests`
- [ ] `npm run build`

## Editorial safety

- [ ] Does not write an editorial judgement into Python; judgement belongs in `newsroom/POLICY.md`
- [ ] Does not loosen a mechanical gate to accommodate a known bad publication
- [ ] Does not let `publish` push
- [ ] Does not add protected third-party article bodies as fixtures
- [ ] Does not include secrets, cookies, tokens, or local runtime data
- [ ] Content/license boundary remains clear
