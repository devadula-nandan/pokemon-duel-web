"""Builds web/sprites/: one animated WebP per figure picture, hosted with the page instead of hot-linked from PokeAPI's sprite repository.

Source per figure, best first (all from https://github.com/PokeAPI/sprites):
  1. Pokémon Champions animated model  sprites/pokemon/versions/generation-ix/champions/[shiny/]<id>.webp   (has the Megas)
  2. Scarlet / Violet animated model   sprites/pokemon/versions/generation-ix/scarlet-violet/[shiny/]<id>.webp
  3. Showdown animated sprite          sprites/pokemon/other/showdown/[shiny/]<id>.gif
<id> is the figure's PokeAPI pokemon id: its form / Mega / Alolan id from web/art.js FIG_ART, else its National Dex number.

Every sprite is normalised: all frames are cropped to the union of their opaque pixels, scaled so the longest side fills the box, and stood
bottom-centre on a SIZE x SIZE transparent square, so no figure looks too big or too small next to another. Frames keep their timing.
Downloads are cached in tools/.sprite-cache (not committed). Writes web/sprites/<key>.webp and web/sprites.js (figure name -> key).

    python tools/build_sprites.py
"""
import concurrent.futures as cf, io, json, os, re, sys, urllib.request
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB, CACHE, OUT = os.path.join(ROOT, 'web'), os.path.join(ROOT, 'tools', '.sprite-cache'), os.path.join(ROOT, 'web', 'sprites')
SIZE, FILL, QUALITY, MAX_FRAMES = 160, .94, 65, 36   # output square, share of it the model's longest side fills, WebP quality, frame cap
RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'
API = 'https://api.github.com/repos/PokeAPI/sprites/'


def js_value(path, name):   # a `var NAME = <json>;` (or `new Set(<json>)`) from one of the page's data files
    s = open(os.path.join(WEB, path), encoding='utf-8').read()
    m = re.search(r'var ' + name + r' = (?:new Set\()?(.*?)\)?;\n', s, re.S)
    return json.loads(m.group(1))


_trees = {}
def tree(sha):
    if sha not in _trees: _trees[sha] = json.load(urllib.request.urlopen(API + f'git/trees/{sha}'))['tree']
    return _trees[sha]


def listing(path):   # the file ids in one folder of the sprite repository, walking git trees (the contents API stops at 1000 entries)
    sha = 'master'
    for part in path.split('/'): sha = next(x['sha'] for x in tree(sha) if x['path'] == part and x['type'] == 'tree')
    return {int(x['path'].split('.')[0]) for x in tree(sha) if x['type'] == 'blob' and x['path'].split('.')[0].isdigit()}


def fetch(url):
    os.makedirs(CACHE, exist_ok=True)
    f = os.path.join(CACHE, re.sub(r'[^\w.]+', '_', url[len(RAW):]))
    if not os.path.exists(f):
        data = urllib.request.urlopen(url, timeout=60).read()
        open(f, 'wb').write(data)
    return open(f, 'rb').read()


def normalise(data):
    im = Image.open(io.BytesIO(data))
    frames, durs = [], []
    for fr in ImageSequence.Iterator(im):
        frames.append(fr.convert('RGBA').copy()); durs.append(fr.info.get('duration', im.info.get('duration', 50)) or 50)
    if len(frames) > MAX_FRAMES:   # long animations keep every k-th frame; each kept frame takes the time of those it stands for
        k = -(-len(frames) // MAX_FRAMES)
        durs = [sum(durs[i:i + k]) for i in range(0, len(frames), k)]; frames = frames[::k]
    box = None
    for fr in frames:   # union of the opaque pixels over the whole animation, so the model does not jump between frames
        b = fr.getchannel('A').point(lambda a: 255 if a > 16 else 0).getbbox()
        if b: box = b if box is None else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    box = box or (0, 0, frames[0].width, frames[0].height)
    w, h = box[2] - box[0], box[3] - box[1]
    k = SIZE * FILL / max(w, h); nw, nh = max(1, round(w * k)), max(1, round(h * k))
    out = []
    for fr in frames:
        c = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        c.paste(fr.crop(box).resize((nw, nh), Image.LANCZOS), ((SIZE - nw) // 2, SIZE - nh - round(SIZE * (1 - FILL) / 2)))
        out.append(c)
    buf = io.BytesIO()
    out[0].save(buf, 'WEBP', save_all=len(out) > 1, append_images=out[1:], duration=durs, loop=0, quality=QUALITY, method=4)
    return buf.getvalue()


def build(item):
    key, url = item; dst = os.path.join(OUT, key + '.webp')
    if not os.path.exists(dst): open(dst, 'wb').write(normalise(fetch(url)))
    return os.path.getsize(dst)


def main():
    data = json.loads(re.sub(r'^.*?var DUEL_DATA\s*=\s*', '', open(os.path.join(WEB, 'data.js'), encoding='utf-8').read(), flags=re.S).rstrip().rstrip(';'))
    fig_art = js_value('art.js', 'FIG_ART')
    sets = {'ch': listing('sprites/pokemon/versions/generation-ix/champions'), 'ch-s': listing('sprites/pokemon/versions/generation-ix/champions/shiny'),
            'sv': listing('sprites/pokemon/versions/generation-ix/scarlet-violet'), 'sv-s': listing('sprites/pokemon/versions/generation-ix/scarlet-violet/shiny'),
            'sd': listing('sprites/pokemon/other/showdown'), 'sd-s': listing('sprites/pokemon/other/showdown/shiny')}
    by_name = {f['n']: f['dex'] for f in data['figures'] if f['dex'] <= 1025}
    pick, todo, missing = {}, {}, []
    for f in data['figures']:
        own = fig_art.get(f['n']); shiny = bool(own and own[1])
        pid = own[0] if own else f['dex'] if f['dex'] <= 1025 else by_name.get(re.sub(r' [XY]$', '', re.sub(r'^(Alolan|Shiny|Mega) ', '', f['n'])))
        s = '-s' if shiny else ''
        for src, url in (('ch' + s, f"versions/generation-ix/champions/{'shiny/' if shiny else ''}{pid}.webp"), ('sv' + s, f"versions/generation-ix/scarlet-violet/{'shiny/' if shiny else ''}{pid}.webp"), ('sd' + s, f"other/showdown/{'shiny/' if shiny else ''}{pid}.gif")):
            if pid in sets[src]:
                key = f'{src}-{pid}'; pick[f['n']] = key; todo[key] = RAW + url; break
        else: missing.append(f['n'])
    os.makedirs(OUT, exist_ok=True)
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(fetch, todo.values()))   # downloads in parallel threads
    with cf.ProcessPoolExecutor() as ex: total = sum(ex.map(build, sorted(todo.items())))   # encoding in parallel processes
    for f in os.listdir(OUT):   # drop sprites no figure uses any more
        if f[:-5] not in todo: os.remove(os.path.join(OUT, f))
    open(os.path.join(WEB, 'sprites.js'), 'w', encoding='utf-8').write(
        '// GENERATED by tools/build_sprites.py: figure name -> its picture, web/sprites/<key>.webp (ch = Champions model, sv = Scarlet / Violet model, sd = Showdown\n'
        '// sprite, -s = shiny, then the PokeAPI pokemon id). Every one is an animated WebP, normalised to the same size.\n'
        'var FIG_SPRITE = ' + json.dumps(pick, ensure_ascii=False, separators=(',', ':')) + ';\n')
    print(f'{len(pick)} figures, {len(todo)} sprites, {total / 1e6:.1f} MB; without a sprite: {missing or "none"}')


if __name__ == '__main__':
    main()
