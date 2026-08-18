# macOS standalone build

## Requirements

- macOS 12 or newer
- Node.js 20 or newer
- Xcode Command Line Tools (`xcode-select --install`)

## Build for the current Mac

Open Terminal in the project folder and run:

```zsh
npm install
npm run dist:macos
```

The `dist` folder will contain:

- `YMZ770-Workbench-1.0.0-arm64.dmg` on Apple Silicon Macs
- `YMZ770-Workbench-1.0.0-arm64.zip` containing the `.app`

On an Intel Mac, `arm64` is replaced by `x64`. Distribute either the DMG or ZIP; users do not need Python, Node.js, or a C++ compiler.

## Development

```zsh
npm run build:decoder:macos
npm run start:macos
```

## Gatekeeper

The locally built application is not Apple-notarized. On another Mac, Gatekeeper may block the first launch. For public distribution without warnings, configure an Apple Developer ID certificate and notarization credentials before building.
