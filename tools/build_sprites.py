"""Builds web/sprites/: two pictures per figure, hosted with the page instead of hot-linked from PokeAPI's sprite repository.
The player picks which set the game shows (the Animated / Still setting).

  still/<key>.webp  the Pokémon HOME render (sprites/pokemon/other/home/[shiny/]<id>.png): every figure has one.
  anim/<key>.webp   the best animated model the figure has, in this order (all from https://github.com/PokeAPI/sprites):
                      Pokémon Champions, Legends Z-A, Scarlet / Violet, Sword / Shield, Brilliant Diamond / Shining Pearl, Legends Arceus
                      (versions/generation-ix|viii/<game>/[shiny/]<id>.webp, 512px 3D models); then the Showdown sprite
                      (other/showdown/[shiny/]<id>.gif, pixel art) only for a figure none of those has.
<id> is the figure's PokeAPI pokemon id: its form / Mega / Alolan id from web/art.js FIG_ART, else its National Dex number.

Every picture is normalised by how big the figure looks, not by its outline: scaled so a typical frame's visible (opaque) area is TARGET x TARGET px,
within H_RANGE / W_MAX for extreme shapes (a long thin figure has little area for its size, a round one a lot). A compact figure (Snorunt) is not
blown up to fill a box and a spread-out one (Mega Charizard's wings) is not shrunk to fit one. The canvas is the outline of every frame plus PAD, so
nothing is ever clipped, and centred on the body rather than the outline (a tail or a wing does not pull it aside); pictures are as big as they need to be and all share one scale (the board draws SIZE px as one figure height). Every frame is kept, with its timing (MAX_FRAMES can cap a long animation). Downloads and folder listings are cached in
tools/.sprite-cache (not committed). Writes web/sprites/{anim,still}/<key>.webp and web/sprites.js (figure name -> [animated, still]).

    GITHUB_TOKEN=<token> python tools/build_sprites.py      (the token is optional; it lifts GitHub's 60-an-hour API limit)
"""
import concurrent.futures as cf, hashlib, io, json, os, re, sys, urllib.request
from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB, CACHE, OUT = os.path.join(ROOT, 'web'), os.path.join(ROOT, 'tools', '.sprite-cache'), os.path.join(ROOT, 'web', 'sprites')
SIZE, QUALITY, MAX_FRAMES = 160, 65, 0   # px the board draws as one figure height, WebP quality, frame cap (0: every frame, as the source has them)
TARGET, PAD = 92, 5   # a typical frame's visible area is TARGET² px (the median of the old box-fitted set, so an average figure keeps its size); clear margin
H_RANGE, W_MAX = (110, 185), 330   # limits on the usual height and width (px) for extreme shapes
ANIM = [('ch', 'versions/generation-ix/champions', 'webp'), ('za', 'versions/generation-ix/legends-za', 'webp'), ('sv', 'versions/generation-ix/scarlet-violet', 'webp'),
        ('ss', 'versions/generation-viii/sword-shield', 'webp'), ('bd', 'versions/generation-viii/brilliant-diamond-shining-pearl', 'webp'),
        ('la', 'versions/generation-viii/legends-arceus', 'webp'), ('sd', 'other/showdown', 'gif')]
STILL = ('hm', 'other/home', 'png')
RAW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/'
API = 'https://api.github.com/repos/PokeAPI/sprites/'


def js_value(path, name):   # a `var NAME = <json>;` (or `new Set(<json>)`) from one of the page's data files
    s = open(os.path.join(WEB, path), encoding='utf-8').read()
    m = re.search(r'var ' + name + r' = (?:new Set\()?(.*?)\)?;\n', s, re.S)
    return json.loads(m.group(1))


_trees = {}
def tree(sha):
    if sha not in _trees:   # GITHUB_TOKEN (optional) lifts the 60-an-hour limit
        req = urllib.request.Request(API + f'git/trees/{sha}', headers={'Authorization': 'Bearer ' + os.environ['GITHUB_TOKEN']} if os.environ.get('GITHUB_TOKEN') else {})
        _trees[sha] = json.load(urllib.request.urlopen(req))['tree']
    return _trees[sha]


