#!/bin/zsh
set -euo pipefail
cd "${0:A:h}/../native"

if command -v clang++ >/dev/null 2>&1; then
  clang++ -std=c++20 -O3 amm_decode.cpp mpeg_audio.cpp -o amm_decode
elif command -v g++ >/dev/null 2>&1; then
  g++ -std=c++20 -O3 amm_decode.cpp mpeg_audio.cpp -o amm_decode
else
  echo "C++ compiler not found. Run: xcode-select --install" >&2
  exit 1
fi

chmod +x amm_decode
echo "Built $(pwd)/amm_decode for $(uname -m)"
