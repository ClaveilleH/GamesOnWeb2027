import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline";
import { DepthOfFieldEffectBlurLevel } from "@babylonjs/core/PostProcesses/depthOfFieldEffect";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 32 · Maquette miniature (tilt-shift) : une profondeur de champ très courte, mise au point sur le
// joueur, floute l'avant et l'arrière-plan. Le cerveau lit alors la salle comme une maquette photographiée
// de près. Plastique de jouet aux couleurs saturées, plein soleil, ombres nettes, contraste relevé.
const palette = { background: "#ffffff", primary: "#e63946", secondary: "#457b9d", accent: "#ffb703", text: "#1d3557" };

export const miniature = {
  key: "maquette-miniature",
  title: "Maquette miniature (tilt-shift)",
  ambient: { hemi: 0.6, sky: "#ffffff", ground: "#a8dadc", sun: 0 },
  image: { contrast: 1.25, exposure: 1.1, saturation: 45 },
  glow: 0,

  look(scene, name) {
    const plastic = (label, hex) => std(scene, `${name} · ${label}`, { diffuse: hex, specular: "#ffffff", power: 64 });
    const studs = paintedTexture(scene, `${name} · plaque`, 512, 512, (ctx, w, h) => {
      ctx.fillStyle = "#4caf50";
      ctx.fillRect(0, 0, w, h);
      for (let y = 16; y < h; y += 32) {
        for (let x = 16; x < w; x += 32) {
          const g = ctx.createRadialGradient(x - 3, y - 3, 1, x, y, 10);
          g.addColorStop(0, "#81d684");
          g.addColorStop(1, "#3d8b40");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    studs.uScale = 6;
    studs.vScale = 4.5;
    const screens = new Map();
    const colors = ["#e63946", "#457b9d", "#ffb703", "#2a9d8f", "#f4a261"];
    return {
      palette,
      floor: std(scene, `${name} · plaque`, { diffuse: "#ffffff", texture: studs, specular: "#ffffff", power: 50 }),
      wall: plastic("mur", "#f1faee"),
      ceiling: plastic("plafond", "#ffffff"),
      trim: plastic("plinthe", "#1d3557"),
      doorFrame: plastic("cadre", "#ffb703"),
      door: plastic("porte", "#e63946"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#ffffff", background: "#457b9d", font: "bold 76px sans-serif" }) }),
      counter: plastic("bar", "#457b9d"),
      counterTop: plastic("plateau", "#ffb703"),
      backBar: plastic("fond du bar", "#a8dadc"),
      shelf: plastic("étagère", "#1d3557"),
      glass: (i) => plastic(`bouteille ${i}`, colors[i % colors.length]),
      seat: plastic("assise", "#e63946"),
      tableTop: plastic("table", "#ffb703"),
      metal: plastic("pied", "#1d3557"),
      cabinet: (i) => plastic(`borne ${i}`, colors[i % colors.length]),
      cabinetSide: (i) => plastic(`flanc ${i}`, colors[(i + 2) % colors.length]),
      panel: plastic("pupitre", "#1d3557"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => plastic(`bouton ${i}`, colors[(i + 1) % colors.length]),
      scanlines: false,
    };
  },

  decorate(ctx) {
    const { ROOM: { height: H } } = ctx;
    // Plein soleil : un projecteur large, haut et lointain, ombres nettes.
    const sun = ctx.spot("soleil", [-10, 12, -8], [0.6, -1, 0.5], "#fff8e8", 1.3, 2.4, 1, 40);
    ctx.shadows(sun, { size: 2048, darkness: 0.35, soft: false });
    ctx.point("plafond", 2, H - 0.4, 0, "#ffffff", 0.35, 14);
  },

  // Profondeur de champ courte, mise au point sur le joueur.
  post(scene, camera) {
    const pipeline = new DefaultRenderingPipeline("maquette", true, scene, [camera]);
    pipeline.samples = 4;
    pipeline.depthOfFieldEnabled = true;
    pipeline.depthOfFieldBlurLevel = DepthOfFieldEffectBlurLevel.High;
    pipeline.depthOfField.fStop = 1.4;
    pipeline.depthOfField.focalLength = 110;
    pipeline.depthOfField.focusDistance = 4000;
    pipeline.sharpenEnabled = true;
    pipeline.sharpen.edgeAmount = 0.3;
    // Mise au point sur la cible de la caméra d'épaule (le joueur) ; transition douce.
    const observer = scene.onBeforeRenderObservable.add(() => {
      const distance = camera.getTarget ? camera.position.subtract(camera.getTarget()).length() : 4;
      pipeline.depthOfField.focusDistance += (distance * 1000 - pipeline.depthOfField.focusDistance) * 0.2;
    });
    return () => {
      scene.onBeforeRenderObservable.remove(observer);
      pipeline.dispose();
    };
  },
};
