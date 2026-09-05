#!/usr/bin/env python3
"""Rewrites every local-script `?v=N` cache-buster across all dashboard
HTML files to a single shared, current timestamp.

Why this exists: every dashboard loads several shared/local JS files with a
manually-incremented `?v=N` query string, so that editing a .js file forces
browsers to re-fetch it instead of serving a stale cached copy (a plain
<script src="foo.js"> with no query string can get stuck in the browser's
disk cache indefinitely -- this bit us repeatedly during development,
looking exactly like a real app bug). Keeping N different numbers in sync
by hand across 4 HTML files was itself the actual bug generator.

Run this once after editing any shared/js/*.js, shared/admin/app.js, or any
per-dashboard app.js/*.js file, before testing in a browser:

    python Frontend/bump_cache.py

It only touches query strings on *local* script paths -- CDN scripts
(https://...) and CSS links are left untouched.
"""
import re
import time
from pathlib import Path

FRONTEND_DIR = Path(__file__).resolve().parent
HTML_FILES = list(FRONTEND_DIR.glob("*.html")) + list(FRONTEND_DIR.glob("*/index.html"))

# Matches <script src="path/to/local/file.js?v=123"> -- never a CDN URL,
# since those don't carry our own ?v= cache-buster.
LOCAL_SCRIPT_VERSION = re.compile(r'(<script\s+src="(?!https?://)[^"]+?\.js)\?v=\d+(")')


def main():
    version = int(time.time())
    total = 0
    for path in HTML_FILES:
        text = path.read_text(encoding="utf-8")
        new_text, count = LOCAL_SCRIPT_VERSION.subn(rf"\1?v={version}\2", text)
        if count:
            path.write_text(new_text, encoding="utf-8")
            print(f"{path.relative_to(FRONTEND_DIR)}: bumped {count} script tag(s)")
            total += count
    print(f"\nDone -- {total} script tag(s) now at ?v={version}")


if __name__ == "__main__":
    main()
