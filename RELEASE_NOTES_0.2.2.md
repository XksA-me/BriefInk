# BriefInk v0.2.2

This release focuses on small usability polish and project/support visibility.

## What's Changed

- Refined dropdown/select UI across Models and Settings with a clearer arrow, hover state, focus state, and better right-side spacing.
- Added SiliconFlow as a supported third-party speech-to-text provider alongside OpenAI-compatible APIs.
- Improved model download visibility with live progress updates in the Models page.
- Added Support information in Settings:
  - Developer WeChat: `aibrief`
  - Email: `zjhbrief@163.com`
- Added open-source project information in Settings with a GitHub repository button.
- Added a manual update checker in Settings. It compares the current app version with the latest GitHub Release and prompts users to open the release page when an update is available.
- Kept separate Apple Silicon and Intel Mac release artifacts.

## Validation

- `npm run typecheck`
- `npm test`
- Built and verified Apple Silicon DMG/ZIP.
- Built and verified Intel Mac DMG/ZIP.
