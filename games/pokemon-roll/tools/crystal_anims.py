#!/usr/bin/env python3
"""Builds the Pokémon Crystal front-sprite animations used by Pokémon Roll from the pret/pokecrystal disassembly.
Usage: python3 crystal_anims.py [--write]   (needs network access to raw.githubusercontent.com; --write patches index.html)
Per species (dex number used by the game's cards) it produces:
  n / s : a PNG strip of every animation frame (normal / shiny palette), frames stacked top to bottom, square, flood-filled transparent background
  w, f  : frame size in px and frame count
  box   : bounding box [x, y, w, h] of the first frame's visible pixels (the game's static sprite is exactly that crop)
  enter : [[frame, ms], ...]  the animation the game plays when a Pokémon enters battle (anim.asm)
  idle  : [[frame, ms], ...]  the idle loop it plays afterwards in menus (anim_idle.asm)
Original data: https://github.com/pret/pokecrystal (gfx/pokemon/<name>/front.png, anim.asm, anim_idle.asm, shiny.pal)."""
import base64, io, json, os, re, sys, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image

RAW = 'https://raw.githubusercontent.com/pret/pokecrystal/master/'
CACHE = '/tmp/pc_cache'
HTML = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
TICK_MS = 1000 / 59.7275          # one Game Boy frame

def get(path, binary=False):
    f = os.path.join(CACHE, path.replace('/', '__'))
    if os.path.exists(f):
        return open(f, 'rb').read() if binary else open(f).read()
    os.makedirs(CACHE, exist_ok=True)
    data = urllib.request.urlopen(RAW + path, timeout=60).read()
    open(f, 'wb').write(data)
    return data if binary else data.decode()

def dex_dirs():
    labels = re.findall(r'dw (\w+)Animation\b', get('gfx/pokemon/anim_pointers.asm'))
    inc = dict((m.group(1), m.group(2)) for m in re.finditer(r'(\w+)Animation:\s+INCLUDE "gfx/pokemon/(\w+)/anim.asm"', get('gfx/pokemon/anims.asm')))
    return {i + 1: inc[l] for i, l in enumerate(labels) if l in inc}

def run_script(text):
    cmds = []
    for line in text.splitlines():
        m = re.match(r'\s*(frame|setrepeat|dorepeat|endanim)\b\s*(.*)', line)
        if m: cmds.append((m.group(1), [int(x) for x in re.findall(r'\d+', m.group(2))]))
    out, pc, rep = [], 0, 0
    for _ in range(2000):
        if pc >= len(cmds): break
        c, a = cmds[pc]
        if c == 'endanim': break
        if c == 'frame': out.append([a[0], round(a[1] * TICK_MS)]); pc += 1
        elif c == 'setrepeat': rep = a[0]; pc += 1
        elif c == 'dorepeat':
            rep -= 1
            pc = a[0] if rep > 0 else pc + 1
    return out

def frames_of(png, shiny_rgb=None):
    im = Image.open(io.BytesIO(png)); pal = im.getpalette()[:12]; im = im.convert('RGB')
    w = im.width; n = im.height // w
    cols = [tuple(pal[i * 3:i * 3 + 3]) for i in range(4)]
    out = []
    for k in range(n):
        fr = im.crop((0, k * w, w, k * w + w)); px = fr.load()
        if shiny_rgb:
            for y in range(w):
                for x in range(w):
                    for ci in (1, 2):
                        if px[x, y] == cols[ci]: px[x, y] = shiny_rgb[ci - 1]
        # the background is the white that touches the border (white inside the Pokémon stays opaque)
        a = Image.new('L', (w, w), 255); ap = a.load(); stack = [(x, y) for x in range(w) for y in (0, w - 1)] + [(x, y) for y in range(w) for x in (0, w - 1)]
        seen = set()
        while stack:
            x, y = stack.pop()
            if (x, y) in seen or not (0 <= x < w and 0 <= y < w): continue
            seen.add((x, y))
            if px[x, y] != (255, 255, 255): continue
            ap[x, y] = 0; stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
        rgba = fr.convert('RGBA'); rgba.putalpha(a); out.append(rgba)
    return w, out

