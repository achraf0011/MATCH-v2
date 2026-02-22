#!/usr/bin/env python3
"""
bump-version.py — Madarik Version Bumper
=========================================
Usage:
    python bump-version.py <new_version>

Example:
    python bump-version.py 4

What it updates (atomically):
    1. js/version.js      → APP_VERSION = '<new_version>'
    2. sw.js              → CACHE_VERSION = 'madarik-v<new_version>'
    3. version.json       → { "version": "<new_version>" }
    4. All *.html files   → all ?v=<old> query strings → ?v=<new_version>

After running, commit everything and deploy.
"""

import sys
import re
import os
import json
import glob

# ─────────────────────────────────────
BASE = os.path.dirname(os.path.abspath(__file__))

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def write(path, content):
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'  ✅  {os.path.relpath(path, BASE)}')

# ─────────────────────────────────────
def current_version():
    """Read current APP_VERSION from js/version.js."""
    path = os.path.join(BASE, 'js', 'version.js')
    if not os.path.exists(path):
        return '1'
    m = re.search(r"APP_VERSION\s*=\s*'(\d+)'", read(path))
    return m.group(1) if m else '1'

# ─────────────────────────────────────
def bump(new_ver):
    old_ver = current_version()

    if old_ver == new_ver:
        print(f'Version is already {new_ver}. Nothing to do.')
        return

    print(f'\nBumping version: {old_ver} → {new_ver}\n')

    # 1. js/version.js
    vjs_path = os.path.join(BASE, 'js', 'version.js')
    vjs = read(vjs_path)
    vjs = re.sub(r"(APP_VERSION\s*=\s*)'([^']+)'", f"\\g<1>'{new_ver}'", vjs)
    write(vjs_path, vjs)

    # 2. sw.js
    sw_path = os.path.join(BASE, 'sw.js')
    sw = read(sw_path)
    sw = re.sub(r"(CACHE_VERSION\s*=\s*)'madarik-v[^']+'",
                f"\\g<1>'madarik-v{new_ver}'", sw)
    write(sw_path, sw)

    # 3. version.json
    vj_path = os.path.join(BASE, 'version.json')
    write(vj_path, json.dumps({"version": new_ver}, ensure_ascii=False) + '\n')

    # 4. All HTML files — replace every ?v=<old> with ?v=<new>
    # Matches both ?v=2 and ?v=2" and ?v=2' (in HTML attributes)
    html_files = glob.glob(os.path.join(BASE, '*.html'))
    html_count = 0
    for path in sorted(html_files):
        content = read(path)
        updated = re.sub(r'\?v=' + re.escape(old_ver) + r'(?=["\'])',
                         f'?v={new_ver}', content)
        if updated != content:
            write(path, updated)
            html_count += 1
        else:
            print(f'  ⏭   {os.path.relpath(path, BASE)} (no change)')

    print(f'\nDone. {html_count} HTML file(s) updated.')
    print(f'\nNext steps:')
    print(f'  git add -A')
    print(f'  git commit -m "chore: bump version to v{new_ver}"')
    print(f'  <deploy>')

# ─────────────────────────────────────
if __name__ == '__main__':
    if len(sys.argv) != 2:
        script = os.path.basename(__file__)
        print(f'Usage: python {script} <new_version>')
        print(f'  e.g.  python {script} 4')
        sys.exit(1)
    new_ver = sys.argv[1].strip()
    if not re.match(r'^\d+(\.\d+)*$', new_ver):
        print(f'Error: version must be numeric (e.g. 3, 4, 3.1)')
        sys.exit(1)
    bump(new_ver)
