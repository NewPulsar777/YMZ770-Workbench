# Windows standalone build

## Requirements

- Windows 10 or 11 (64-bit)
- Node.js 20 or newer
- Visual Studio 2022 Build Tools with `Desktop development with C++`

## Build

Open `Developer PowerShell for VS 2022` in the project folder and run:

```powershell
npm install
npm run dist:windows
```

The `dist` folder will contain both:

- `YMZ770-Workbench-1.0.0-x64-Portable.exe` - runs directly without installation
- `YMZ770-Workbench-1.0.0-x64-Setup.exe` - normal Windows installer

Either EXE can be distributed by itself. End users do not need Python, Node.js, a C++ compiler, or the Visual C++ Redistributable.

For development:

```powershell
npm run build:decoder:windows
npm run start:windows
```

The ROM stays on the local PC. The application binds its internal API to a random localhost port only.
