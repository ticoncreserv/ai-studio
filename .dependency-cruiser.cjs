/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-no-io-packages",
      comment: "packages/domain stays pure",
      severity: "error",
      from: { path: "^packages/domain" },
      to: { path: "^(node:fs|node:net|node:http|node:child_process)" },
    },
    {
      name: "contracts-does-not-import-domain",
      severity: "error",
      from: { path: "^packages/contracts" },
      to: { path: "^packages/domain" },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsPreCompilationDeps: true,
  },
};
