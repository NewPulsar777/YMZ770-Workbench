#!/usr/bin/env python3
"""Local-only YMZ770B/770C web server and AMM decoding API."""
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import json, os, subprocess, tempfile

ROOT = Path(__file__).resolve().parent
ROM = None
SWAP16 = False
DECODER = ROOT / "native" / "amm_decode"

def playable_phrases(data, swap16=False):
    """Return phrase numbers whose table entry points inside this ROM."""
    view = bytearray(data)
    if swap16:
        for i in range(0, len(view) - 1, 2):
            view[i], view[i + 1] = view[i + 1], view[i]
    found = []
    for phrase in range(min(256, len(view) // 4)):
        h = phrase * 4
        offset = ((view[h] & 1) << 24) | (view[h + 1] << 16) | (view[h + 2] << 8) | view[h + 3]
        reserved_bits_are_zero = (view[h] & 0x0e) == 0
        if view[h:h + 4] != b"\xff\xff\xff\xff" and reserved_bits_are_zero and 0 < offset < len(view):
            found.append(phrase)
    return found

def validated_playable_phrases(data, swap16=False):
    """Probe each unique table pointer and return only phrases containing AMM data."""
    candidates = playable_phrases(data, swap16)
    view = bytearray(data)
    if swap16:
        for i in range(0, len(view) - 1, 2):
            view[i], view[i + 1] = view[i + 1], view[i]
    groups = {}
    for phrase in candidates:
        h = phrase * 4
        offset = ((view[h] & 1) << 24) | (view[h + 1] << 16) | (view[h + 2] << 8) | view[h + 3]
        groups.setdefault(offset, []).append(phrase)
    playable = []
    with tempfile.TemporaryDirectory(prefix="ymz770-probe-") as d:
        rp = Path(d) / "rom.bin"; rp.write_bytes(data)
        for phrases in groups.values():
            cmd = [str(DECODER), str(rp), str(phrases[0]), str(Path(d) / "unused.wav"), "--probe"]
            if swap16: cmd.append("--swap16")
            try:
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            except subprocess.TimeoutExpired:
                continue
            if result.returncode == 0:
                playable.extend(phrases)
    return sorted(playable), len(candidates), len(groups)

class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def _json(self, status, obj):
        data=json.dumps(obj).encode(); self.send_response(status); self.send_header("Content-Type","application/json")
        self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)
    def do_POST(self):
        global ROM, SWAP16
        if self.path != "/api/rom": return self._json(404,{"error":"not found"})
        size=int(self.headers.get("Content-Length","0"));
        if size<=0 or size>64*1024*1024: return self._json(400,{"error":"ROM must be 1–64 MiB"})
        ROM=self.rfile.read(size); SWAP16=self.headers.get("X-Swap16") == "1"
        playable,candidate_count,unique_count=validated_playable_phrases(ROM,SWAP16)
        return self._json(200,{"bytes":len(ROM),"swap16":SWAP16,"phrases":playable,
                              "tableCandidates":candidate_count,"uniquePointers":unique_count,
                              "unusedPhrases":candidate_count-len(playable)})
    def do_GET(self):
        if not self.path.startswith("/api/phrase"):
            return super().do_GET()
        if ROM is None: return self._json(409,{"error":"load a ROM first"})
        try: phrase=int(parse_qs(urlparse(self.path).query).get("n",["0"])[0]); assert 0<=phrase<=255
        except: return self._json(400,{"error":"invalid phrase"})
        with tempfile.TemporaryDirectory(prefix="ymz770b-") as d:
            rp=Path(d)/"rom.bin"; wp=Path(d)/"phrase.wav"; rp.write_bytes(ROM)
            cmd=[str(DECODER),str(rp),str(phrase),str(wp)]+(["--swap16"] if SWAP16 else [])
            result=subprocess.run(cmd,capture_output=True,text=True,timeout=30)
            if result.returncode or not wp.exists(): return self._json(422,{"error":result.stderr.strip() or "decode failed"})
            data=wp.read_bytes(); self.send_response(200); self.send_header("Content-Type","audio/wav")
            self.send_header("X-AMMSL-Meta",result.stdout.strip()); self.send_header("Content-Length",str(len(data))); self.end_headers(); self.wfile.write(data)

if __name__ == "__main__":
    os.chdir(ROOT); print("YMZ770B/C AMM Workbench: http://127.0.0.1:8765")
    ThreadingHTTPServer(("127.0.0.1",8765),Handler).serve_forever()
