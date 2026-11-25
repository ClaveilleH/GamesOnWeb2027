import { Effect } from "@babylonjs/core/Materials/effect";
import { PostProcess } from "@babylonjs/core/PostProcesses/postProcess";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 19 · Caméscope VHS 1994 : une arcade de galerie marchande des années 90 sous des tubes
// fluorescents, filmée comme une vieille cassette. Post-traitement maison : tube cathodique bombé,
// couches RVB décalées, couleurs qui bavent, lignes de balayage, bruit, bande de tracking qui remonte,
// incrustation « PLAY » et date en surimpression.
const palette = { background: "#14123a", primary: "#00c2c7", secondary: "#ff4fa3", accent: "#ffe45c", text: "#ffffff" };

Effect.ShadersStore.artVhsFragmentShader = `
precision highp float;
varying vec2 vUV;
uniform sampler2D textureSampler;
uniform float time;
uniform vec2 screen;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(void) {
  // Tube bombé.
  vec2 c = vUV - 0.5;
  vec2 uv = 0.5 + c * (1.0 + 0.09 * dot(c, c) * 4.0) * 0.97;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  // Bande de tracking qui remonte, et léger flottement horizontal ligne par ligne.
  float band = mod(time * 0.08, 1.3) - 0.15;
  float inBand = smoothstep(0.06, 0.0, abs(uv.y - band));
  float line = floor(uv.y * screen.y / 2.0);
  uv.x += (hash(vec2(line, floor(time * 30.0))) - 0.5) * (0.0015 + inBand * 0.03);
  uv.x += sin(uv.y * 40.0 + time * 2.0) * 0.0008;
  // Couches décalées et couleurs qui bavent (flou horizontal sur la chrominance).
  float shift = 0.0035 + inBand * 0.01;
  vec3 col;
  col.r = texture2D(textureSampler, uv + vec2(shift, 0.0)).r;
  col.g = texture2D(textureSampler, uv).g;
  col.b = texture2D(textureSampler, uv - vec2(shift, 0.0)).b;
  vec3 bleed = vec3(0.0);
  for (int i = -3; i <= 3; i++) bleed += texture2D(textureSampler, uv + vec2(float(i) * 0.004, 0.0)).rgb;
  bleed /= 7.0;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 chroma = bleed - dot(bleed, vec3(0.299, 0.587, 0.114));
  col = luma + chroma * 1.15;
  // Lignes de balayage, bruit, neige dans la bande, voile chaud et vignette.
  col *= 0.86 + 0.14 * sin(uv.y * screen.y * 3.14159 * 0.5);
  col += (hash(uv * screen + time) - 0.5) * 0.08;
  col += inBand * hash(vec2(uv.x * 300.0, line + time)) * 0.35;
  col = col * vec3(1.03, 1.0, 0.94) + vec3(0.02, 0.015, 0.03);
  col *= 1.0 - dot(c, c) * 1.1;
  gl_FragColor = vec4(col, 1.0);
}`;

