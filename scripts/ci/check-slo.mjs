#!/usr/bin/env node
const limits = {
  fixtureColdMs: 20_000,
  hibernateResumeMs: 3_000,
  firstTokenMs: 1_500,
  hmrMs: 500,
};
console.info("SLO targets", limits);
console.info("Measured in services/supervisor/src/slo.test.ts (provision < 20s).");