def listing(path):   # cached in tools/.sprite-cache/listings.json; delete that file to pick up new sprites
    f = os.path.join(CACHE, 'listings.json'); saved = json.load(open(f)) if os.path.exists(f) else {}
    if path not in saved:
        saved[path] = sorted(_listing(path)); os.makedirs(CACHE, exist_ok=True); json.dump(saved, open(f, 'w'))
    return set(saved[path])


def _listing(path):   # the file ids in one folder of the sprite repository, walking git trees (the contents API stops at 1000 entries)
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
    if MAX_FRAMES and len(frames) > MAX_FRAMES:   # evenly spaced frames; each takes the time of the frames it stands for, so the speed is unchanged
        cut = [round(i * len(frames) / MAX_FRAMES) for i in range(MAX_FRAMES + 1)]
        durs = [sum(durs[cut[i]:cut[i + 1]]) for i in range(MAX_FRAMES)]; frames = [frames[c] for c in cut[:-1]]
    masks = [fr.getchannel('A').point(lambda a: 255 if a > 16 else 0) for fr in frames]
    seen = [(m.getbbox(), m.histogram()[255]) for m in masks]; seen = [(b, n) for b, n in seen if b] or [((0, 0, frames[0].width, frames[0].height), frames[0].width * frames[0].height)]
    box = (min(b[0] for b, _ in seen), min(b[1] for b, _ in seen), max(b[2] for b, _ in seen), max(b[3] for b, _ in seen))   # the whole animation: the model never jumps
    w, h = box[2] - box[0], box[3] - box[1]
    mid = lambda xs: sorted(xs)[len(xs) // 2]   # a flapping or bobbing model is sized by its usual pose
    area, tall, wide = mid([n for _, n in seen]), mid([b[3] - b[1] for b, _ in seen]), mid([b[2] - b[0] for b, _ in seen])
    k = min(max(TARGET / area ** .5, H_RANGE[0] / tall), H_RANGE[1] / tall, W_MAX / wide); nw, nh = max(1, round(w * k)), max(1, round(h * k))
    # The body, not the outline, goes in the middle: a long tail (Pikachu, Mewtwo) or a spread wing widens the outline to one side. The centre is
    # the column splitting the visible pixels in half, each column weighted by the square of its pixel count so thick (body) columns outweigh
    # thin ones (tails, wing membranes); the canvas is widened evenly around it, so nothing is clipped.
    weight = [0.0] * frames[0].width
    for m in masks:
        for x, v in enumerate(m.resize((m.width, 1), Image.BOX).getdata()): weight[x] += v * v
    half_w, run, cx = sum(weight) / 2, 0.0, nw / 2
    for x, v in enumerate(weight):
        run += v
        if run >= half_w: cx = (x + .5 - box[0]) * k; break
    side = max(cx, nw - cx); cw, ch = 2 * round(side) + 2 * PAD, nh + 2 * PAD   # the canvas fits every frame around the body's centre: nothing is clipped
    out = []
    for fr in frames:
        c = Image.new('RGBA', (cw, ch), (0, 0, 0, 0))
        c.alpha_composite(fr.crop(box).resize((nw, nh), Image.LANCZOS), (PAD + round(side - cx), PAD))
        out.append(c)
    buf = io.BytesIO()
    out[0].save(buf, 'WEBP', save_all=len(out) > 1, append_images=out[1:], duration=durs, loop=0, quality=QUALITY, method=4)
    return buf.getvalue()


def stamp():   # the service worker keeps sprites in a cache named after their contents, so a rebuild reaches every device that played before
    h = hashlib.sha1()
    for root, _, files in sorted(os.walk(OUT)):
        for f in sorted(files): h.update(f.encode()); h.update(open(os.path.join(root, f), 'rb').read())
    sw = os.path.join(WEB, 'sw.js'); s = open(sw, encoding='utf-8', newline='').read()
    open(sw, 'w', encoding='utf-8', newline='').write(re.sub(r"pdw-sprites-\w+", 'pdw-sprites-' + h.hexdigest()[:10], s, count=1))


def build(item):
    key, url = item; dst = os.path.join(OUT, key + '.webp')   # key: 'anim/ch-25', 'still/hm-25', ...
    if not os.path.exists(dst): open(dst, 'wb').write(normalise(fetch(url)))
    return os.path.getsize(dst)


def main():
    data = json.loads(re.sub(r'^.*?var DUEL_DATA\s*=\s*', '', open(os.path.join(WEB, 'data.js'), encoding='utf-8').read(), flags=re.S).rstrip().rstrip(';'))
    fig_art = js_value('art.js', 'FIG_ART')
    have = {(tag, sh): listing('sprites/pokemon/' + path + ('/shiny' if sh else '')) for tag, path, _ in ANIM + [STILL] for sh in (False, True)}
    by_name = {f['n']: f['dex'] for f in data['figures'] if f['dex'] <= 1025}
    pick, todo, missing = {}, {}, []
    for f in data['figures']:
        own = fig_art.get(f['n']); shiny = bool(own and own[1])
        pid = own[0] if own else f['dex'] if f['dex'] <= 1025 else by_name.get(re.sub(r' [XY]$', '', re.sub(r'^(Alolan|Shiny|Mega) ', '', f['n'])))
        keys = []
        for folder, sources in (('anim', ANIM), ('still', [STILL])):
            for tag, path, ext in sources:
                if pid in have[(tag, shiny)]:
                    key = f"{folder}/{tag}{'-s' if shiny else ''}-{pid}"; todo[key] = f"{RAW}{path}/{'shiny/' if shiny else ''}{pid}.{ext}"; keys.append(key); break
            else: missing.append(f"{f['n']} ({folder})")
        if len(keys) == 2: pick[f['n']] = keys
    for sub in ('anim', 'still'): os.makedirs(os.path.join(OUT, sub), exist_ok=True)
    with cf.ThreadPoolExecutor(8) as ex: list(ex.map(fetch, todo.values()))   # downloads in parallel threads
    with cf.ProcessPoolExecutor() as ex: total = sum(ex.map(build, sorted(todo.items())))   # encoding in parallel processes
    for root, _, files in os.walk(OUT):   # drop pictures no figure uses any more (and the old flat layout)
        for f in files:
            if os.path.relpath(os.path.join(root, f), OUT).replace(os.sep, '/')[:-5] not in todo: os.remove(os.path.join(root, f))
    open(os.path.join(WEB, 'sprites.js'), 'w', encoding='utf-8').write(
        '// GENERATED by tools/build_sprites.py: figure name -> [animated picture, still picture], each web/sprites/<key>.webp. Tags: ch Champions,\n'
        '// za Legends Z-A, sv Scarlet / Violet, ss Sword / Shield, bd Brilliant Diamond / Shining Pearl, la Legends Arceus, sd Showdown, hm HOME;\n'
        '// -s = shiny; then the PokeAPI pokemon id. All drawn at one scale, sized by visible area (see the script).\n'
        'var FIG_SPRITE = ' + json.dumps(pick, ensure_ascii=False, separators=(',', ':')) + ';\n'
        '// each picture\'s size in px (SIZE px = one figure height), for pages that draw it at the shared scale (the flat board)\n'
        'var SPRITE_PX = ' + json.dumps({k: list(Image.open(os.path.join(OUT, k + '.webp')).size) for k in sorted(todo)}, separators=(',', ':')) + ';\n')
    stamp()
    from collections import Counter
    src = Counter(k.split('/')[0] + ':' + k.split('/')[1].split('-')[0] for k in todo)
    print(f"{len(pick)} figures, {len(todo)} pictures, {total / 1e6:.1f} MB; sources {dict(src)}; missing: {missing or 'none'}")


if __name__ == '__main__':
    main()
