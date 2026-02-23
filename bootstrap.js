"use strict";

const path = require("path");
const { spawnSync } = require("child_process");

function fail(message) {
  console.error(`[bootstrap] ${message}`);
  process.exit(1);
}

const targetScript = String(process.env.TARGET_SCRIPT || "").trim();
if (!targetScript) {
  fail("TARGET_SCRIPT is required");
}

const bootCheckPath = path.resolve(__dirname, "boot-check.js");
const check = spawnSync(process.execPath, [bootCheckPath], {
  cwd: __dirname,
  env: process.env,
  stdio: "inherit",
  windowsHide: true,
});

if (check.status !== 0) {
  process.exit(check.status || 1);
}

const resolvedTarget = path.resolve(__dirname, targetScript);
require(resolvedTarget);
