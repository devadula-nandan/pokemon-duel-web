"""pokemon duel web: serves the UI and runs the original game's rule engine behind it.

    python play.py            ->  http://localhost:8765
    python play.py --lan      ->  also on this computer's network address, to open on a phone on the same Wi-Fi

The rules are not re-implemented: every legal move, spin, effect and AI move comes from libTFG.so, read at start-up
straight out of the original APK in this folder and executed under an ARM emulator (tools/tfg.py).
Needs:  pip install unicorn keystone-engine
"""
import glob, http.server, json, multiprocessing, os, queue, shutil, sys, tempfile, threading, webbrowser, zipfile

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT, ENGINES = 8765, 4


def engine_worker(conn, lib):
    """One emulated engine per process (separate processes run in parallel; threads in one process do not)."""
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    from tfg import TFG, EngineAbort
    eng = TFG(lib)
    while True:
        text = conn.recv()
        try:
            conn.send(eng.cmd(text))
        except EngineAbort as e:  # an aborted instance may be left inconsistent: start a fresh one
            conn.send(json.dumps({"error": str(e)}))
            eng = TFG(lib)


# The 7.0.16 APK ships two UI clicks (Sounds/Se/se001 and se002). Every other effect is a downloaded bank that is not in the package.
SFX_ASSETS = (
    "assets/bin/Data/87ef6dde43c2944508317396c9fe1fbe",
    "assets/bin/Data/772d7a1db667f4b5b9a59f08def032eb",
)


def load_sfx(apk):
    try:
        import UnityPy
    except ImportError:
        return {}
    z = zipfile.ZipFile(apk)
    folder = tempfile.mkdtemp(prefix="duel-sfx-")
    try:
        clips = _read_sfx(z, folder)
    except Exception as e:
        print("UI clicks were not loaded: %s" % e, flush=True)
        clips = {}
    shutil.rmtree(folder, ignore_errors=True)
    return clips


def _read_sfx(z, folder):
    out = {}
    for name in SFX_ASSETS:
        base = os.path.basename(name)
        for extra in ("", ".resource"):
            raw = z.read(name + extra)
            with open(os.path.join(folder, base + extra), "wb") as f:
                f.write(raw)
        import UnityPy
        for obj in UnityPy.load(os.path.join(folder, base)).objects:
            if obj.type.name != "AudioClip":
                continue
            for filename, wav in obj.read().samples.items():
                out["/sfx/" + filename] = wav
    return out


class Handler(http.server.SimpleHTTPRequestHandler):
    pool = None
    lib = None
    sfx = {}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=os.path.join(ROOT, "web"), **kw)

    def do_POST(self):
        if self.path != "/api/cmd":
            return self.send_error(404)
        body = self.rfile.read(int(self.headers.get("Content-Length", 0))).decode("utf-8")
        conn = self.pool.get()  # the engine is stateless per command, so any free instance will do
        try:
            conn.send(body.replace("\n", "").replace("\r", ""))
            data = conn.recv().encode("utf-8")
        finally:
            self.pool.put(conn)
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/libTFG.so" and Handler.lib:      # read from the APK at start-up, never written into web/
            self.send_response(200); self.send_header("Content-Type", "application/octet-stream"); self.send_header("Content-Length", str(len(Handler.lib)))
            self.end_headers(); self.wfile.write(Handler.lib); return
        wav = Handler.sfx.get(path)
        if wav is not None:
            self.send_response(200); self.send_header("Content-Type", "audio/wav"); self.send_header("Content-Length", str(len(wav)))
            self.end_headers(); self.wfile.write(wav); return
        super().do_GET()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        # the page may be served from elsewhere (for example a static host) while the engine runs on this machine
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apk = next(iter(args or glob.glob(os.path.join(ROOT, "*.apk"))), None)
    if not apk:
        sys.exit("Put the original APK next to play.py (or pass its path): the rule engine is loaded from it.")
    lib = zipfile.ZipFile(apk).read("lib/armeabi-v7a/libTFG.so")
    Handler.pool = queue.Queue()
    Handler.lib = lib
    Handler.sfx = load_sfx(apk)
    for _ in range(ENGINES):
        ours, theirs = multiprocessing.Pipe()
        multiprocessing.Process(target=engine_worker, args=(theirs, lib), daemon=True).start()
        Handler.pool.put(ours)
    srv = http.server.ThreadingHTTPServer(("0.0.0.0" if "--lan" in sys.argv else "127.0.0.1", PORT), Handler)
    print("pokemon duel web: http://localhost:%d   (rule engine from %s, UI clicks %s)" % (PORT, os.path.basename(apk), ", ".join(sorted(Handler.sfx)) or "unavailable"), flush=True)
    if "--no-browser" not in sys.argv:
        threading.Timer(1.5, webbrowser.open, ["http://localhost:%d" % PORT]).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
