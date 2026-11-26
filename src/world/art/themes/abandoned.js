import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 18 · Abandonnée, à la lampe torche : l'arcade fermée depuis des années. Presque aucune lumière :
// une lampe torche suit le regard et projette des ombres, des poussières flottent dans son faisceau, un
// néon de secours vert grésille au-dessus de la porte. Moquette tachée, papier peint décollé, chaises
// renversées, une borne couchée, écrans éteints.
const palette = { background: "#050505", primary: "#4a5a4a", secondary: "#3a2e2e", accent: "#6a6a5a", text: "#7a7a70" };

function grime(ctx, w, h, base, stains = 40) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
  }
  for (let i = 0; i < stains; i++) {
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, "rgba(30,22,10,0.45)");
    g.addColorStop(1, "rgba(30,22,10,0)");
    ctx.save();
    ctx.translate(Math.random() * w, Math.random() * h);
    ctx.scale(40 + Math.random() * 120, 30 + Math.random() * 80);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

export const abandoned = {
  key: "abandonnee",
  title: "Abandonnée, à la lampe torche",
  ambient: { hemi: 0.07, sky: "#8fa4b8", ground: "#0a0806", sun: 0 },
  image: { toneMapping: "aces", exposure: 1.8, contrast: 1.15, vignette: 3, saturation: -40 },
  fog: { color: "#050505", density: 0.04 },
  glow: 0.6,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, { specular: "#111111", power: 8, ...options });
    const carpet = paintedTexture(scene, `${name} · moquette`, 1024, 768, (ctx, w, h) => {
      grime(ctx, w, h, "#3a2a30", 60);
      ctx.strokeStyle = "rgba(120,90,60,0.25)";
      ctx.lineWidth = 6;
      for (let i = 0; i < 40; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, 20 + Math.random() * 30, 0, Math.PI * 1.4);
        ctx.stroke();
      }
    });
    const wallpaper = paintedTexture(scene, `${name} · papier peint`, 2048, 512, (ctx, w, h) => {
      grime(ctx, w, h, "#4a5048", 30);
      ctx.fillStyle = "rgba(90,100,80,0.35)";
      for (let x = 0; x < w; x += 64) {
        for (let y = 0; y < h * 0.78; y += 64) {
          ctx.beginPath();
          ctx.arc(x + 32, y + 32, 10, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Lés décollés : bandes plus claires, plâtre nu dessous.
      for (let i = 0; i < 9; i++) {
        const x = Math.random() * w;
        ctx.fillStyle = "#8a8070";
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + 50 + Math.random() * 60, 0);
        ctx.lineTo(x + 20 + Math.random() * 30, h * (0.2 + Math.random() * 0.4));
        ctx.fill();
      }
      // Coulures d'humidité.
      for (let i = 0; i < 50; i++) {
        ctx.fillStyle = `rgba(20,15,5,${0.1 + Math.random() * 0.2})`;
        ctx.fillRect(Math.random() * w, Math.random() * h * 0.3, 3 + Math.random() * 6, h * Math.random() * 0.7);
      }
      ctx.fillStyle = "#221a14";
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
    });
    const dirtyWood = m("bois sale", { diffuse: "#3a2c20" });
    const rust = m("rouille", { diffuse: "#4a3020", specular: "#332211", power: 12 });
    const dead = m("écran éteint", { diffuse: "#050606", specular: "#556655", power: 90 });
    const dust = m("carcasse", { diffuse: "#2c2c2a" });
    return {
      palette,
      floor: m("moquette", { diffuse: "#ffffff", texture: carpet }),
      wall: m("papier peint", { diffuse: "#ffffff", texture: wallpaper }),
      ceiling: m("plafond", { diffuse: "#2a2824" }),
      trim: dirtyWood,
      doorFrame: rust,
      door: m("porte", { diffuse: "#3a3c38" }),
      sign: std(scene, `${name} · enseigne`, { diffuse: "#000000", unlit: true, emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SORTIE", { color: "#3cff7a", background: "#041208", glow: 10 }) }),
      counter: dirtyWood,
      counterTop: m("plateau", { diffuse: "#2a241e", specular: "#222222", power: 20 }),
      backBar: m("fond du bar", { diffuse: "#1e1a16" }),
      shelf: dirtyWood,
      glass: (i) => m(`bouteille ${i}`, { diffuse: ["#1c2a18", "#2a1a10", "#202020"][i % 3], specular: "#777766", power: 80, alpha: 0.85 }),
      seat: m("assise", { diffuse: "#3a1c18" }),
      tableTop: dirtyWood,
      metal: rust,
      cabinet: () => dust,
      cabinetSide: () => dust,
      panel: m("pupitre", { diffuse: "#151515" }),
      // Écrans éteints : on ignore la texture animée, seul un reflet sombre reste.
      screen: () => dead,
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, emissive: "#000000" }),
      button: () => m("bouton", { diffuse: "#2a2020" }),
      dead,
    };
  },

  decorate(ctx) {
    const { scene, room, ROOM: { width: W, depth: D, height: H } } = ctx;
    const key = room.theme.key;
    // Désordre : chaises renversées, une borne couchée, tabourets de travers.
    const chairs = new Set(room.meshes.map((mesh) => mesh.parent).filter((node) => /chaise \d+$/.test(node?.name ?? "")));
    [...chairs].forEach((chair, i) => {
      if (i % 2 === 0) chair.rotation.z = 1.5;
      else chair.rotation.y += 0.7;
    });
    const fallen = room.anchors.cabinets[4]?.pivot;
    if (fallen) fallen.rotation.z = 1.45;
    // Néon de secours vert au-dessus de la porte, qui grésille.
    const exitLight = ctx.point("secours", 0, 3.4, -D / 2 + 0.6, "#3cff7a", 0.6, 8);
    // Clair de lune froid entre les planches d'une fenêtre condamnée (mur ouest).
    ctx.spot("lune", [-W / 2 - 1, 3.4, 1], [1, -0.7, -0.2], "#7f9cc8", 0.9, 0.8, 2, 12);
    // Lampe torche : projecteur qui suit la caméra, ombres dures.
    const torch = ctx.spot("lampe torche", [0, 1.6, -4], [0, 0, 1], "#fff1d6", 3.2, 1.05, 4, 22);
    ctx.shadows(torch, { size: 1024, darkness: 0, bias: 0.0008, soft: true });
    // Poussières en suspension : petits panneaux face caméra, visibles surtout dans le faisceau.
    const mote = paintedTexture(scene, `${key} · poussière`, 32, 32, (c) => {
      const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
      g.addColorStop(0, "rgba(255,240,220,0.9)");
      g.addColorStop(1, "rgba(255,240,220,0)");
      c.fillStyle = g;
      c.fillRect(0, 0, 32, 32);
    });
    mote.hasAlpha = true;
    const moteMat = std(scene, `${key} · poussière`, { diffuse: "#ffffff", specular: "#000000" });
    moteMat.opacityTexture = mote;
    moteMat.diffuseTexture = mote;
    const motes = [];
    const base = CreatePlane(`${key} · grain`, { size: 0.03 }, scene);
    base.billboardMode = Mesh.BILLBOARDMODE_ALL;
    ctx.add(base, moteMat);
    for (let i = 0; i < 160; i++) {
      const mesh = i ? base.clone(`${key} · grain ${i}`) : base;
      if (i) ctx.add(mesh, moteMat);
      motes.push({ mesh, x: (Math.random() - 0.5) * (W - 1), y: 0.3 + Math.random() * (H - 0.6), z: (Math.random() - 0.5) * (D - 1), p: Math.random() * 10 });
    }
    // Toiles d'araignée dans les coins du plafond.
    const web = paintedTexture(scene, `${key} · toile`, 256, 256, (c, w) => {
      c.strokeStyle = "rgba(220,220,210,0.55)";
      c.lineWidth = 1.5;
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * (Math.PI / 2);
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(Math.cos(a) * w, Math.sin(a) * w);
        c.stroke();
      }
      for (let r = 30; r < w; r += 28) {
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI / 2);
        c.stroke();
      }
    });
    web.hasAlpha = true;
    const webMat = std(scene, `${key} · toile`, { diffuse: "#bbbbb0", specular: "#000000" });
    webMat.diffuseTexture = web;
    webMat.opacityTexture = web;
    webMat.backFaceCulling = false;
    ctx.plane("toile nord-ouest", -W / 2 + 0.5, H - 0.5, D / 2 - 0.02, 1, 1, webMat, 0);
    ctx.plane("toile nord-est", W / 2 - 0.5, H - 0.5, D / 2 - 0.02, 1, 1, webMat, 0).rotation.z = Math.PI / 2;
    const forward = new Vector3();
    ctx.onUpdate((time) => {
      const camera = scene.activeCamera;
      if (camera) {
        // La lampe est tenue au-dessus de l'épaule, un peu à droite ; léger tremblement de la main.
        camera.getDirectionToRef(Vector3.Forward(), forward);
        const right = Vector3.Cross(Vector3.Up(), forward).normalize();
        torch.position.copyFrom(camera.globalPosition).addInPlace(right.scale(0.35)).addInPlace(new Vector3(0, 0.35, 0));
        torch.direction.copyFrom(forward);
        torch.direction.x += Math.sin(time * 1.7) * 0.012;
        torch.direction.y += Math.sin(time * 2.3) * 0.01;
      }
      const s = Math.sin(time * 13) * Math.sin(time * 3.1);
      exitLight.intensity = s > 0.6 ? 0.05 : 0.6;
      const origin = ctx.local(0, 0, 0);
      for (const d of motes) {
        d.mesh.position.set(origin.x + d.x + Math.sin(time * 0.2 + d.p) * 0.3, d.y + Math.sin(time * 0.13 + d.p * 2) * 0.2,
          origin.z + d.z + Math.cos(time * 0.17 + d.p) * 0.3);
      }
    });
  },
};
