import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { signTexture, std } from "../materials.js";

// Salle 68 · Ombres colorées : une salle entièrement blanche, éclairée uniquement par trois projecteurs
// rouge, vert et bleu placés à des endroits différents. Là où les trois se recouvrent, la lumière
// redevient blanche ; là où un objet masque l'un d'eux, son ombre prend la couleur complémentaire
// (cyan, magenta ou jaune). Les trois sources tournent lentement pour faire danser les ombres.
const palette = { background: "#ffffff", primary: "#ff2020", secondary: "#20ff20", accent: "#2040ff", text: "#202020" };

export const rgbShadows = {
  key: "ombres-colorees",
  title: "Ombres colorées",
  ambient: { hemi: 0.04, sky: "#ffffff", ground: "#ffffff", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.3, contrast: 1.05 },
  glow: 0,

  look(scene, name) {
    const white = std(scene, `${name} · blanc`, { diffuse: "#f4f4f4" });
    const gloss = std(scene, `${name} · blanc laqué`, { diffuse: "#f4f4f4", specular: "#ffffff", power: 90 });
    const screens = new Map();
    return {
      palette,
      floor: white,
      wall: white,
      ceiling: white,
      trim: white,
      doorFrame: white,
      door: gloss,
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "R G B → sortie", { color: "#202020", background: "#ffffff", font: "bold 64px sans-serif" }) }),
      counter: gloss,
      counterTop: white,
      backBar: white,
      shelf: white,
      glass: () => gloss,
      seat: white,
      tableTop: gloss,
      metal: white,
      cabinet: () => gloss,
      cabinetSide: () => white,
      panel: white,
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: () => white,
      scanlines: false,
      white,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Trois sphères posées au sol au centre, pour bien lire les ombres.
    for (const [x, z, d] of [[0.8, 0.5, 0.7], [-0.6, 1.2, 0.5], [0.2, 2, 0.9]]) {
      const ball = CreateSphere(`${key} · boule ${x}`, { diameter: d, segments: 24 }, scene);
      ball.position.copyFrom(ctx.local(x, d / 2, z));
      ctx.add(ball, look.white);
    }
    // Trois projecteurs larges en triangle, chacun avec ses ombres.
    const lamps = [["rouge", "#ff1010", 0], ["vert", "#10ff10", (2 * Math.PI) / 3], ["bleu", "#1030ff", (4 * Math.PI) / 3]].map(([label, hex, phase]) => {
      const light = ctx.spot(label, [0, H - 0.2, 0], [0, -1, 0], hex, 1.6, 2.4, 1, 30);
      ctx.shadows(light, { size: 1024, darkness: 0, soft: true });
      // Petit boîtier blanc lumineux qui matérialise la source.
      const lamp = ctx.box(`projecteur ${label}`, 0, H - 0.15, 0, 0.25, 0.12, 0.25, std(scene, `${key} · ${label}`, { diffuse: "#000000", emissive: hex }));
      return { light, lamp, phase };
    });
    const origin = ctx.local(0, 0, 0);
    ctx.onUpdate((time) => {
      for (const { light, lamp, phase } of lamps) {
        const a = phase + time * 0.15;
        const x = Math.cos(a) * 3.2;
        const z = 0.5 + Math.sin(a) * 2.6;
        light.position.set(origin.x + x, H - 0.25, origin.z + z);
        lamp.position.set(origin.x + x, H - 0.15, origin.z + z);
        // Chaque source vise le centre de la salle, un peu au-delà, pour balayer large.
        light.direction.set(-x * 0.45, -(H - 0.25), 0.5 - z * 0.45).normalize();
      }
    });
  },
};
