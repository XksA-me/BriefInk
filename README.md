# BriefInk

> 极简 macOS 语音转文字工具：选择模型，按下快捷键，说话，得到文字。

BriefInk 是一个轻量的 macOS 桌面应用，面向日常输入、开发者口述、短文本转写等高频场景。它内置本地 Whisper Large v3 Turbo Quantized 工作流，也支持自定义 OpenAI-compatible 语音转写 API。

[English](#english)

## 功能特性

- macOS 桌面应用，基于 Electron、React、TypeScript。
- 支持在任意 App 中使用全局快捷键开始 / 停止录音。
- 全局录音悬浮提示，录音、转写、错误状态都能在当前屏幕中下方看到。
- 录音结束后自动转写，并复制到剪贴板。
- 可选自动粘贴到当前输入框。
- 本地 Whisper Large v3 Turbo Quantized 模型下载、校验和运行。
- 自定义云端或兼容接口配置：Base URL、API Key、Model Name、Timeout。
- 识别语言和输出语言设置。
- 中英文界面语言，翻译文案集中在 `src/renderer/i18n.ts`，方便修改。
- 可选保存历史记录和音频文件。
- History 支持查看、复制、编辑、多选删除、清空、播放音频和打开音频目录。
- 本地 OpenAI-compatible API Server。
- 本地日志模块，方便定位录音、模型、API 和打包问题。

## 使用方式

1. 打开 BriefInk。
2. 在 Models 页面下载并启动默认本地模型。
3. 在 Settings 中确认麦克风、快捷键、自动复制 / 自动粘贴设置。
4. 把光标放到任意 App 的输入框。
5. 按快捷键开始录音，再按一次停止。
6. BriefInk 会自动转写，并按设置复制或粘贴文字。

默认快捷键是 `Option + Space`，可在 Settings 中点击快捷键按钮后直接按新的组合键，再确认保存。

## macOS 权限

BriefInk 完整使用需要以下权限：

- 麦克风：录制语音。
- 辅助功能：自动粘贴到其他 App。
- 自动化 / System Events：启用自动粘贴时发送 `Command + V`。

如果开发或测试时权限异常，可以重置：

```bash
tccutil reset Microphone ink.briefink.app
tccutil reset Accessibility ink.briefink.app
```

然后重新打开 BriefInk 并授权。

## 本地模型

当前第一版只保留一个推荐本地模型：

```text
Whisper Large v3 Turbo Quantized
```

BriefInk 会从 `ggerganov/whisper.cpp` 的 Hugging Face 仓库下载模型文件，并校验文件大小和 SHA-256。运行时基于 `whisper.cpp` 构建，本地运行文件不会提交到 git，会在打包时自动准备。

## 本地 API

BriefInk 可以开启本地 API Server，兼容 OpenAI 风格音频接口：

```http
POST /v1/audio/transcriptions
POST /v1/audio/translations
GET /v1/models
```

默认绑定 `127.0.0.1`，并要求 Bearer API Key。API Key 可在 Settings 页面查看。

## 开发

环境要求：

- macOS Apple Silicon
- Node.js 20+
- Xcode Command Line Tools
- CMake

安装依赖并启动开发模式：

```bash
npm install
npm run dev
```

类型检查和测试：

```bash
npm run typecheck
npm test
```

构建 macOS App：

```bash
npm run pack:mac
```

生成 DMG：

```bash
npm run dist:mac
```

产物会输出到 `release/`。

## 项目结构

```text
electron/                 Electron 主进程和 preload
src/main/                 模型、Provider、设置、历史、API、日志
src/renderer/             React 前端界面
src/renderer/i18n.ts      中英文界面文案
src/shared/               共享 TypeScript 类型
scripts/                  whisper.cpp 运行时准备脚本
resources/                权限、图标、运行时说明
tests/                    Vitest 测试
```

## 开源说明与致谢

BriefInk 是独立实现的开源项目，但受 macOS 语音输入生态中多个项目启发。

- [Beingpax/VoiceInk](https://github.com/Beingpax/VoiceInk)：BriefInk 的产品方向、轻量语音输入体验和本地 Large v3 Turbo 使用体验都受到 VoiceInk 启发。BriefInk 保持更窄、更轻量的范围。感谢 VoiceInk 项目。
- [ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp)：BriefInk 本地 Whisper 运行时参考和使用的核心开源项目。
- [ggerganov/whisper.cpp on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp)：BriefInk 默认下载的量化 Whisper 模型来源。
- [OpenAI Whisper](https://github.com/openai/whisper)：Whisper 模型家族来源。
- [Electron](https://www.electronjs.org/)、[React](https://react.dev/)、[Vite](https://vite.dev/)、[Vitest](https://vitest.dev/)：桌面应用、前端和测试基础设施。

如果你重新分发 BriefInk 或二次开发，请保留上游项目的许可证和模型来源说明。

## License

MIT

---

## English

BriefInk is a minimal macOS speech-to-text desktop app. It focuses on one workflow:

> choose a model, press a hotkey, speak, get text.

BriefInk can run a local Whisper Large v3 Turbo Quantized model through a bundled `whisper.cpp` runtime, or call a custom OpenAI-compatible audio transcription API.

## Features

- macOS desktop app built with Electron, React, and TypeScript.
- Global hotkey recording from any app.
- Global floating HUD for recording, transcribing, completion, and error states.
- Automatic transcription after recording stops.
- Copy result to clipboard and optionally paste into the frontmost app.
- Local Whisper Large v3 Turbo Quantized model download, SHA-256 verification, and runtime.
- Custom provider configuration with Base URL, API key, model name, and timeout.
- Recognition and output language settings.
- English and Simplified Chinese UI. Copy lives in `src/renderer/i18n.ts`.
- Optional local text history and audio saving.
- History view supports copy, edit, multi-select delete, clear, audio playback, and opening the audio folder.
- Local OpenAI-compatible API server.
- Local logs for debugging.

## Usage

1. Open BriefInk.
2. Download and start the default local model in Models.
3. Confirm microphone, shortcut, copy, and paste preferences in Settings.
4. Place your cursor in any app.
5. Press the shortcut to start recording, then press it again to stop.
6. BriefInk transcribes the audio and copies or pastes the result according to your settings.

The default shortcut is `Option + Space`. You can change it in Settings by clicking the shortcut button, pressing a new combination, and confirming it.

## Permissions

BriefInk needs these macOS permissions for the full workflow:

- Microphone: records speech.
- Accessibility: pastes text into the frontmost app.
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

BriefInk downloads the model file from the `ggerganov/whisper.cpp` Hugging Face repository and verifies the expected byte size and SHA-256 hash before use. Generated native runtime files are intentionally ignored by git and recreated during packaging.

## Local API

BriefInk can expose a local API server compatible with OpenAI-style audio endpoints:

```http
POST /v1/audio/transcriptions
POST /v1/audio/translations
GET /v1/models
```

By default the server binds to `127.0.0.1` and requires a bearer API key generated in Settings.

## Development

Requirements:

- macOS on Apple Silicon
- Node.js 20+
- Xcode Command Line Tools
- CMake

Run the app locally:

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

Build a DMG:

```bash
npm run dist:mac
```

Artifacts are written to `release/`.

## Project Structure

```text
electron/                 Electron main/preload processes
src/main/                 model, provider, settings, history, API, logging
src/renderer/             React app UI
src/renderer/i18n.ts      English and Simplified Chinese UI copy
src/shared/               shared TypeScript contracts
scripts/                  native runtime preparation
resources/                entitlements, icons, runtime license notes
tests/                    Vitest coverage
```

## Open Source Notes And Credits

BriefInk is an independent project, but it is inspired by prior work in the macOS speech-to-text space.

- [Beingpax/VoiceInk](https://github.com/Beingpax/VoiceInk): product inspiration for a fast macOS voice input workflow and the practical local Large v3 Turbo experience. BriefInk is intentionally lighter and narrower in scope. Thank you to the VoiceInk project.
- [ggerganov/whisper.cpp](https://github.com/ggerganov/whisper.cpp): local Whisper runtime referenced and used by BriefInk.
- [ggerganov/whisper.cpp on Hugging Face](https://huggingface.co/ggerganov/whisper.cpp): source for the quantized Whisper model file downloaded by BriefInk.
- [OpenAI Whisper](https://github.com/openai/whisper): original Whisper speech recognition model family.
- [Electron](https://www.electronjs.org/), [React](https://react.dev/), [Vite](https://vite.dev/), and [Vitest](https://vitest.dev/) power the desktop app and test workflow.

If you build on BriefInk, please preserve upstream license notices for `whisper.cpp` and any model files you redistribute.
