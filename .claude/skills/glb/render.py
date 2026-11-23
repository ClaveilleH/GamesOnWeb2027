"""Aperçu d'un .glb rendu par Blender sans écran : vue 3/4 en perspective et vue de dessus orthographique.

Usage : blender -b -P .claude/skills/glb/render.py -- <fichier.glb> <sortie> [taille_px]
Écrit <sortie>-iso.png et <sortie>-top.png (à lire ensuite avec l'outil Read).

Vue de dessus : la droite de l'image est +X glTF, le haut de l'image est -Z glTF (convention de
l'import Blender, Y glTF vers le haut). Rendu Workbench (couleurs des textures, éclairage studio) :
c'est une vérification de forme et de placement, pas l'éclairage du jeu.
"""
import math
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
size = int(argv[2]) if len(argv) > 2 else 800

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scene = bpy.context.scene
depsgraph = bpy.context.evaluated_depsgraph_get()

# Emprise sur la géométrie évaluée (pose et modificateurs compris), pas sur les boîtes au repos.
lo, hi = Vector((math.inf,) * 3), Vector((-math.inf,) * 3)
meshes = [o for o in scene.objects if o.type == "MESH"]
for obj in meshes:
    evaluated = obj.evaluated_get(depsgraph)
    data = evaluated.to_mesh()
    for v in data.vertices:
        p = evaluated.matrix_world @ v.co
        lo = Vector(map(min, lo, p))
        hi = Vector(map(max, hi, p))
    evaluated.to_mesh_clear()
if not meshes:
    sys.exit("Aucun maillage dans " + src)
center, extent = (lo + hi) / 2, hi - lo
radius = max(extent.length / 2, 1e-3)
print(f"MESHES {len(meshes)} AABB_BLENDER {tuple(round(c, 2) for c in lo)} .. {tuple(round(c, 2) for c in hi)}")

sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
scene.collection.objects.link(sun)
scene.render.engine = "BLENDER_WORKBENCH"
scene.display.shading.color_type = "TEXTURE"
scene.display.shading.light = "STUDIO"
scene.display.shading.show_object_outline = True
scene.display.shading.show_cavity = True
scene.render.resolution_x = scene.render.resolution_y = size
scene.render.film_transparent = False

camera = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.clip_end = radius * 20


def shoot(name, location, ortho=None):
    # Pas d'ombre portée sur le plan de dessus : elle se confondrait avec les objets.
    scene.display.shading.show_shadows = not ortho
    camera.location = location
    camera.rotation_euler = (center - location).to_track_quat("-Z", "Y").to_euler()
    camera.data.type = "ORTHO" if ortho else "PERSP"
    if ortho:
        camera.data.ortho_scale = ortho
    scene.render.filepath = f"{out}-{name}.png"
    bpy.ops.render.render(write_still=True)
    print("WROTE", scene.render.filepath)


fov = camera.data.angle
distance = radius / math.sin(fov / 2) * 1.05
shoot("iso", center + Vector((0.6, -0.8, 0.55)).normalized() * distance)
shoot("top", center + Vector((0, 0, extent.z / 2 + radius)), ortho=max(extent.x, extent.y) * 1.05)
