# Frontend rules

Scripts and layout live in the README:

@README.md

## Rules

- Before finishing, run `npm run format:check`, `npx tsc --noEmit -p .` and `npm test`. CI runs `prettier --check`, and
  one unformatted file once turned `main` red for hours.
- `npm run test:e2e` uses mock data. `npm run test:e2e:real` runs against a throw-away real backend
  (`E2E_CONVERTER=docling` to match the real app).
- `node_modules` is a link to `node_modules.nosync` (the repo sits on the Desktop, which iCloud syncs). After
  `npm install <package>`, run a bare `npm install` once.
