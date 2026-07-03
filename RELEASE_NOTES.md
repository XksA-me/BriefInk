# BriefInk v0.2.0

This release focuses on open-source readiness, interface polish, localization, and macOS workflow fixes.

## Highlights

- Refined Settings UI with denser spacing, more consistent controls, and cleaner section layout.
- Added full English / Simplified Chinese UI copy in `src/renderer/i18n.ts`.
- Added localized global HUD messages for recording, transcribing, completion, and errors.
- Added no-input-device handling for global hotkey recording so users see a visible error instead of silence.
- Improved macOS close behavior: the red close button hides the window, Dock activation reopens it, and Quit performs full cleanup.
- Replaced app icon and in-app brand mark with the provided BriefInk logo.
- Improved README with Chinese and English sections, usage instructions, development notes, and open-source credits.
- Credited VoiceInk, whisper.cpp, OpenAI Whisper, and the app framework projects.
- Added separate Intel Mac (`x64`) release artifacts and documented the build process in `BUILD_INTEL_MAC.md`.

## Validation

- TypeScript type-check passes.
- Unit tests pass.
- macOS DMG packaging was run for release artifacts.
