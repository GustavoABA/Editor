"""CPU-only Parakeet Redux HTTP worker for self-hosted OpenCut. Internal network only."""
import json
import os
from pathlib import Path
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import contextlib
import platform
import hmac

MAX_UPLOAD_BYTES = 128 * 1024 * 1024
TOKEN = os.environ.get("PARAKEET_INTERNAL_TOKEN", "")
MODEL = "moondream/parakeet-redux"
_MODEL_LOCK = threading.Lock()
_ENGINE = None
_WHISPER = None
_PHOTON_FAILED = False
_STACK = contextlib.ExitStack()


def model():
    global _ENGINE
    if _ENGINE is None:
        import moondream as md
        _ENGINE = _STACK.enter_context(md.photon(MODEL, device="cpu"))
    return _ENGINE


def photon_cpu_supported():
    # Conservatively avoid unsupported native instructions on older x86 hosts.
    if platform.machine().lower() in ("x86_64", "amd64"):
        try:
            flags = Path("/proc/cpuinfo").read_text().lower()
            return "avx512_vnni" in flags or "avx512vnni" in flags
        except OSError:
            return False
    return platform.machine().lower() in ("aarch64", "arm64")


def whisper_transcribe(filename, language):
    global _WHISPER
    if _WHISPER is None:
        from faster_whisper import WhisperModel
        _WHISPER = WhisperModel(os.environ.get("WHISPER_MODEL", "base"),
                                device="cpu", compute_type="int8")
    segments, info = _WHISPER.transcribe(str(filename), language=language,
                                         beam_size=1, word_timestamps=True)
    result = {"text": "", "language": info.language, "segments": []}
    texts = []
    for segment in segments:
        texts.append(segment.text)
        result["segments"].append({
            "text": segment.text, "start": segment.start, "end": segment.end,
            "words": [{"word": w.word, "start": w.start, "end": w.end}
                      for w in (segment.words or [])],
        })
    result["text"] = " ".join(texts)
    payload = serialize_result(result)
    payload["model"] = "faster-whisper/" + os.environ.get("WHISPER_MODEL", "base")
    return payload


def transcribe_audio(filename, engine, language):
    global _PHOTON_FAILED
    if engine != "whisper" and not _PHOTON_FAILED and photon_cpu_supported():
        try:
            return serialize_result(model().transcribe(audio=str(filename), timestamps="word"))
        except Exception as exc:
            _PHOTON_FAILED = True
            print("Parakeet initialization/inference failed; using CPU Whisper:", type(exc).__name__, flush=True)
    elif engine != "whisper":
        print("Photon CPU path unavailable; using CPU Whisper", flush=True)
    return whisper_transcribe(filename, language)


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
        return len(TOKEN) >= 16 and hmac.compare_digest(self.headers.get("x-parakeet-token", "").encode(), TOKEN.encode())

    def do_GET(self):
        if self.path == "/health":
            self.json_response(200, {"available": True, "model": MODEL, "runtime": "cpu", "photonCpuSupported": photon_cpu_supported() and not _PHOTON_FAILED, "modelLoaded": _ENGINE is not None or _WHISPER is not None})
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
                    engine = self.headers.get("x-transcription-engine", "parakeet")
                    language = self.headers.get("x-transcription-language", "auto")
                    if language == "auto" or not language.isalpha() or len(language) > 3:
                        language = None
                    payload = transcribe_audio(filename, engine, language)
                self.json_response(200, payload)
            except Exception as exc:
                # No user media, token, stack trace or local path is returned to clients.
                print("Parakeet job failed:", type(exc).__name__, flush=True)
                self.json_response(503, {"error": "CPU transcription failed; check worker logs and model cache"})


if __name__ == "__main__":
    if len(TOKEN) < 16:
        raise SystemExit("Configure PARAKEET_INTERNAL_TOKEN with at least 16 characters")
    try:
        ThreadingHTTPServer(("0.0.0.0", 8707), Handler).serve_forever()
    finally:
        _STACK.close()
