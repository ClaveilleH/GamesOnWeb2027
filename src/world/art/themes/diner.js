import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 26 · Diner des années 50 : damier noir et blanc ciré en miroir, chrome partout (comptoir,
// tabourets, pieds de table), skaï rouge, murs menthe, frise rouge. Un juke-box arrondi brille et change
// de couleur, une enseigne néon « EAT » clignote, une horloge tourne au mur.
const palette = { background: "#7fd1c7", primary: "#d7263d", secondary: "#f6f6f6", accent: "#ffd23f", text: "#1b1b1b" };
const RED = "#d7263d";

export const diner = {
  key: "diner-50",
  title: "Diner des années 50",
  ambient: { hemi: 0.6, sky: "#fffaf0", ground: "#7fd1c7", specular: "#ffffff", sun: 0 },
  image: { contrast: 1.1, exposure: 1.05, saturation: 15 },
  glow: 0.7,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const checker = paintedTexture(scene, `${name} · damier`, 1024, 768, (ctx, w, h) => {
      const step = w / 16;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          ctx.fillStyle = ((x + y) / step) % 2 ? "#151515" : "#f4f4f0";
          ctx.fillRect(x, y, step, step);
        }
      }
    });
    const wall = paintedTexture(scene, `${name} · mur`, 2048, 512, (ctx, w, h) => {
      ctx.fillStyle = "#9fe2d6";
      ctx.fillRect(0, 0, w, h);
      // Frise rouge et blanche, soubassement en inox cannelé.
      ctx.fillStyle = RED;
      ctx.fillRect(0, h * 0.5, w, 26);
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, h * 0.5 + 26, w, 8);
      ctx.fillStyle = "#c9ced3";
      ctx.fillRect(0, h * 0.68, w, h * 0.32);
      for (let x = 0; x < w; x += 18) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.fillRect(x, h * 0.68, 4, h * 0.32);
        ctx.fillStyle = "rgba(0,0,0,0.12)";
        ctx.fillRect(x + 9, h * 0.68, 3, h * 0.32);
      }
      // Étoiles « boomerang » éparses.
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      for (let i = 0; i < 26; i++) {
        const x = (i * 211) % w;
        const y = 30 + ((i * 97) % (h * 0.38));
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 10);
          ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
          ctx.stroke();
        }
      }
    });
    const chrome = m("chrome", { diffuse: "#b8bec4", specular: "#ffffff", power: 256 });
    const vinyl = m("skaï", { diffuse: RED, specular: "#ffd0d0", power: 90 });
    const formica = m("formica", { diffuse: "#f2f2ea", specular: "#ffffff", power: 120 });
    const screens = new Map();
    return {
      palette,
      floor: m("damier", { diffuse: "#ffffff", texture: checker, specular: "#ffffff", power: 220 }),
      wall: m("mur", { diffuse: "#ffffff", texture: wall }),
      ceiling: m("plafond", { diffuse: "#f4f4ee" }),
      trim: chrome,
      doorFrame: chrome,
      door: m("porte", { diffuse: RED, specular: "#ffffff", power: 120 }),
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "Come again!", { color: RED, background: "#ffffff", font: "italic bold 74px cursive" }) }),
      counter: m("comptoir", { diffuse: RED, specular: "#ffffff", power: 140 }),
      counterTop: formica,
      backBar: chrome,
      shelf: chrome,
      glass: (i) => m(`verre ${i}`, { diffuse: ["#ffd23f", "#ff8fab", "#7fd1c7", "#ffffff"][i % 4], specular: "#ffffff", power: 200, alpha: 0.75 }),
      seat: vinyl,
      tableTop: formica,
      metal: chrome,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#d7263d", "#7fd1c7", "#ffd23f"][i % 3], specular: "#ffffff", power: 120 }),
      cabinetSide: () => chrome,
      cabinetEdge: () => chrome,
      panel: m("pupitre", { diffuse: "#1b1b1b" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#d7263d", "#ffd23f", "#ffffff"][i % 3], specular: "#ffffff", power: 100 }),
      chrome, vinyl, formica,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Juke-box dans l'angle nord-ouest : caisse, dôme arrondi, façade lumineuse qui change de couleur.
    const jx = -W / 2 + 0.7;
    const jz = D / 2 - 2.6;
    ctx.box("juke-box caisse", jx, 0.65, jz, 0.6, 1.3, 1, look.chrome);
    const dome = CreateCylinder(`${key} · juke-box dôme`, { height: 0.6, diameter: 1, tessellation: 32, arc: 0.5, enclose: true }, scene);
    dome.rotation.z = Math.PI / 2;
    dome.rotation.y = Math.PI / 2;
    dome.position.copyFrom(ctx.local(jx, 1.3, jz));
    const glowMat = std(scene, `${key} · juke-box lumière`, { diffuse: "#000000", emissive: "#ff8fab" });
    ctx.add(dome, glowMat);
    ctx.box("juke-box façade", jx + 0.31, 0.75, jz, 0.02, 0.9, 0.7, glowMat);
    const jukeLight = ctx.point("juke-box", jx + 0.8, 1.2, jz, "#ff8fab", 0.8, 5);
    // Enseigne néon « EAT » au mur nord, qui clignote lettre par lettre.
    const neon = ["E", "A", "T"].map((letter, i) => {
      const tex = signTexture(scene, `${key} · néon ${letter}`, letter, { width: 128, height: 128, color: RED, background: null, font: "bold 110px sans-serif", glow: 14 });
      tex.hasAlpha = true;
      const mat = std(scene, `${key} · néon ${letter}`, { diffuse: "#000000", unlit: true, emissiveTexture: tex });
      mat.opacityTexture = tex;
      ctx.plane(`néon ${letter}`, 2.4 + i * 0.75, 3.2, D / 2 - 0.04, 0.7, 0.7, mat);
      return mat;
    });
    // Horloge murale à aiguilles.
    const face = paintedTexture(scene, `${key} · horloge`, 256, 256, (c) => {
      c.fillStyle = "#ffffff";
      c.beginPath();
      c.arc(128, 128, 120, 0, Math.PI * 2);
      c.fill();
      c.lineWidth = 12;
      c.strokeStyle = RED;
      c.stroke();
      c.fillStyle = "#1b1b1b";
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        c.beginPath();
        c.arc(128 + Math.cos(a) * 92, 128 + Math.sin(a) * 92, 6, 0, Math.PI * 2);
        c.fill();
      }
    });
    face.hasAlpha = true;
    const faceMat = std(scene, `${key} · horloge`, { diffuse: "#ffffff", texture: face });
    faceMat.diffuseTexture.hasAlpha = true;
    ctx.plane("horloge", -0.4, 3.1, D / 2 - 0.03, 0.8, 0.8, faceMat);
    const hand = std(scene, `${key} · aiguille`, { diffuse: "#1b1b1b" });
    const minute = ctx.box("grande aiguille", -0.4, 3.1, D / 2 - 0.06, 0.03, 0.3, 0.01, hand);
    const hour = ctx.box("petite aiguille", -0.4, 3.1, D / 2 - 0.06, 0.04, 0.2, 0.01, hand);
    minute.setPivotPoint(new Vector3(0, -0.15, 0));
    hour.setPivotPoint(new Vector3(0, -0.1, 0));
    minute.position.y += 0.15;
    hour.position.y += 0.1;
    // Plafonniers en globes et lumière chaude du comptoir.
    for (const x of [-4.5, 0, 4.5]) {
      const globe = CreateSphere(`${key} · globe ${x}`, { diameter: 0.45, segments: 16 }, scene);
      globe.position.copyFrom(ctx.local(x, H - 0.4, 0));
      ctx.add(globe, std(scene, `${key} · globe ${x}`, { diffuse: "#000000", emissive: "#fff6e0" }));
      ctx.point(`globe ${x}`, x, H - 0.6, 0, "#fff6e0", 0.55, 11);
    }
    ctx.point("comptoir", -3.2, H - 0.8, 3.2, "#ffe8c8", 0.5, 7);
    // Reflets : damier ciré, chrome et skaï par la sonde.
    ctx.mirrorFloor(look.floor, { level: 0.25, blur: 12 });
    ctx.probe([look.chrome, look.vinyl, look.formica], { level: 0.5 });
    const jukeColors = [[1, 0.56, 0.67], [1, 0.82, 0.25], [0.5, 0.82, 0.78], [0.84, 0.15, 0.24]];
    ctx.onUpdate((time) => {
      const t = (time * 0.5) % jukeColors.length;
      const a = jukeColors[Math.floor(t)];
      const b = jukeColors[(Math.floor(t) + 1) % jukeColors.length];
      const f = t % 1;
      glowMat.emissiveColor.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
      jukeLight.diffuse.copyFrom(glowMat.emissiveColor);
      // Lettres allumées une à une puis ensemble, puis éteintes.
      const step = Math.floor(time * 2) % 6;
      neon.forEach((mat, i) => { mat.alpha = step < 3 ? (i <= step ? 1 : 0.1) : step < 5 ? 1 : 0.1; });
      minute.rotation.z = -time * 0.5;
      hour.rotation.z = -time * 0.5 / 12;
    });
  },
};
