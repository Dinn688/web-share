const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const archiver = require("archiver");

const rootDir = path.resolve(__dirname, "..");
const outputDir = path.join(rootDir, "output", "deploy-packages");
const stagingDir = path.join(outputDir, "staging");
const pkg = require(path.join(rootDir, "package.json"));
const version = pkg.version || "1.0.0";

const commonItems = [
  "server.js",
  "package.json",
  "package-lock.json",
  "public",
  "README.md",
  "产品介绍.md",
];

const platforms = [
  { id: "windows", archive: `linshare-${version}-windows.zip`, format: "zip" },
  { id: "linux", archive: `linshare-${version}-linux.tar.gz`, format: "tar" },
  { id: "macos", archive: `linshare-${version}-macos.tar.gz`, format: "tar" },
];

async function exists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function copyItem(source, target) {
  const stat = await fsp.stat(source);
  if (stat.isDirectory()) {
    await fsp.cp(source, target, { recursive: true });
  } else {
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.copyFile(source, target);
  }
}

async function preparePlatform(platform) {
  const packageName = `linshare-${version}-${platform.id}`;
  const packageDir = path.join(stagingDir, packageName);
  await fsp.rm(packageDir, { recursive: true, force: true });
  await fsp.mkdir(packageDir, { recursive: true });

  for (const item of commonItems) {
    const source = path.join(rootDir, item);
    if (await exists(source)) {
      await copyItem(source, path.join(packageDir, item));
    }
  }

  await copyItem(path.join(__dirname, platform.id), packageDir);

  const releaseText = [
    `name=${pkg.name || "linshare"}`,
    `version=${version}`,
    `platform=${platform.id}`,
    `builtAt=${new Date().toISOString()}`,
    "",
  ].join("\n");
  await fsp.writeFile(path.join(packageDir, "RELEASE.txt"), releaseText, "utf8");
  return { packageName, packageDir };
}

async function addDirectoryToArchive(archive, sourceDir, packageName) {
  const entries = await fsp.readdir(sourceDir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const fullPath = path.join(sourceDir, entry.name);
    const archiveName = path.posix.join(packageName, entry.name);

    if (entry.isDirectory()) {
      archive.append(null, { name: `${archiveName}/`, mode: 0o755 });
      await addDirectoryToArchive(archive, fullPath, archiveName);
      continue;
    }

    const executable = /\.(sh|command)$/i.test(entry.name);
    archive.file(fullPath, {
      name: archiveName,
      mode: executable ? 0o755 : 0o644,
    });
  }
}

async function createArchive(platform, packageName, packageDir) {
  const archivePath = path.join(outputDir, platform.archive);
  await fsp.rm(archivePath, { force: true });

  const output = fs.createWriteStream(archivePath);
  const archive =
    platform.format === "zip"
      ? archiver("zip", { zlib: { level: 9 } })
      : archiver("tar", { gzip: true, gzipOptions: { level: 9 } });

  const finished = new Promise((resolve, reject) => {
    output.on("close", resolve);
    output.on("error", reject);
    archive.on("error", reject);
  });

  archive.pipe(output);
  await addDirectoryToArchive(archive, packageDir, packageName);
  await archive.finalize();
  await finished;
  return archivePath;
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  await new Promise((resolve, reject) => {
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", resolve)
      .on("error", reject);
  });
  return hash.digest("hex");
}

async function main() {
  await fsp.mkdir(outputDir, { recursive: true });
  await fsp.rm(stagingDir, { recursive: true, force: true });
  await fsp.mkdir(stagingDir, { recursive: true });

  const results = [];
  for (const platform of platforms) {
    const prepared = await preparePlatform(platform);
    const archivePath = await createArchive(platform, prepared.packageName, prepared.packageDir);
    const stat = await fsp.stat(archivePath);
    results.push({
      platform: platform.id,
      file: archivePath,
      bytes: stat.size,
      sha256: await sha256(archivePath),
    });
  }

  const checksumText = results
    .map((item) => `${item.sha256}  ${path.basename(item.file)}`)
    .join("\n");
  await fsp.writeFile(path.join(outputDir, "SHA256SUMS.txt"), `${checksumText}\n`, "utf8");

  for (const item of results) {
    console.log(`${item.platform}: ${item.file} (${item.bytes} bytes)`);
  }
  console.log(`checksums: ${path.join(outputDir, "SHA256SUMS.txt")}`);
  await fsp.rm(stagingDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
