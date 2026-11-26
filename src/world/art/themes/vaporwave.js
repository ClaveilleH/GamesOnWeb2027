import { CreateCylinder } from "@babylonjs/core/Meshes/Builders/cylinderBuilder";
import { CreateSphere } from "@babylonjs/core/Meshes/Builders/sphereBuilder";
import { CreateTorusKnot } from "@babylonjs/core/Meshes/Builders/torusKnotBuilder";
import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 28 · Vaporwave : rêverie numérique des années 90. Colonnes grecques en marbre rose, damier
// sarcelle et rose, murs en ciel dégradé avec soleil et palmiers, nœud chromé qui tourne sur un
// piédestal, sphère miroir. Post-traitement : bandes de glitch et décalage de teinte qui traversent l'image.
const palette = { background: "#ff71ce", primary: "#01cdfe", secondary: "#b967ff", accent: "#fffb96", text: "#ffffff" };

Effect.ShadersStore.artGlitchFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
float hash(float n) { return fract(sin(n) * 43758.5453); }
void main(void) {
  vec2 uv = vUV;
  // Une bande horizontale décalée de temps en temps.
  float slot = floor(time * 3.0);
  float glitchOn = step(0.65, hash(slot));
  float y0 = hash(slot + 1.7);
  float h = 0.02 + hash(slot + 4.1) * 0.06;
  float inBand = glitchOn * step(y0, uv.y) * step(uv.y, y0 + h);
  uv.x += inBand * (hash(slot + 9.3) - 0.5) * 0.08;
  vec3 col;
  float split = 0.002 + inBand * 0.012;
  col.r = texture2D(textureSampler, uv + vec2(split, 0.0)).r;
  col.g = texture2D(textureSampler, uv).g;
  col.b = texture2D(textureSampler, uv - vec2(split, 0.0)).b;
  // Teinte rose et cyan dans la bande, lignes douces partout.
  col = mix(col, col.brg, inBand * 0.6);
  col *= 0.95 + 0.05 * sin(vUV.y * 900.0);
  gl_FragColor = vec4(col, 1.0);
}`;

function sky(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#b967ff");
  g.addColorStop(0.5, "#ff71ce");
  g.addColorStop(1, "#01cdfe");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Soleil à bandes et palmiers répétés.
  for (const cx of [w * 0.25, w * 0.75]) {
    const sun = ctx.createLinearGradient(0, h * 0.2, 0, h * 0.6);
    sun.addColorStop(0, "#fffb96");
    sun.addColorStop(1, "#ff71ce");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(cx, h * 0.42, h * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff71ce";
    for (let k = 0; k < 5; k++) ctx.fillRect(cx - h * 0.2, h * 0.45 + k * 12, h * 0.4, 3 + k);
  }
  ctx.fillStyle = "#05ffa1";
  ctx.globalAlpha = 0.85;
  for (let x = 60; x < w; x += 340) {
    ctx.fillRect(x, h * 0.35, 8, h * 0.45);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.ellipse(x + 4 + Math.cos(a) * 34, h * 0.35 + Math.sin(a) * 10, 38, 8, a, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 46px sans-serif";
  ctx.fillText("Ａ Ｅ Ｓ Ｔ Ｈ Ｅ Ｔ Ｉ Ｃ", w * 0.38, h * 0.16);
  ctx.fillStyle = "#2d0b4e";
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
}

function marble(ctx, w, h) {
  ctx.fillStyle = "#ffd6ec";
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 18; i++) {
    ctx.strokeStyle = `rgba(185,103,255,${0.15 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    ctx.beginPath();
    let x = Math.random() * w;
    let y = 0;
    ctx.moveTo(x, y);
    while (y < h) {
      x += (Math.random() - 0.5) * 30;
      y += 20;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

export const vaporwave = {
  key: "vaporwave",
  title: "Vaporwave",
  ambient: { hemi: 0.8, sky: "#ffd6ec", ground: "#01cdfe", specular: "#ffffff", sun: 0 },
  image: { contrast: 1.05, saturation: 20 },
  glow: 0.4,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const checker = paintedTexture(scene, `${name} · damier`, 1024, 768, (ctx, w, h) => {
      const step = w / 12;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          ctx.fillStyle = ((x + y) / step) % 2 ? "#01cdfe" : "#ff71ce";
          ctx.fillRect(x, y, step, step);
        }
      }
    });
    const marbleTex = paintedTexture(scene, `${name} · marbre`, 256, 512, marble);
    const marbleMat = m("marbre rose", { diffuse: "#ffffff", texture: marbleTex, specular: "#ffffff", power: 80 });
    const chrome = m("chrome", { diffuse: "#d0d8ff", specular: "#ffffff", power: 256 });
    const screens = new Map();
    return {
      palette,
      floor: m("damier", { diffuse: "#ffffff", texture: checker, specular: "#ffffff", power: 160 }),
      wall: m("ciel", { diffuse: "#000000", unlit: true, emissiveTexture: paintedTexture(scene, `${name} · ciel`, 2048, 512, sky) }),
      ceiling: m("plafond", { diffuse: "#b967ff" }),
      trim: marbleMat,
      doorFrame: marbleMat,
      door: chrome,
      sign: m("enseigne", { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "ｎｅｘｔ", { color: "#ffffff", background: "#b967ff", font: "bold 80px sans-serif", glow: 10 }) }),
      counter: marbleMat,
      counterTop: chrome,
      backBar: m("fond du bar", { diffuse: "#2d0b4e" }),
      shelf: chrome,
      glass: (i) => m(`verre ${i}`, { diffuse: "#000000", emissive: ["#ff71ce", "#01cdfe", "#05ffa1", "#fffb96"][i % 4], alpha: 0.85 }),
      seat: m("assise", { diffuse: "#01cdfe", specular: "#ffffff", power: 80 }),
      tableTop: marbleMat,
      metal: chrome,
      cabinet: (i) => m(`borne ${i}`, { diffuse: ["#b967ff", "#ff71ce", "#01cdfe"][i % 3], specular: "#ffffff", power: 100 }),
      cabinetSide: () => marbleMat,
      panel: m("pupitre", { diffuse: "#2d0b4e" }),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: ["#05ffa1", "#fffb96", "#ff71ce"][i % 3] }),
      marbleMat, chrome,
    };
  },

  decorate(ctx) {
    const { look, scene, room, ROOM: { height: H } } = ctx;
    const key = room.theme.key;
    // Colonnes grecques (fût cannelé à 16 pans, base et chapiteau) aux quatre coins.
    for (const [x, z] of [[-7.2, -5.2], [-7.2, 5.2], [7.3, 5.3], [-0.6, 5.3]]) {
      const shaft = CreateCylinder(`${key} · fût ${x} ${z}`, { height: H - 0.5, diameter: 0.5, tessellation: 16 }, scene);
      shaft.position.copyFrom(ctx.local(x, H / 2, z));
      ctx.add(shaft, look.marbleMat);
      ctx.box(`base ${x} ${z}`, x, 0.12, z, 0.7, 0.24, 0.7, look.marbleMat);
      ctx.box(`chapiteau ${x} ${z}`, x, H - 0.12, z, 0.75, 0.24, 0.75, look.marbleMat);
    }
    // Piédestal au centre, nœud chromé qui tourne et sphère miroir qui flotte.
    ctx.box("piédestal", 0.8, 0.5, 0.5, 0.8, 1, 0.8, look.marbleMat);
    const knot = CreateTorusKnot(`${key} · nœud`, { radius: 0.28, tube: 0.08, radialSegments: 96, tubularSegments: 16 }, scene);
    knot.position.copyFrom(ctx.local(0.8, 1.55, 0.5));
    ctx.add(knot, look.chrome);
    const orb = CreateSphere(`${key} · sphère`, { diameter: 0.5, segments: 24 }, scene);
    orb.position.copyFrom(ctx.local(-2, 2.4, 1.5));
    ctx.add(orb, look.chrome);
    ctx.point("rose", -4, H - 0.5, 0, "#ff71ce", 0.5, 12);
    ctx.point("cyan", 4, H - 0.5, 0, "#01cdfe", 0.5, 12);
    ctx.mirrorFloor(look.floor, { level: 0.25, blur: 8 });
    ctx.probe([look.chrome], { level: 0.9, at: [0, 1.5, 0] });
    const orbY = orb.position.y;
    ctx.onUpdate((time) => {
      knot.rotation.y = time * 0.6;
      knot.rotation.x = Math.sin(time * 0.4) * 0.3;
      orb.position.y = orbY + Math.sin(time * 1.2) * 0.12;
    });
  },

  post(scene, camera) {
    const pass = new PostProcess("glitch", "artGlitch", ["time"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => effect.setFloat("time", (performance.now() - start) / 1000);
    return () => pass.dispose(camera);
  },
};
