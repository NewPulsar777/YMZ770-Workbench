#!/bin/zsh
set -e
cd "${0:A:h}"
if [[ ! -x native/amm_decode || native/amm_decode.cpp -nt native/amm_decode ]]; then
  clang++ -std=c++20 -O3 native/amm_decode.cpp native/mpeg_audio.cpp -o native/amm_decode
fi
python3 server.py &
server_pid=$!
trap 'kill $server_pid 2>/dev/null' EXIT INT TERM
sleep 0.5
open http://127.0.0.1:8765/
wait $server_pid
