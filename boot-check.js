"use strict";

const fs = require("fs");
const path = require("path");
const net = require("net");

function fail(code, message) {
  console.error(`${code}: ${message}`);
  process.exit(1);
}

function getEnv(name, fallback = "") {
  return String(process.env[name] ?? fallback).trim();
}

function parsePort(raw, allowZero) {
  if (raw === "") return { ok: false, reason: "missing" };
  if (!/^\d+$/.test(raw)) return { ok: false, reason: "not_integer" };
  const port = Number.parseInt(raw, 10);
  if (!Number.isInteger(port)) return { ok: false, reason: "not_integer" };
  if (allowZero && port === 0) return { ok: true, port };
  if (port < 1 || port > 65535) return { ok: false, reason: "out_of_range" };
  return { ok: true, port };
}

function loadRegistry(registryPath) {
  if (!fs.existsSync(registryPath)) {
    fail("BOOT_CHECK_ERR_REGISTRY_NOT_FOUND", `registry file not found: ${registryPath}`);
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(registryPath, "utf8"));
  } catch (err) {
    fail("BOOT_CHECK_ERR_REGISTRY_INVALID", `registry parse error: ${err.message}`);
  }
  if (!data || typeof data !== "object" || !data.services || typeof data.services !== "object") {
    fail("BOOT_CHECK_ERR_REGISTRY_INVALID", "registry must contain object field: services");
  }
  return data.services;
}

function checkPortAvailability(port, host) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", (err) => {
      if (err && err.code === "EADDRINUSE") {
        resolve({ ok: false, reason: "in_use" });
        return;
      }
      resolve({ ok: false, reason: err?.code || err?.message || "unknown_error" });
    });
    tester.once("listening", () => {
      tester.close(() => resolve({ ok: true }));
    });
    tester.listen(port, host);
  });
}

async function main() {
  const serviceName = getEnv("SERVICE_NAME");
  if (!serviceName) {
    fail("BOOT_CHECK_ERR_SERVICE_NAME_MISSING", "SERVICE_NAME is required");
  }

  const registryPath = path.resolve(
    process.cwd(),
    getEnv("SERVICE_REGISTRY_PATH", "./SERVICE_REGISTRY.json"),
  );
  const services = loadRegistry(registryPath);
  const config = services[serviceName];
  if (!config || typeof config !== "object") {
    fail("BOOT_CHECK_ERR_SERVICE_NOT_REGISTERED", `service not found in registry: ${serviceName}`);
  }

  const skipPortCheck = Boolean(config.skipPortCheck === true);
  const parsedPort = parsePort(getEnv("PORT"), skipPortCheck);
  if (!parsedPort.ok) {
    if (parsedPort.reason === "missing") {
      fail("BOOT_CHECK_ERR_MISSING_PORT", "PORT is required");
    }
    fail("BOOT_CHECK_ERR_INVALID_PORT", `PORT invalid: ${parsedPort.reason}`);
  }
  const port = parsedPort.port;

  const registryPort = Number(config.port);
  if (!Number.isInteger(registryPort)) {
    fail("BOOT_CHECK_ERR_REGISTRY_INVALID", `registry port invalid for service: ${serviceName}`);
  }
  if (registryPort !== port) {
    fail(
      "BOOT_CHECK_ERR_PORT_MISMATCH",
      `env PORT(${port}) does not match registry port(${registryPort})`,
    );
  }

  if (!skipPortCheck) {
    const host = String(config.host || "127.0.0.1");
    const available = await checkPortAvailability(port, host);
    if (!available.ok) {
      fail("BOOT_CHECK_ERR_PORT_IN_USE", `port ${port} is not available on ${host}`);
    }
  }

  console.log(`boot-check ok | service=${serviceName} port=${port}`);
}

main().catch((err) => {
  fail("BOOT_CHECK_ERR_UNKNOWN", err?.message || "unexpected error");
});

