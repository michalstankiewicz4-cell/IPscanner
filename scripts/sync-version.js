const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceOrThrow(content, regex, replacement, description) {
  // Checks that the pattern was actually found, not that the replacement
  // changed anything - if the target is already in sync (e.g. re-running
  // after nothing changed), replacing a value with itself is correct
  // behavior, not a failure to find the pattern.
  if (!regex.test(content)) {
    throw new Error(`Could not find ${description}`);
  }
  return content.replace(regex, replacement);
}

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");
const nsisPath = path.join(root, "src-tauri", "nsis", "installer-template.nsi");

const pkg = readJson(pkgPath);
const version = String(pkg.version || "").trim();
if (!version) {
  throw new Error("package.json version is empty");
}

let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = replaceOrThrow(cargo, /version\s*=\s*"[^"]*"/, `version = "${version}"`, "Cargo.toml version");
writeFile(cargoPath, cargo);

let tauri = fs.readFileSync(tauriPath, "utf8");
tauri = replaceOrThrow(tauri, /"version"\s*:\s*"[^"]*"/, `"version": "${version}"`, "tauri.conf.json version");
// Matches the product name text before " v<version>" generically, instead of
// a hardcoded product name string - so renaming the app (productName/title)
// doesn't silently break this script again like it did when the app was
// renamed from "NetRecon IP Auditor" to "OSINT NET Auditor".
tauri = replaceOrThrow(tauri, /("title"\s*:\s*")([^"]*?)\s+v[^"]*(")/, `$1$2 v${version}$3`, "tauri.conf.json window title");
writeFile(tauriPath, tauri);

// The NSIS installer template has its own, separately-defined VERSION -
// nothing else keeps this in sync, and it silently drifted stale before
// (still said "1.6.5" while the app had moved on to 1.7.0).
let nsis = fs.readFileSync(nsisPath, "utf8");
nsis = replaceOrThrow(nsis, /!define VERSION "[^"]*"/, `!define VERSION "${version}"`, "installer-template.nsi VERSION");
nsis = replaceOrThrow(nsis, /!define VERSIONWITHBUILD "[^"]*"/, `!define VERSIONWITHBUILD "${version}.0"`, "installer-template.nsi VERSIONWITHBUILD");
writeFile(nsisPath, nsis);

console.log(`Version synced to ${version}`);
