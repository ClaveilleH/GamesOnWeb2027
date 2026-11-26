import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateGround } from "@babylonjs/core/Meshes/Builders/groundBuilder";
import { CreateIcoSphere } from "@babylonjs/core/Meshes/Builders/icoSphereBuilder";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { signTexture, std } from "../materials.js";

// Salle 22 · Low poly : tout est à facettes, sans aucune texture. Sol en terrain bosselé à faces plates,
// arbres en cônes et icosphères, rochers et cristaux grossiers. Les couleurs viennent d'aplats et d'un
// éclairage en dégradé (ciel pêche, sol bleu-vert) avec un soleil rasant qui sépare nettement les faces.
const palette = { background: "#264653", primary: "#e9c46a", secondary: "#e76f51", accent: "#2a9d8f", text: "#ffffff" };

// Déplace les sommets d'un maillage au hasard puis passe en ombrage plat (une normale par face).
function facet(mesh, amount, { keepBase = false } = {}) {
  const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
  // Les sommets partagés doivent bouger ensemble : on décale par position arrondie.
  const offsets = new Map();
  for (let i = 0; i < positions.length; i += 3) {
    const id = `${positions[i].toFixed(3)},${positions[i + 1].toFixed(3)},${positions[i + 2].toFixed(3)}`;
    if (!offsets.has(id)) offsets.set(id, [(Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount, (Math.random() - 0.5) * amount]);
    const [dx, dy, dz] = offsets.get(id);
    if (keepBase && positions[i + 1] <= 0.001) continue;
    positions[i] += dx;
    positions[i + 1] += dy;
    positions[i + 2] += dz;
  }
  mesh.updateVerticesData(VertexBuffer.PositionKind, positions);
  mesh.convertToFlatShadedMesh();
  return mesh;
}

export const lowPoly = {
  key: "low-poly",
  title: "Low poly",
  ambient: { hemi: 0.8, sky: "#ffd6a5", ground: "#2a6f78", sun: 0 },
  image: { contrast: 1.1, saturation: 10 },
  glow: 0,

  look(scene, name) {
    const m = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#000000" });
    const screens = new Map();
    const bodies = ["#e76f51", "#2a9d8f", "#e9c46a", "#f4a261", "#8ab17d"].map((hex, i) => m(`borne ${i}`, hex));
    return {
      palette,
      floor: m("sol", "#3d8a7a"),
      wall: m("mur", "#f2d9b8"),
      ceiling: m("plafond", "#f6e6cc"),
      trim: m("plinthe", "#264653"),
      doorFrame: m("cadre", "#264653"),
      door: m("porte", "#e76f51"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "▲ SUITE", { color: "#ffffff", background: "#264653", font: "bold 76px sans-serif" }) }),
      counter: m("bar", "#264653"),
      counterTop: m("plateau", "#e9c46a"),
      backBar: m("fond du bar", "#2a9d8f"),
      shelf: m("étagère", "#f4a261"),
      glass: (i) => m(`bouteille ${i}`, ["#e76f51", "#e9c46a", "#8ab17d", "#ffffff"][i % 4]),
      seat: m("assise", "#e76f51"),
      tableTop: m("table", "#f4a261"),
      metal: m("pied", "#264653"),
      cabinet: (i) => bodies[i % bodies.length],
      cabinetSide: (i) => bodies[(i + 2) % bodies.length],
      panel: m("pupitre", "#264653"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, ["#e76f51", "#e9c46a", "#2a9d8f"][i % 3]),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    const flat = (label, hex) => std(scene, `${key} · ${label}`, { diffuse: hex, specular: "#000000" });
    // Terrain à facettes posé sur le sol (quelques centimètres de relief, la physique reste plane).
    const ground = CreateGround(`${key} · terrain`, { width: W - 0.3, height: D - 0.3, subdivisions: 22, updatable: true }, scene);
    const positions = ground.getVerticesData(VertexBuffer.PositionKind);
    for (let i = 0; i < positions.length; i += 3) positions[i + 1] = 0.01 + Math.random() * 0.06;
    ground.updateVerticesData(VertexBuffer.PositionKind, positions);
    ground.convertToFlatShadedMesh();
    ground.position.copyFrom(ctx.local(0, 0, 0));
    ctx.add(ground, flat("terrain", "#3d8a7a"));
    room.anchors.floor.isVisible = false;
    // Arbres : tronc hexagonal, feuillage en icosphères déformées ; rochers et cristaux.
    const leaves = ["#2a9d8f", "#52b788", "#8ab17d"].map((hex, i) => flat(`feuillage ${i}`, hex));
    const bark = flat("écorce", "#7f5539");
    const tree = (x, z, size) => {
      const trunk = facet(CreateCylinder(`${key} · tronc ${x} ${z}`, { height: size * 1.2, diameterTop: size * 0.12, diameterBottom: size * 0.2, tessellation: 6 }, scene), size * 0.04);
      trunk.position.copyFrom(ctx.local(x, size * 0.6, z));
      ctx.add(trunk, bark);
      for (let k = 0; k < 3; k++) {
        const crown = facet(CreateIcoSphere(`${key} · feuillage ${x} ${z} ${k}`, { radius: size * (0.5 - k * 0.1), subdivisions: 1 }, scene), size * 0.15);
        crown.position.copyFrom(ctx.local(x + (k - 1) * size * 0.12, size * (1.25 + k * 0.32), z + (k % 2) * size * 0.1));
        ctx.add(crown, leaves[k % leaves.length]);
      }
    };
    tree(-7, 5, 1.6);
    tree(-6.8, -4.6, 1.3);
    tree(7.2, 5.1, 1.7);
    tree(2.2, -5.2, 1.2);
    const rock = flat("rocher", "#8d99ae");
    for (const [x, z, s] of [[-1.2, 5.3, 0.5], [5.6, 5.3, 0.4], [-7.3, 0.8, 0.45], [0.2, -5.4, 0.35]]) {
      const mesh = facet(CreateIcoSphere(`${key} · rocher ${x}`, { radius: s, subdivisions: 1 }, scene), s * 0.5);
      mesh.scaling.y = 0.65;
      mesh.position.copyFrom(ctx.local(x, s * 0.3, z));
      ctx.add(mesh, rock);
    }
    const crystal = std(scene, `${key} · cristal`, { diffuse: "#9bf6ff", emissive: "#2a6f78", specular: "#ffffff", power: 64 });
    const crystals = [];
    for (let k = 0; k < 5; k++) {
      const mesh = facet(CreateCylinder(`${key} · cristal ${k}`, { height: 0.6 + k * 0.12, diameterTop: 0, diameterBottom: 0.22, tessellation: 5 }, scene), 0.04);
      mesh.position.copyFrom(ctx.local(-4.6 + Math.cos(k) * 0.35, 1.05 + k * 0.03, -2 + Math.sin(k * 1.7) * 0.35));
      mesh.rotation.z = (k - 2) * 0.18;
      ctx.add(mesh, crystal);
      crystals.push(mesh);
    }
    // Soleil rasant d'ouest (ombres nettes), contre-jour froid à l'est.
    const sun = ctx.spot("soleil", [-14, 6, -3], [1, -0.45, 0.2], "#ffd6a5", 1.2, 2.2, 1, 40);
    ctx.shadows(sun, { size: 2048, darkness: 0.35, soft: false });
    ctx.point("contre-jour", 6, H - 0.5, 0, "#9bf6ff", 0.35, 12);
    ctx.onUpdate((time) => {
      crystals.forEach((mesh, k) => { mesh.rotation.y = time * 0.5 + k; });
    });
  },
};
