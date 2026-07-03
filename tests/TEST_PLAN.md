# BriefInk Test Plan

## Automated Coverage

- Settings persistence: default settings generation, deep updates, API key regeneration, cloned reads, and reload from disk.
- History persistence: prepend ordering, cloned reads, edit, delete, delete-many, clear, reload from disk, and 200-entry retention cap.
- Model state: default model switching, provider configuration, start/stop state, cloned reads, and unknown model errors.
- Provider fallback: default model selection when no model is requested, local model readiness guard, translation support behavior.
- Local API: Bearer auth rejection, `/v1/models`, multipart `/v1/audio/transcriptions`, and translation response fallback when a provider returns no translated text.

Run with:

```sh
npm test
npm run typecheck
```

## UI Smoke Plan

When a renderer is added, cover the first-pass Electron smoke path with Playwright or Electron's test harness:

- App launches and the preload API is available on `window.briefInk`.
- Snapshot renders without throwing when settings, model, history, and recording state are empty/default.
- Settings changes dispatch `settings:update` and reflect persisted values after relaunch.
- History clear/delete buttons dispatch the expected IPC calls and update the rendered list.
- History multi-select, edit, audio playback, and audio folder actions remain accessible with long history lists.
- Model start/stop/default controls dispatch the expected IPC calls and render updated statuses.
- Custom provider configuration opens as a centered dialog and persists Base URL, API key, model name, and timeout.
- Global recording HUD appears without focusing BriefInk and hides after completion/error.
- Local API start/stop controls update API enabled/running state and reveal auth/key state without exposing secrets in logs.

## Acceptance Notes

- Tests should not call real transcription or cloud APIs.
- Tests should use temporary files/ports and leave no persistent user data.
- UI tests should prefer mocked IPC for component behavior and one end-to-end Electron launch smoke for integration confidence.
