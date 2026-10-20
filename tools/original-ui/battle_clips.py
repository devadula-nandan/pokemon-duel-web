"""battle_clips.py OUT.js: the original's battle animations (attack_anime_controller in level4) as web/battleclips.js.
Reads every AnimationClip of the controller, decodes its streamed curves (time, key count, then per key: curve index and four cubic
coefficients) and samples the figure root's localPosition / localRotation at 30 fps, with the clip's events. Run with python -P, DUEL_DATA
set to the APK's assets/bin/Data (as uni.py)."""
import os, sys, json, struct, collections
import UnityPy
HERE = os.path.dirname(os.path.abspath(__file__))
D = os.environ.get('DUEL_DATA') or os.path.join(HERE, 'apk', 'assets', 'bin', 'Data')
env = UnityPy.load(os.path.join(D, 'level4'), os.path.join(D, 'globalgamemanagers'), os.path.join(D, 'globalgamemanagers.assets'), *[os.path.join(D, f) for f in os.listdir(D) if f.startswith('sharedassets4')])
clips = {}
for o in env.objects:
    if o.type.name == 'AnimatorController' and o.read().m_Name == 'attack_anime_controller':
        for cp in o.read().m_AnimationClips:
            c = cp.read(); clips[c.m_Name] = cp.read_typetree()
        break
ATTR = {1: ('pos', 3), 2: ('rot', 4), 3: ('scale', 3), 4: ('euler', 3)}
def streamed(sc):
    raw = struct.pack('<%dI' % len(sc['data']), *sc['data']); off = 0; frames = []
    while off < len(raw):
        t, n = struct.unpack_from('<fI', raw, off); off += 8; keys = []
        for _ in range(n):
            idx, a, b, c, d = struct.unpack_from('<I4f', raw, off); off += 20; keys.append((idx, (a, b, c, d)))
        frames.append((t, keys))
    curves = collections.defaultdict(list)
    for t, keys in frames:
        for idx, co in keys: curves[idx].append((t, co))
    return curves
def evalc(keys, t):
    if not keys: return 0
    k = keys[0]
    for kk in keys:
        if kk[0] <= t: k = kk
        else: break
    dx = t - k[0]; a, b, c, d = k[1]
    return ((a * dx + b) * dx + c) * dx + d
out = {}
r3 = lambda v: float('%.3f' % v)
for name, j in clips.items():
    mc = j['m_MuscleClip']; cl = mc['m_Clip']['data']; stop = mc['m_StopTime']; sc = streamed(cl['m_StreamedClip']); ns = cl['m_StreamedClip']['curveCount']
    slots = [(b['path'], ATTR.get(b['attribute'], ('x', 1))[0], i) for b in j['m_ClipBindingConstant']['genericBindings'] if b['classID'] == 4 for i in range(ATTR.get(b['attribute'], ('x', 1))[1])]
    n = int(round(stop * 30)) + 1; e = {'l': round(stop, 3)}
    if j['m_Events']: e['e'] = [[round(x['time'], 3), x['functionName'], x['floatParameter']] for x in j['m_Events']]
    for kind, key, w in (('pos', 'p', 3), ('rot', 'q', 4)):
        idx = [ci for ci, s in enumerate(slots) if s[1] == kind and s[0] == 794276730]   # the figure root
        if len(idx) == w and all(ci < ns for ci in idx): e[key] = [r3(evalc(sc.get(ci, []), f / 30)) for f in range(n) for ci in idx]
    out[name] = e
open(sys.argv[1], 'w', encoding='utf-8', newline='\n').write("// The original's battle animations (attack_anime_controller, AnimationClips in the 7.0.16 APK): each clip's length, its events\n// (time, function, parameter) and the figure root's motion sampled at 30 fps: p = x, y, z per frame, q = x, y, z, w per frame, in Unity's\n// axes, in the figure's own frame (its spot is z = 1.5, the middle z = 0). Made by tools/original-ui/battle_clips.py.\nwindow.BATTLE_CLIPS = " + json.dumps(out, separators=(',', ':')) + ';\n')
print(len(out), 'clips')
