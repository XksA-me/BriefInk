# Building BriefInk For Intel Mac

This document records the reproducible build process used to create the Intel Mac (`x64`) BriefInk package.

## Build Host

The Intel build can be produced from an Apple Silicon Mac by cross-compiling the bundled `whisper.cpp` runtime for `x86_64`, then asking `electron-builder` to package the Electron app for `x64`.

Validated host:

- macOS
- Node.js 20
- Xcode Command Line Tools
- CMake
- Git

## Runtime Architecture

BriefInk looks for the local Whisper runtime by platform and process architecture:

```text
darwin-arm64  -> Apple Silicon
darwin-x64    -> Intel Mac
```

The runtime build script supports both targets:

```bash
npm run prepare:whisper-runtime:arm64
npm run prepare:whisper-runtime:x64
```

For Intel Mac, the script uses:

```bash
BRIEFINK_RUNTIME_ARCH=x64 node scripts/prepare-whisper-runtime.mjs
```

Internally this sets:

```text
CMAKE_OSX_ARCHITECTURES=x86_64
Runtime output: resources/runtimes/whisper/darwin-x64/
```

Generated runtime binaries are intentionally ignored by git:

```text
resources/runtimes/whisper/darwin-x64/bin/
resources/runtimes/whisper/darwin-x64/lib/
```

Only `README.txt` and `LICENSE.whisper.cpp` should be committed for the runtime directory.

## Build Commands

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run typecheck
npm test
```

Build Intel Mac DMG and zip:

```bash
npm run dist:mac:x64
```

The expected artifacts are:

```text
release/BriefInk-0.2.0-x64.dmg
release/BriefInk-0.2.0-x64.zip
```

If GitHub release asset downloads fail with `EOF` while electron-builder downloads Electron, rerun only the packaging step with a mirror:

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npx electron-builder --mac --x64
```

This was needed during the recorded local build because the default GitHub `release-assets.githubusercontent.com` download for `electron-v33.4.11-darwin-x64.zip` failed twice with `EOF`. The mirror build succeeded.

## Verification Commands

Check that the bundled runtime is Intel architecture:

```bash
file resources/runtimes/whisper/darwin-x64/bin/whisper-cli
```

Expected output includes:

```text
Mach-O 64-bit executable x86_64
```

Check release artifacts:

```bash
ls -lh release/BriefInk-*-x64.dmg release/BriefInk-*-x64.zip
```

Recorded output from the successful build:

```text
release/BriefInk-0.2.0-x64.dmg  110 MB
release/BriefInk-0.2.0-x64.zip  105 MB
```

Check packaged app architecture:

```bash
file release/mac/BriefInk.app/Contents/MacOS/BriefInk
```

Expected output includes:

```text
Mach-O 64-bit executable x86_64
```

## Notes

- The Intel package is separate from the Apple Silicon package.
- The x64 package currently includes both `darwin-x64` and `darwin-arm64` runtime folders because electron-builder copies `resources/runtimes`. At runtime BriefInk selects `darwin-x64` on Intel Mac through `process.arch`.
- A true universal package would require either a universal `whisper.cpp` runtime or both runtime trees bundled and selected correctly at runtime.
- The current x64 package is intended for Intel Mac users and should not be labeled as universal.
- Notarization requires valid Apple Developer credentials and is not performed automatically by this local build.
