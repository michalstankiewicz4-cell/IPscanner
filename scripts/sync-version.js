const fs = require("fs");
const path = require("path");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
}

function replaceOrThrow(content, regex, replacement, description) {
  const next = content.replace(regex, replacement);
  if (next === content) {
    throw new Error(`Could not update ${description}`);
  }
  return next;
}

const root = path.resolve(__dirname, "..");
const pkgPath = path.join(root, "package.json");
const cargoPath = path.join(root, "src-tauri", "Cargo.toml");
const tauriPath = path.join(root, "src-tauri", "tauri.conf.json");

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
tauri = replaceOrThrow(tauri, /"title"\s*:\s*"NetRecon IP Auditor v[^"]*"/, `"title": "NetRecon IP Auditor v${version}"`, "tauri.conf.json window title");
writeFile(tauriPath, tauri);

console.log(`Version synced to ${version}`);
