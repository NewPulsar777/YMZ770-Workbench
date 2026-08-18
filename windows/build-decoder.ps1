$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Native = Join-Path $Root "native"
$Output = Join-Path $Native "amm_decode.exe"

Push-Location $Native
try {
    if (Get-Command cl.exe -ErrorAction SilentlyContinue) {
        # /MT statically links the Visual C++ runtime so the packaged app does
        # not require a separate VC++ Redistributable installation.
        & cl.exe /nologo /std:c++20 /O2 /EHsc /MT amm_decode.cpp mpeg_audio.cpp /Fe:$Output
    } elseif (Get-Command clang++.exe -ErrorAction SilentlyContinue) {
        & clang++.exe -std=c++20 -O3 amm_decode.cpp mpeg_audio.cpp -o $Output
    } elseif (Get-Command g++.exe -ErrorAction SilentlyContinue) {
        & g++.exe -std=c++20 -O3 amm_decode.cpp mpeg_audio.cpp -o $Output
    } else {
        throw "C++ compiler not found. Install Visual Studio 2022 Build Tools with Desktop development with C++."
    }
    if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Output)) { throw "AMM decoder build failed." }
    Write-Host "Built $Output"
} finally {
    Pop-Location
}
