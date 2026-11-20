"""CPU-only Parakeet Redux HTTP worker for self-hosted OpenCut. Internal network only."""
import json
import os
from pathlib import Path
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import contextlib

MAX_UPLOAD_BYTES = 128 * 1024 * 1024
TOKEN = os.environ.get("PARAKEET_INTERNAL_TOKEN", "")
MODEL = "moondream/parakeet-redux"
_MODEL_LOCK = threading.Lock()
_ENGINE = None
_STACK = contextlib.ExitStack()


def model():
    global _ENGINE
    if _ENGINE is None:
        import moondream as md
        _ENGINE = _STACK.enter_context(md.photon(MODEL, device="cpu"))
    return _ENGINE


def serialize_result(result):
    output = []
    for segment in result.get("segments", []):
        words = segment.get("words") or []
        if words:
            for word in words:
                if not word.get("word"):
                    continue
                output.append({
                    "text": str(word.get("word", "")),
                    "start": float(word.get("start", 0)),
                    "end": float(word.get("end", word.get("start", 0))),
                })
        elif segment.get("text"):
            output.append({
                "text": str(segment["text"]),
                "start": float(segment.get("start", 0)),
                "end": float(segment.get("end", 0)),
            })
    return {
        "model": MODEL,
        "runtime": "cpu",
        "text": str(result.get("text", "")),
        "segments": output,
        "language": result.get("language") or "auto",
    }


class Handler(BaseHTTPRequestHandler):
    def json_response(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        return len(TOKEN) >= 16 and self.headers.get("x-parakeet-token") == TOKEN

    def do_GET(self):
        if self.path == "/health":
            self.json_response(200, {"available": True, "model": MODEL, "runtime": "cpu"})
        else:
            self.json_response(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/transcribe":
            return self.json_response(404, {"error": "Not found"})
        if not self.authorized():
            return self.json_response(401, {"error": "Not authorized"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.json_response(400, {"error": "Invalid content length"})
        if not 0 < size <= MAX_UPLOAD_BYTES:
            return self.json_response(413, {"error": "Audio must be 1..128 MiB"})
        with tempfile.TemporaryDirectory(prefix="parakeet-") as directory:
            filename = Path(directory) / "timeline.wav"
            with filename.open("wb") as handle:
                remaining = size
                while remaining:
                    chunk = self.rfile.read(min(65536, remaining))
                    if not chunk:
                        return self.json_response(400, {"error": "Incomplete upload"})
                    handle.write(chunk)
                    remaining -= len(chunk)
            try:
                with _MODEL_LOCK:
                    transcript = model().transcribe(audio=str(filename), timestamps="word")
                self.json_response(200, serialize_result(transcript))
            except Exception as exc:
                # No user media, token, stack trace or local path is returned to clients.
                print("Parakeet job failed:", type(exc).__name__, flush=True)
                self.json_response(503, {"error": "Parakeet model failed; check worker logs and weights"})


if __name__ == "__main__":
    if len(TOKEN) < 16:
        raise SystemExit("Configure PARAKEET_INTERNAL_TOKEN with at least 16 characters")
    try:
        ThreadingHTTPServer(("0.0.0.0", 8707), Handler).serve_forever()
    finally:
        _STACK.close()
