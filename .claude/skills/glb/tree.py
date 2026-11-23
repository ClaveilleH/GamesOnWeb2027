#!/usr/bin/env python3
"""Arbre des nœuds d'un .glb/.gltf : nom, maillage, position monde, emprise monde (AABB) et `extras`.

Usage : python3 -I .claude/skills/glb/tree.py <fichier.glb> [--depth N]

Coordonnées glTF (Y vers le haut, mètres), avant la conversion de Babylon. Les `extras` sont les
propriétés personnalisées exportées par Blender (« Custom Properties » cochées à l'export).
Sans dépendance : lit seulement le JSON du fichier, jamais les buffers.
"""
import json
import struct
import sys


def read_json(path):
    with open(path, "rb") as f:
        data = f.read()
    if data[:4] != b"glTF":
        return json.loads(data)
    length, kind = struct.unpack_from("<II", data, 12)
    if kind != 0x4E4F534A:
        sys.exit("GLB sans bloc JSON en tête")
    return json.loads(data[20:20 + length])


def matmul(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def local_matrix(node):
    if "matrix" in node:
        m = node["matrix"]  # colonnes d'abord
        return [[m[c * 4 + r] for c in range(4)] for r in range(4)]
    tx, ty, tz = node.get("translation", [0, 0, 0])
    x, y, z, w = node.get("rotation", [0, 0, 0, 1])
    sx, sy, sz = node.get("scale", [1, 1, 1])
    r = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ]
    return [
        [r[0][0] * sx, r[0][1] * sy, r[0][2] * sz, tx],
        [r[1][0] * sx, r[1][1] * sy, r[1][2] * sz, ty],
        [r[2][0] * sx, r[2][1] * sy, r[2][2] * sz, tz],
        [0, 0, 0, 1],
    ]


def transform(m, p):
    return [m[i][0] * p[0] + m[i][1] * p[1] + m[i][2] * p[2] + m[i][3] for i in range(3)]


def fmt(v):
    return "(" + ", ".join(f"{c:.2f}" for c in v) + ")"


def mesh_info(doc, index, world):
    mesh = doc["meshes"][index]
    lo, hi = [float("inf")] * 3, [float("-inf")] * 3
    verts = 0
    for prim in mesh["primitives"]:
        acc = doc["accessors"][prim["attributes"]["POSITION"]]
        verts += acc["count"]
        if "min" not in acc:
            continue
        a, b = acc["min"], acc["max"]
        for corner in [(x, y, z) for x in (a[0], b[0]) for y in (a[1], b[1]) for z in (a[2], b[2])]:
            p = transform(world, corner)
            lo = [min(lo[i], p[i]) for i in range(3)]
            hi = [max(hi[i], p[i]) for i in range(3)]
    mats = {doc["materials"][p["material"]].get("name", "?") for p in mesh["primitives"] if "material" in p}
    text = f"mesh={mesh.get('name', index)!r} verts={verts} mats={sorted(mats)}"
    if lo[0] != float("inf"):
        size = [hi[i] - lo[i] for i in range(3)]
        text += f" aabb={fmt(lo)}..{fmt(hi)} taille={fmt(size)}"
    return text


def walk(doc, index, parent, depth, max_depth, out):
    node = doc["nodes"][index]
    world = matmul(parent, local_matrix(node))
    parts = [f"{'  ' * depth}- {node.get('name', f'#{index}')!r}", f"pos={fmt([world[0][3], world[1][3], world[2][3]])}"]
    if "mesh" in node:
        parts.append(mesh_info(doc, node["mesh"], world))
        if "skin" in node:
            parts.append("skinned")
    light = node.get("extensions", {}).get("KHR_lights_punctual")
    if light is not None:
        parts.append(f"light={doc['extensions']['KHR_lights_punctual']['lights'][light['light']].get('type')}")
    if "camera" in node:
        parts.append("camera")
    if node.get("extras"):
        parts.append(f"extras={json.dumps(node['extras'], ensure_ascii=False)}")
    out.append(" ".join(parts))
    children = node.get("children", [])
    if depth + 1 > max_depth and children:
        out.append(f"{'  ' * (depth + 1)}… {len(children)} enfant(s)")
        return
    for child in children:
        walk(doc, child, world, depth + 1, max_depth, out)


def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    max_depth = 99
    if "--depth" in args:
        i = args.index("--depth")
        max_depth = int(args[i + 1])
        del args[i:i + 2]
    doc = read_json(args[0])
    identity = [[1 if i == j else 0 for j in range(4)] for i in range(4)]
    out = []
    for s, scene in enumerate(doc.get("scenes", [])):
        out.append(f"scène {s} {scene.get('name', '')!r} extras={json.dumps(scene.get('extras', {}), ensure_ascii=False)}")
        for root in scene.get("nodes", []):
            walk(doc, root, identity, 1, max_depth, out)
    counts = {k: len(doc.get(k, [])) for k in ("nodes", "meshes", "materials", "textures", "animations", "skins")}
    out.append(f"totaux {counts} extensions={doc.get('extensionsUsed', [])} requises={doc.get('extensionsRequired', [])}")
    print("\n".join(out))


main()
