# Screen Recorder with Audio — Chrome Extension (MV3) — Mic-first variant

**What changed**
- This variant requests microphone permission *first* (immediately on the Start button click) to ensure the browser prompt appears reliably.
- If microphone permission is denied permanently, the extension shows instructions to open Chrome microphone settings.
- If microphone permission fails transiently, the user may choose to continue without the mic.

Everything else is the same as the original project.

**How to load for development**
1. Open `chrome://extensions` in Chrome/Edge.
2. Enable *Developer mode* (top-right).
3. Click **Load unpacked** and choose the `screen-recorder-extension-mic-first` folder.
4. Click the extension icon and use the popup to start/stop recording.