"""Static dev server that disables browser caching, so edits show up on reload.

Usage: python serve.py [port]   (default 8000)
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    print(f"Serving on http://localhost:{port}")
    ThreadingHTTPServer(("", port), NoCacheHandler).serve_forever()
