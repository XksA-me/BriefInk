# BriefInk

BriefInk is a minimal macOS speech-to-text desktop app. It focuses on one workflow:

> choose a model, press a hotkey, speak, get text.

BriefInk can run a local Whisper Large v3 Turbo quantized model through a bundled `whisper.cpp` runtime, or call a custom OpenAI-compatible audio transcription API.

## Features

- macOS desktop app built with Electron, React, and TypeScript
- Global hotkey recording from any app
- Floating global recording HUD near the bottom of the screen
- Automatic transcription after recording stops
- Copy result to clipboard and optionally paste into the frontmost app
- Local Whisper Large v3 Turbo Quantized model download and SHA-256 verification
- Custom provider configuration with Base URL, API key, model name, and timeout
- Recognition and output language settings
- Optional local history
- Optional audio saving with in-app playback
- Multi-select, edit, copy, and delete history records
- Local OpenAI-compatible API server
- Local logs for debugging

## Requirements

- macOS on Apple Silicon
- Node.js 20+
- Xcode Command Line Tools
- CMake

The packaging script builds a local `whisper.cpp` runtime automatically. If CMake is missing, install it with:

```bash
brew install cmake
```

## Development

```bash
npm install
npm run dev
```

Type-check and test:

```bash
npm run typecheck
npm test
```

Build a macOS app bundle:

```bash
npm run pack:mac
```

The generated app is written to:

```text
release/mac-arm64/BriefInk.app
```

## Permissions

BriefInk needs these macOS permissions for the full workflow:

- Microphone: records speech.
- Accessibility: pastes text into the frontmost app after transcription.
- Automation/System Events: sends the paste keystroke when auto-paste is enabled.

If permissions get stuck during development, reset them with:

```bash
tccutil reset Microphone ink.briefink.app
tccutil reset Accessibility ink.briefink.app
```

Then reopen BriefInk and grant permissions again.

## Local Model

The default local model is:

```text
Whisper Large v3 Turbo Quantized
```

BriefInk downloads the model file from the `ggerganov/whisper.cpp` Hugging Face repository and verifies the expected byte size and SHA-256 hash before use.

The bundled runtime is built from `whisper.cpp` by:

```bash
npm run prepare:whisper-runtime
```

Generated native runtime files are intentionally ignored by git. They are recreated during packaging.

## Local API

BriefInk can expose a local API server compatible with OpenAI-style audio endpoints:

```http
POST /v1/audio/transcriptions
POST /v1/audio/translations
GET /v1/models
```

By default the server binds to `127.0.0.1` and requires a bearer API key generated in Settings.

## Project Structure

```text
electron/                 Electron main/preload processes
src/main/                 model, provider, settings, history, API, logging
src/renderer/             React app UI
src/shared/               shared TypeScript contracts
scripts/                  native runtime preparation
resources/                entitlements and runtime license notes
tests/                    Vitest coverage
```

## Open Source Notes And Credits

BriefInk is an independent project, but it is inspired by prior work in the macOS speech-to-text space.

- [Beingpax/VoiceInk](https://github.com/Beingpax/VoiceInk): product inspiration for a fast macOS voice input workflow and the practical local Large v3 Turbo experience. BriefInk is intentionally lighter and narrower in scope.
- [ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp): local Whisper runtime used by BriefInk.
- [ggerganov/whisper.cpp on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp): source for the quantized Whisper model file downloaded by BriefInk.
- [OpenAI Whisper](https://github.com/openai/whisper): original Whisper speech recognition model family.
- [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Vite](https://vite.dev/), and [Vitest](https://vitest.dev/) power the desktop app and test workflow.

If you build on BriefInk, please preserve upstream license notices for `whisper.cpp` and any model files you redistribute.

## License

MIT
