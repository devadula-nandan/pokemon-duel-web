"""Regenerate web/data.js from the ORIGINAL game's master data only.

    python -X utf8 tools/build_data.py <dir with the fan reconstruction's extracted content.pck>

(extract first:  python tools/pck.py extract <content.pck> <dir> "\\.json$")

Sources inside that directory, all dumps of the original 7.0.16 client's own data:
  assets/authentic/android_data/boot_masters/arena_reward_box_masters.json   FigureMaster rows (wheels, MP, types, abilities, evolution trees)
  data/localization/en/content.json                                          the original English text master (names, descriptions)
The one exception is plate cost / rarity: the original PlateMaster rows are not among the cached files, so those two numbers come from
data/reference_match_plate_contract.json (what a fan server served). Plate names and descriptions are still the original text master's.
Nothing from the Godot remake is used. This is display / deck-building data only: the rules run in the original engine.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
root = sys.argv[1]
J = lambda *p: json.load(open(os.path.join(root, *p), encoding="utf-8"))
masters = J("assets", "authentic", "android_data", "boot_masters", "arena_reward_box_masters.json")["ItemMasters"]
loc = J("data", "localization", "en", "content.json")
plate_rows = J("data", "reference_match_plate_contract.json")["plate_masters"]

# evolution trees: group -> [parent group, depth, form-change flag]; root group -> EvoGroupTree.GetFromChangeEvoGroupId()
tree, from_change = {}, {}
def walk(node, parent, depth):
    tree[node["EvoGroupId"]] = [parent, depth, node.get("FormChange") or 0]
    for child in node.get("ChildNodes") or []:
        walk(child, node["EvoGroupId"], depth + 1)
def from_change_group(node, index=0):
    for child in node.get("ChildNodes") or []:
        if child.get("FormChange") and index > 0:
            return node["EvoGroupId"]
        r = from_change_group(child, index + 1)
        if r is not None:
            return r
    return None
for m in masters.values():
    t = (m.get("FigureMaster") or {}).get("EvoGroupTree")
    if t and t.get("RootNode"):
        walk(t["RootNode"], -1, 0)
        fc = from_change_group(t["RootNode"])
        if fc is not None:
            from_change[t["RootNode"]["EvoGroupId"]] = fc

skills, abilities, figures = {}, {}, []
def add_skill(sm):
    sid = sm["SkillMasterId"]
    skills[sid] = [loc.get("SkillMaster.SkillName.%d" % sid, "Attack %d" % sid), loc.get("SkillMaster.SkillDescription.%d" % sid, ""), sm["SkillColor"],
                   sm.get("FormatType") or 0, sm.get("AttackEffectId") or 0, sm.get("DefenseTypeId") or 0, sm.get("NextFieldId") or 0]   # Roulette.GetSkillFormatText, BattleController
    return sid
for key in sorted(masters, key=int):
    fm = masters[key].get("FigureMaster")
    if not fm or fm.get("IsNull") or not fm.get("IsPlayable"):
        continue
    rows = []
    for s in sorted(fm["FigureSkillMasters"], key=lambda s: s["FigureSkillIndex"]):   # every row, in skill-index order
        sid = add_skill(s["SkillMaster"])
        rows.append([sid, s["SkillRange"], s["SkillStar"] if s["SkillStar"] is not None else s["SkillPower"], s["PieceExtPriority"]])
    zs = [add_skill(z["SkillMaster"]) for z in (fm.get("TypeZSkillMasters") or []) + (fm.get("SkillZSkillMasters") or []) if z.get("SkillMaster")]   # MiniDetailFigure.SetSkillZData order
    ab = fm.get("PokepowerId") or 0
    if ab:
        abilities[ab] = [loc.get("FigureMaster.PokepowerName.%d" % ab) or fm.get("PokepowerName") or "", loc.get("FigureMaster.PokepowerDescription.%d" % ab) or fm.get("PokepowerDescription") or ""]
    figures.append({"id": int(key), "rule": fm["RulePokeId"], "n": loc.get("ItemMaster.ItemNameFull.%s" % key) or loc.get("ItemMaster.ItemName.%s" % key) or "Figure " + key,
                    "no": fm["FigureNo"], "dex": fm.get("PokeNo") or 0, "mp": fm["Mp"], "r": fm["Rarity"], "t": [t for t in (fm["Type0"], fm["Type1"]) if t is not None], "ab": ab,
                    "w": rows, "g": fm["EvoGroupId"], "fr": fm.get("FromEvoGroupIds") or [], "to": fm.get("ToEvoGroupIds") or [], "fmx": fm.get("FormMax") or 0,
                    "rm": fm.get("RarityModel") or 0, "n3": 1 if fm.get("IsNot3Limit") else 0, **({} if fm.get("IsPokepowerGood", True) else {"bad": 1}), **({"z": zs} if zs else {})})   # z: its Z-Moves (skill ids)   # bad: IsPokepowerGood false (Se122 / Character_Bad on its ability notice)

# Figures of the original's final roster that the league-only FigureMaster dump lacks, and five rows it holds as pre-release drafts.
# Ids, wheels, MP and abilities are the rows the original client was served (kept by a fan server); types come from the original engine's
# own table; every row passed the engine's check_record. Names (and a few attack / ability texts the text master lacks) are remake-supplied.
R = os.path.join(ROOT, "tools", "roster")
RJ = lambda f: json.load(open(os.path.join(R, f), encoding="utf-8"))
def served_rows(row):
    out = []
    for w in row["wheel"]:
        skills.setdefault(w["skill_id"], [loc.get("SkillMaster.SkillName.%d" % w["skill_id"]) or w.get("name") or "Attack", loc.get("SkillMaster.SkillDescription.%d" % w["skill_id"], ""), w["color"]])
        out.append([w["skill_id"], w["size"], w["value"], w.get("piece_ext_priority") or 0])
    return out
def served_ability(row):
    ab = row.get("ability_id") or 0
    if ab and ab not in abilities:
        abilities[ab] = [loc.get("FigureMaster.PokepowerName.%d" % ab) or row.get("ability_name") or "", loc.get("FigureMaster.PokepowerDescription.%d" % ab) or (row.get("ability_description") or "").replace("[CTRL NOTE]", "")]
    return ab
by_id = {f["id"]: f for f in figures}
for row in RJ("revised_figures.json"):
    f = by_id[row["id"]]
    f.update(n=row["name"], mp=row["mp"], ab=served_ability(row), w=served_rows(row))
for row in RJ("addable_figures.json"):
    if not row.get("released") or not row.get("engine_accepts"):
        continue
    pos = row.get("tree_position")
    if isinstance(pos, list):                                              # position taken from an authentic tree node
        for q in pos:
            tree.setdefault(row["evo_group"], [q["parent"], q["depth"], q["form_change"]])
    elif isinstance(pos, str) and "{" in pos:                              # group follows the authentic numbering pattern but has no dumped node
        for g, v in json.loads(pos[pos.index("{"):pos.rindex("}") + 1]).items():
            tree.setdefault(int(g), v)
    figures.append({"id": row["id"], "rule": row["rule_id"], "n": row["name"], "no": row["figure_no"], "dex": row["poke_no"], "mp": row["mp"], "r": row["rarity"],
                    "t": row["type_ids"], "ab": served_ability(row), "w": served_rows(row), "g": row["evo_group"], "fr": row["from_groups"], "to": row["to_groups"],
                    "fmx": row["form_max"], "rm": row["rarity_model"], "n3": 0, "src": 1})
text = RJ("missing_text.json")
for sid, t in text["skills"].items():
    if int(sid) in skills and (not skills[int(sid)][0] or skills[int(sid)][0].startswith("Attack")):
        skills[int(sid)][0], skills[int(sid)][1] = t["name"], t.get("note") or ""
for aid, t in text["abilities"].items():
    if int(aid) in abilities and not abilities[int(aid)][0]:
        abilities[int(aid)] = [t["name"], (t.get("note") or "").replace("[CTRL NOTE]", "")]
figures.sort(key=lambda f: f["id"])

# league ladder and reward boosters (ArenaLeagueMaster / ArenaRewardBox* / ItemSet masters), only what the 9 leagues can reach
box_file = J("assets", "authentic", "android_data", "boot_masters", "arena_reward_box_masters.json")
league_rows = J("assets", "authentic", "android_data", "boot_masters", "arena_league_masters.json")
consts = {c["Key"]: c["Val"] for c in J("assets", "authentic", "android_data", "boot_masters", "constants.json")}
leagues, roulettes, boxes, tables, sets, item_names = [], {}, {}, {}, {}, {}
for l in league_rows:
    leagues.append({"id": l["ArenaLeagueMasterId"], "promo": l["PromotionRating"], "demo": l["DemotionRating"], "win": l["WinStar"], "lose": l["LoseStar"],
                    "time": l["TimeArenaRewardBoxRouletteMasterId"], "key": l["KeyArenaRewardBoxRouletteMasterId"], "locked": sorted(x["ItemMasterId"] for x in l.get("RewardLockedItems") or [])})
    for rid in (l["TimeArenaRewardBoxRouletteMasterId"], l["KeyArenaRewardBoxRouletteMasterId"]):
        roulettes[rid] = [[e["ArenaRewardBoxMasterId"], e["RouletteRange"]] for e in box_file["NoRefArenaRewardBoxRouletteMasters"][str(rid)]]
for rows in list(roulettes.values()):
    for bid, _ in rows:
        b = box_file["NoRefArenaRewardBoxMasters"][str(bid)]
        boxes[bid] = [b["RewardTimeCostMinutes"], b["Rarity"], [[e["ArenaRewardTableMasterId"], e["RouletteRange"]] for e in box_file["NoRefArenaRewardTableRouletteMasters"][str(bid)]]]
        for tid, _ in boxes[bid][2]:
            tables[tid] = [e["ItemSetMasterId"] for e in sorted(box_file["NoRefArenaRewardTableMasters"][str(tid)], key=lambda e: e["Index"])]
            for sid in tables[tid]:
                sets[sid] = [[e["ItemMasterId"], e["ItemNum"], e["RouletteRange"]] for e in box_file["NoRefItemSetMasters"][str(sid)]]
                for e in sets[sid]:
                    item_names[e[0]] = loc.get("ItemMaster.ItemName.%d" % e[0]) or "Item %d" % e[0]
league_consts = {k: consts[v] for k, v in (("ratingInitial", "Monaco.Rating.Initial"), ("winPoint", "Monaco.OnlineMatch.WinPoint"), ("losePoint", "Monaco.OnlineMatch.LosePoint"),
                                           ("keyCost", "Monaco.KeyArenaReward.Cost"), ("keyLoseStock", "Monaco.KeyArenaReward.LoseStockNum"),
                                           ("tutorialFigure", "Monaco.Tutorial.TimeArenaRewardItemMasterId"), ("clock", "Monaco.ChessClock.TimeLimit"),
                                           ("turns", "Monaco.RankMatch.PlayTurn.UpperLimit"), ("deckCost", "Monaco.DeckCost.UpperLimit"))}

data = {
    "leagues": leagues, "roulettes": roulettes, "boxes": boxes, "tables": tables, "sets": sets, "itemNames": item_names, "consts": league_consts,
    "types": [loc["FigureMaster.TypeName.%d" % i] for i in range(18)],
    "conds": {k.split(".")[-1]: v for k, v in loc.items() if k.startswith("ConditionMaster.ConditionName.")},
    "skills": skills, "abilities": abilities, "figures": figures, "tree": tree, "fromChange": from_change,
    "plates": [{"id": p["item_master_id"], "n": loc.get("ItemMaster.ItemName.%d" % p["item_master_id"]) or p["name"], "c": p["cost"], "r": p["rarity"],
                "d": loc.get("ItemMaster.ItemDescription.%d" % p["item_master_id"]) or p["description"]} for p in plate_rows],
}
out = os.path.join(ROOT, "web", "data.js")
with open(out, "w", encoding="utf-8") as o:
    o.write("// GENERATED by tools/build_data.py from the original game's own master data (see that file for the exact sources).\n"
            "// Wheel rows, in skill-index order: [skillId, size/96, damage or stars, level-up priority]. skills[id] = [name, description, colour 0 Miss 1 White 2 Purple 3 Gold 4 Blue, value format 0 none 1 N 2 N+ 3 Nx, attack effect, defence type, next field].\n"
            "// tree[evoGroup] = [parent group, depth, form-change flag]; fromChange[rootGroup] = EvoGroupTree.GetFromChangeEvoGroupId().\n"
            "var DUEL_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
print("figures", len(figures), "skills", len(skills), "abilities", len(abilities), "plates", len(data["plates"]), "tree groups", len(tree), "bytes", os.path.getsize(out))
print("with forms (FormMax>0):", sum(1 for f in figures if f["fmx"]), "| form-change groups:", sum(1 for v in tree.values() if v[2]), "| fromChange roots:", from_change,
      "| zero-size rows:", sum(1 for f in figures for r in f["w"] if r[1] <= 0), "| no-3-limit:", sum(f["n3"] for f in figures))
