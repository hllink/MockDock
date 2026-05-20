#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const rootDir = path.resolve(import.meta.dirname, "..");
const packageFiles = [
  "package.json",
  "apps/server/package.json",
  "apps/web/package.json",
  "packages/shared/package.json",
  "packages/route-inference/package.json"
];
const versionConstantFiles = [
  "apps/server/src/app-version.ts",
  "apps/web/src/app/core/app-version.ts"
];

const command = process.argv[2] ?? "patch";
const explicitVersion = process.argv[3];

function bumpVersion(version, releaseType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version format: ${version}`);
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  const patch = Number(match[3]);

  switch (releaseType) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unsupported release type: ${releaseType}`);
  }
}

async function readPackageJson(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  const source = await fs.readFile(absolutePath, "utf8");
  return {
    absolutePath,
    json: JSON.parse(source)
  };
}

async function writePackageJson(absolutePath, json) {
  await fs.writeFile(absolutePath, `${JSON.stringify(json, null, 2)}\n`);
}

async function writeVersionConstant(relativePath, version) {
  const absolutePath = path.join(rootDir, relativePath);
  await fs.writeFile(absolutePath, `export const MOCKDOCK_VERSION = "${version}";\n`);
}

const rootPackage = await readPackageJson("package.json");
const currentVersion = rootPackage.json.version;

if (!currentVersion) {
  throw new Error("Root package.json must define a version.");
}

if (command === "current") {
  process.stdout.write(`${currentVersion}\n`);
  process.exit(0);
}

const nextVersion =
  command === "set"
    ? explicitVersion ?? (() => {
        throw new Error("Missing version. Usage: node scripts/version.mjs set <version>");
      })()
    : bumpVersion(currentVersion, command);

if (!/^\d+\.\d+\.\d+$/.test(nextVersion)) {
  throw new Error(`Invalid version: ${nextVersion}`);
}

for (const relativePath of packageFiles) {
  const pkg = await readPackageJson(relativePath);
  pkg.json.version = nextVersion;
  await writePackageJson(pkg.absolutePath, pkg.json);
}

for (const relativePath of versionConstantFiles) {
  await writeVersionConstant(relativePath, nextVersion);
}

process.stdout.write(`${nextVersion}\n`);
