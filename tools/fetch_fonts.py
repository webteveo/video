#!/usr/bin/env python3
"""Download the reels' typefaces (latin subset, variable woff2) from Google Fonts into assets/fonts.

Archivo (wdth 62–125, wght 100–900), Instrument Serif, JetBrains Mono, Big Shoulders and Big Shoulders
Stencil (opsz + wght) — all SIL Open Font License.
"""
import os, re, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DST = os.path.join(ROOT, 'assets/fonts')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
SPECS = [
    ('Archivo:ital,wdth,wght@0,62..125,100..900', 'Archivo'),
    ('Instrument+Serif:ital@0;1', 'InstrumentSerif'),
    ('JetBrains+Mono:wght@100..800', 'JetBrainsMono'),
    ('Big+Shoulders:opsz,wght@10..72,100..900', 'BigShoulders'),
    ('Big+Shoulders+Stencil:opsz,wght@10..72,100..900', 'BigShouldersStencil'),
]


def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA})).read()


os.makedirs(DST, exist_ok=True)
for spec, base in SPECS:
    css = fetch(f'https://fonts.googleapis.com/css2?family={spec}&display=swap').decode()
    for subset, body in re.findall(r'/\* (\S+) \*/\s*@font-face\s*{([^}]*)}', css):
        if subset != 'latin':
            continue
        style = re.search(r'font-style:\s*(\w+)', body).group(1)
        out = os.path.join(DST, f'{base}-{style}.woff2')
        if os.path.exists(out):
            continue
        data = fetch(re.search(r'url\(([^)]+)\)', body).group(1))
        open(out, 'wb').write(data)
        print('fetched', os.path.relpath(out, ROOT), len(data), 'bytes')
