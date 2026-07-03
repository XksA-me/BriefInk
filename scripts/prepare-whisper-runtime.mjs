import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const version = "v1.9.1";
const requestedRuntimeArch = process.env.BRIEFINK_RUNTIME_ARCH ?? process.arch;
const runtimeArch = normalizeRuntimeArch(requestedRuntimeArch);
const runtimePlatform = `darwin-${runtimeArch}`;
const cmakeArch = runtimeArch === "x64" ? "x86_64" : "arm64";
const runtimeDir = join(root, "resources", "runtimes", "whisper", runtimePlatform);
const binDir = join(runtimeDir, "bin");
const libDir = join(runtimeDir, "lib");
const sourceDir = join(root, ".cache", `whisper.cpp-${version}`);
const buildDir = join(sourceDir, `build-${runtimePlatform}`);
const executable = join(binDir, "whisper-cli");

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, {
    cwd: options.cwd ?? root,
    stdio: options.stdio ?? "inherit",
    encoding: "utf8",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${bin} ${args.join(" ")} failed with exit code ${result.status}`);
  }
  return result.stdout?.trim() ?? "";
}

function maybeRun(bin, args) {
  const result = spawnSync(bin, args, { encoding: "utf8", stdio: "pipe" });
  return result.status === 0 ? result.stdout.trim() : "";
}

function addRpath(file, rpath) {
  const listing = maybeRun("otool", ["-l", file]);
  if (listing.includes(`path ${rpath} `)) return;
  run("install_name_tool", ["-add_rpath", rpath, file]);
}

function signAdHoc(file) {
  run("codesign", ["--force", "--sign", "-", file], { stdio: "ignore" });
}

function ensureTool(bin, formula) {
  if (maybeRun("which", [bin])) return;
  if (!maybeRun("which", ["brew"])) {
    throw new Error(`${bin} is required to prepare the bundled runtime. Install ${formula} or run the packaged build on a prepared macOS builder.`);
  }
  run("brew", ["install", formula]);
}

function copyRuntimeFile(source, destination) {
  rmSync(destination, { force: true });
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) {
    symlinkSync(readlinkSync(source), destination);
    return;
  }
  copyFileSync(source, destination);
}

function normalizeRuntimeArch(arch) {
  if (arch === "x64" || arch === "x86_64" || arch === "amd64") return "x64";
  if (arch === "arm64" || arch === "aarch64") return "arm64";
  throw new Error(`Unsupported BriefInk runtime architecture: ${arch}. Use arm64 or x64.`);
}

if (process.platform !== "darwin") {
  console.log(`Skipping bundled whisper runtime for ${process.platform}-${process.arch}.`);
  process.exit(0);
}

ensureTool("cmake", "cmake");
ensureTool("git", "git");

if (!existsSync(sourceDir)) {
  mkdirSync(dirname(sourceDir), { recursive: true });
  run("git", ["clone", "--depth", "1", "--branch", version, "https://github.com/ggerganov/whisper.cpp.git", sourceDir]);
}

run("cmake", [
  "-S",
  sourceDir,
  "-B",
  buildDir,
  "-DCMAKE_BUILD_TYPE=Release",
  `-DCMAKE_OSX_ARCHITECTURES=${cmakeArch}`,
  "-DGGML_METAL=ON",
  "-DGGML_BLAS=ON",
  "-DGGML_BLAS_VENDOR=Apple",
  "-DGGML_BACKEND_DL=OFF",
  "-DGGML_NATIVE=OFF",
  "-DWHISPER_BUILD_TESTS=OFF",
  "-DWHISPER_BUILD_EXAMPLES=ON"
]);
run("cmake", ["--build", buildDir, "--target", "whisper-cli", `-j${Math.max(1, Number(run("sysctl", ["-n", "hw.ncpu"], { stdio: "pipe" })) || 4)}`]);

rmSync(runtimeDir, { recursive: true, force: true });
mkdirSync(binDir, { recursive: true });
mkdirSync(libDir, { recursive: true });

const buildBinDir = join(buildDir, "bin");
copyRuntimeFile(join(buildBinDir, "whisper-cli"), executable);
chmodSync(executable, 0o755);

for (const entry of readdirSync(buildBinDir)) {
  if (!entry.endsWith(".dylib")) continue;
  copyRuntimeFile(join(buildBinDir, entry), join(libDir, entry));
}

addRpath(executable, "@executable_path/../lib");
signAdHoc(executable);
for (const entry of readdirSync(libDir)) {
  if (!entry.endsWith(".dylib")) continue;
  const file = join(libDir, entry);
  if (!lstatSync(file).isSymbolicLink()) signAdHoc(file);
}

copyFileSync(join(sourceDir, "LICENSE"), join(runtimeDir, "LICENSE.whisper.cpp"));
writeFileSync(
  join(runtimeDir, "README.txt"),
  [
    "BriefInk bundled whisper runtime",
    "",
    `Source: https://github.com/ggerganov/whisper.cpp/tree/${version}`,
    "License: MIT, see LICENSE.whisper.cpp",
    `Binary: whisper-cli for macOS ${runtimeArch} with Metal, Accelerate, and CPU support bundled as local dylibs.`,
    ""
  ].join("\n"),
  "utf8"
);

console.log(`Prepared bundled whisper runtime at ${executable}`);