export const vhs = {
  key: "vhs-1994",
  title: "Caméscope VHS 1994",
  ambient: { hemi: 0.45, sky: "#f2f6ff", ground: "#4a3a5a", sun: 0 },
  image: { contrast: 1.05, saturation: 20 },
  glow: 0.3,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, { specular: "#333333", power: 30, ...options });
    const carpet = paintedTexture(scene, `${name} · moquette 90`, 1024, 768, (ctx, w, h) => {
      ctx.fillStyle = "#1c1648";
      ctx.fillRect(0, 0, w, h);
      const colors = ["#00c2c7", "#ff4fa3", "#ffe45c", "#7a5cff"];
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = colors[i % 4];
        ctx.strokeStyle = colors[(i + 1) % 4];
        ctx.lineWidth = 4;
        const x = Math.random() * w;
        const y = Math.random() * h;
        if (i % 3 === 0) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 18, y + 4);
          ctx.lineTo(x + 6, y + 18);
          ctx.fill();
        } else if (i % 3 === 1) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(x + 10, y - 14, x + 20, y + 14, x + 30, y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
    const wall = paintedTexture(scene, `${name} · mur 90`, 2048, 512, (ctx, w, h) => {
      ctx.fillStyle = "#e8e4f0";
      ctx.fillRect(0, 0, w, h);
      // Frise en zigzag turquoise et rose, soubassement violet.
      ctx.fillStyle = "#00c2c7";
      ctx.fillRect(0, h * 0.42, w, 26);
      ctx.strokeStyle = "#ff4fa3";
      ctx.lineWidth = 10;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 40) ctx.lineTo(x, h * 0.42 + ((x / 40) % 2 ? -22 : 48));
      ctx.stroke();
      ctx.fillStyle = "#5a3a8a";
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
      ctx.fillStyle = "#ffe45c";
      ctx.fillRect(0, h * 0.72, w, 8);
    });
    const plastic = (label, hex) => m(label, { diffuse: hex, specular: "#ffffff", power: 70 });
    const screens = new Map();
    return {
      palette,
      floor: m("moquette", { diffuse: "#ffffff", texture: carpet }),
      wall: m("mur", { diffuse: "#ffffff", texture: wall }),
      ceiling: m("dalles", { diffuse: "#d8d8d0" }),
      trim: plastic("plinthe", "#5a3a8a"),
      doorFrame: plastic("cadre", "#00c2c7"),
      door: plastic("porte", "#c8c8d0"),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "GAME ZONE", { color: "#ffe45c", background: "#5a3a8a", font: "italic 900 76px sans-serif" }) }),
      counter: plastic("comptoir", "#00a8ad"),
      counterTop: plastic("plateau", "#ff4fa3"),
      backBar: m("fond du bar", { diffuse: "#2a2058" }),
      shelf: plastic("étagère", "#ffe45c"),
      glass: (i) => plastic(`gobelet ${i}`, ["#ff4fa3", "#00c2c7", "#ffe45c", "#7a5cff"][i % 4]),
      seat: plastic("assise", "#7a5cff"),
      tableTop: plastic("table", "#ffe45c"),
      metal: m("chrome", { diffuse: "#9a9aa8", specular: "#ffffff", power: 120 }),
      cabinet: (i) => plastic(`borne ${i}`, ["#1c1648", "#2a2058", "#14123a"][i % 3]),
      cabinetSide: (i) => plastic(`flanc ${i}`, ["#ff4fa3", "#00c2c7", "#7a5cff"][i % 3]),
      panel: plastic("pupitre", "#111111"),
      screen(i, texture) {
        if (!screens.has(i)) screens.set(i, std(scene, `${name} · écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screens.get(i);
      },
      marquee: (i, texture) => std(scene, `${name} · fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => plastic(`bouton ${i}`, ["#ff4fa3", "#00c2c7", "#ffe45c"][i % 3]),
    };
  },

  decorate(ctx) {
    const { scene, ROOM: { height: H } } = ctx;
    // Tubes fluorescents en caissons au plafond, lumière blanche un peu verte.
    const tube = std(scene, "vhs · tube", { diffuse: "#000000", emissive: "#eef8ee" });
    for (const x of [-4.5, 0, 4.5]) {
      for (const z of [-3, 1.5]) ctx.box(`caisson ${x} ${z}`, x, H - 0.03, z, 1.2, 0.04, 0.6, tube);
    }
    ctx.point("néon ouest", -4.5, H - 0.4, -0.7, "#f0fff0", 0.55, 12);
    ctx.point("néon centre", 0, H - 0.4, -0.7, "#f0fff0", 0.55, 12);
    ctx.point("néon est", 4.5, H - 0.4, -0.7, "#f0fff0", 0.55, 12);
  },

  post(scene, camera) {
    const pass = new PostProcess("vhs", "artVhs", ["time", "screen"], null, 1, camera);
    const start = performance.now();
    pass.onApply = (effect) => {
      effect.setFloat("time", (performance.now() - start) / 1000);
      effect.setFloat2("screen", pass.width, pass.height);
    };
    // Incrustation du caméscope, par-dessus le canevas.
    const osd = document.createElement("div");
    osd.className = "vhs-osd";
    osd.innerHTML = '<span class="vhs-play">▶ PLAY</span><span class="vhs-sp">SP</span><span class="vhs-date"></span>';
    document.body.append(osd);
    const date = osd.querySelector(".vhs-date");
    const tick = () => {
      const now = new Date();
      const pad = (n) => String(n).padStart(2, "0");
      date.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}\nNOV. 26 1994`;
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => {
      clearInterval(timer);
      osd.remove();
      pass.dispose(camera);
    };
  },
};