def strip(frames, w):
    sheet = Image.new('RGBA', (w, w * len(frames)))
    for i, f in enumerate(frames): sheet.paste(f, (0, i * w))
    cols = sorted({p for p in sheet.getdata() if p[3] > 0}); idx = {c: i + 1 for i, c in enumerate(cols)}   # index 0 = transparent
    out = Image.new('P', sheet.size, 0); out.putdata([idx.get(p, 0) for p in sheet.getdata()])
    out.putpalette([0, 0, 0] + [v for c in cols for v in c[:3]])
    bio = io.BytesIO(); out.save(bio, 'PNG', optimize=True, transparency=0, bits=3)
    return base64.b64encode(bio.getvalue()).decode()

def species_for_cards():
    s = open(HTML).read(); i = s.index('cardsPsv: `'); j = s.index('`', i + 12)
    return sorted({int(float(l.split('|')[1])) for l in s[i + 11:j].strip().split('\n') if '|' in l})

def build(dex, d):
    png = get(f'gfx/pokemon/{d}/front.png', True)
    try: shiny = [tuple(round(int(v) * 255 / 31) for v in re.findall(r'\d+', l)) for l in get(f'gfx/pokemon/{d}/shiny.pal').splitlines() if l.strip().startswith('RGB')]
    except Exception: shiny = None
    w, fr = frames_of(png); _, frs = frames_of(png, shiny) if shiny else (w, None)
    a0 = fr[0].getchannel('A').getbbox()
    enter = run_script(get(f'gfx/pokemon/{d}/anim.asm')); idle = run_script(get(f'gfx/pokemon/{d}/anim_idle.asm'))
    used = {f for f, _ in enter + idle}
    assert max(used) < len(fr), (dex, d, used, len(fr))
    return {'w': w, 'f': len(fr), 'box': [a0[0], a0[1], a0[2] - a0[0], a0[3] - a0[1]], 'enter': enter, 'idle': idle, 'n': strip(fr, w), 's': strip(frs, w) if frs else None}

def main():
    dirs = dex_dirs(); want = species_for_cards(); res = {}
    def one(dex):
        try: return dex, build(dex, dirs[dex])
        except Exception as e: return dex, repr(e)
    with ThreadPoolExecutor(8) as ex:
        for dex, r in ex.map(one, want):
            if isinstance(r, str): print('SKIP', dex, dirs.get(dex), r)
            else: res[str(dex)] = r
    print(len(res), 'species;', sum(len(v['n']) + len(v['s'] or '') for v in res.values()) // 1024, 'KB of PNG as base64')
    js = json.dumps(res, separators=(',', ':'))
    if '--write' in sys.argv:
        s = open(HTML).read(); a = '  anim: /*CRYSTAL-ANIM*/'; i = s.find(a)
        line = a + js + ',          // Pokémon Crystal front-sprite animations (generated by tools/crystal_anims.py from pret/pokecrystal): frame strips + the battle-entrance and idle sequences'
        if i >= 0: j = s.index('\n', i); s = s[:i] + line + s[j:]
        else: k = s.index('  art: {"1":'); s = s[:k] + line + '\n' + s[k:]
        # a species with no still picture in `art` (Mew) gets its first Crystal frame as the still picture
        k = s.index('  art: {"1":'); e = s.index('\n', k); art, end = json.JSONDecoder().raw_decode(s[k + 7:e])
        for dex, v in res.items():
            if dex not in art:
                pics = {}
                for key in ('n', 's'):
                    if not v[key]: continue
                    im = Image.open(io.BytesIO(base64.b64decode(v[key]))).convert('RGBA').crop((0, 0, v['w'], v['w'])); x, y, w, h = v['box']
                    bio = io.BytesIO(); im.crop((x, y, x + w, y + h)).save(bio, 'PNG', optimize=True); pics[key] = base64.b64encode(bio.getvalue()).decode()
                art[dex] = pics; v['box'] = v['box']
        s = s[:k + 7] + json.dumps(art, separators=(',', ':')) + s[k + 7 + end:]
        open(HTML, 'w').write(s); print('written to index.html')
    else: json.dump(res, open('/tmp/anim.json', 'w')); print('saved /tmp/anim.json')

if __name__ == '__main__': main()
