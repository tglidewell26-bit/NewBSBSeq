# BSB Sequence Generator V2 browser tests

Run the stale-approval recovery browser suite with one command:

```sh
pnpm --filter @workspace/bsb-sequence-generator-v2 run test:e2e
```

The command starts a local Vite server and runs the tests in headless Chromium. All `/api/**` requests used by the suite are intercepted and answered with synthetic fixtures; no live API server, model call, or production write is involved. Replit's Chromium is used by default. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` only when running outside Replit with Chromium installed elsewhere.