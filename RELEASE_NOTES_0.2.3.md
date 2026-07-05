# BriefInk v0.2.3

This release fixes the global recording HUD behavior in macOS fullscreen apps, especially Google Chrome fullscreen.

## What's Changed

- Changed the recording HUD to a macOS panel-style window.
- Re-applies fullscreen Space visibility before every HUD display.
- Raises the HUD to `screen-saver` level and moves it to the top when recording starts.
- Positions the HUD using display bounds instead of work area, which is more reliable in fullscreen Spaces.

## Validation

- `npm run typecheck`
- `npm test`
- Built Apple Silicon and Intel Mac packages for user testing.
