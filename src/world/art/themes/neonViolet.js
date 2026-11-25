import { paintedTexture, signTexture, std } from "../materials.js";

// Salle 1 · Néon violet : salle sombre, lumière violette, néons qui bavent (glow), sol noir miroir
// et surfaces laquées qui reflètent la salle (sonde de réflexion).
const palette = { background: "#08040f", primary: "#b26bff", secondary: "#ff3fd0", accent: "#7df9ff", text: "#f3e6ff" };
const neons = ["#b14dff", "#ff3fd0", "#5ee8ff"];

export const neonViolet = {
  key: "neon-violet",
  title: "Néon violet",
  ambient: { hemi: 0.06, sky: "#5a3c8c", ground: "#140c20", sun: 0 },
  glow: 0.85,

  look(scene, name) {
    const m = (label, options) => std(scene, `${name} · ${label}`, options);
    const tiles = paintedTexture(scene, `${name} · dalles`, 1024, 768, (ctx, w, h) => {
      ctx.fillStyle = "#08060c";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#2a1a40";
      ctx.lineWidth = 3;
      const step = w / 16;
      for (let x = 0; x <= w; x += step) ctx.strokeRect(x, -2, 0, h + 4);
      for (let y = 0; y <= h; y += step) ctx.strokeRect(-2, y, w + 4, 0);
    });
    const glass = neons.concat("#ffd36b").map((tint, i) => m(`verre ${i}`, {
      diffuse: "#000000", specular: "#ffffff", power: 256, emissive: tint, alpha: 0.75,
    }));
    for (const mat of glass) mat.emissiveColor.scaleInPlace(0.45);
    const screen = new Map();
    // Décor des flancs : bandes obliques néon sur laque, faiblement lumineuses.
    const sideArt = paintedTexture(scene, `${name} · flancs`, 256, 512, (ctx, w, h) => {
      ctx.fillStyle = "#0b0712";
      ctx.fillRect(0, 0, w, h);
      neons.forEach((hex, k) => {
        ctx.strokeStyle = hex;
        ctx.globalAlpha = 0.35;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.moveTo(-20, h * 0.55 + k * 26);
        ctx.lineTo(w + 20, h * 0.25 + k * 26);
        ctx.stroke();
      });
    });
    const lacquer = m("laque noire", { diffuse: "#09070d", specular: "#9a80c0", power: 180 });
    return {
      palette,
      floor: m("sol", { diffuse: "#ffffff", specular: "#7a5aa8", power: 220, texture: tiles }),
      wall: m("mur", { diffuse: "#1b1428", specular: "#2a2040", power: 32 }),
      ceiling: m("plafond", { diffuse: "#0a0810" }),
      trim: m("plinthe néon", { diffuse: "#000000", emissive: neons[0] }),
      doorFrame: m("cadre de porte", { diffuse: "#000000", emissive: neons[2] }),
      door: m("porte", { diffuse: "#1a1226", specular: "#5a4080", power: 90 }),
      sign: m("enseigne sortie", { diffuse: "#000000", emissiveTexture:
        signTexture(scene, `${name} · enseigne`, "SALLE SUIVANTE", { color: "#7df9ff", background: "#05030a", glow: 12 }) }),
      counter: lacquer,
      counterTop: m("plateau du bar", { diffuse: "#0c0912", specular: "#d0b8ff", power: 300 }),
      backBar: m("fond du bar", { diffuse: "#000000", emissiveTexture: paintedTexture(scene, `${name} · fond du bar`, 512, 128, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, "#3a0f6a");
        g.addColorStop(0.5, "#8a2fd0");
        g.addColorStop(1, "#250840");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }) }),
      shelf: m("étagère", { diffuse: "#111015", specular: "#606070", power: 64 }),
      glass: (i) => glass[i % glass.length],
      seat: m("velours violet", { diffuse: "#3d1766", specular: "#20103a", power: 8 }),
      tableTop: lacquer,
      metal: m("chrome", { diffuse: "#4a4458", specular: "#ffffff", power: 160 }),
      cabinet: () => lacquer,
      cabinetSide: (i) => m(`flanc ${i}`, { diffuse: "#ffffff", specular: "#b080ff", power: 120,
        texture: sideArt, emissiveTexture: sideArt, emissive: "#000000" }),
      cabinetEdge: (i) => m(`liseré ${i}`, { diffuse: "#000000", emissive: neons[i % neons.length] }),
      panel: m("pupitre", { diffuse: "#1c1430", specular: "#6a50a0", power: 64 }),
      screen(i, texture) {
        if (!screen.has(i)) screen.set(i, m(`écran ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }));
        return screen.get(i);
      },
      marquee: (i, texture) => m(`fronton ${i}`, { diffuse: "#000000", emissiveTexture: texture, unlit: true }),
      button: (i) => m(`bouton ${i}`, { diffuse: "#000000", emissive: ["#ff3fd0", "#5ee8ff", "#ffe45c", "#b14dff"][i % 4] }),
      lacquer,
    };
  },

  decorate(ctx) {
    const { look, ROOM: { width: W, depth: D, height: H }, scene } = ctx;
    // Plafond : trois points violets ; bar en magenta ; reflet cyan des bornes.
    for (const x of [-4.5, 0, 4.5]) ctx.point(`plafonnier ${x}`, x, H - 0.4, 0, "#8a3cff", 0.85, 9);
    ctx.point("bar", -3.2, 2.3, 2.6, "#ff2fc4", 0.9, 6);
    ctx.point("bornes", 5.6, 2.3, 0, "#3fd8ff", 0.55, 6);
    // Gorges lumineuses au plafond et enseigne « ARCADE » sur le mur ouest.
    const strip = (hex) => std(scene, `${ctx.room.theme.key} · néon ${hex}`, { diffuse: "#000000", emissive: hex });
    ctx.box("gorge nord", 0, H - 0.06, D / 2 - 0.12, W - 0.4, 0.05, 0.05, strip(neons[0]));
    ctx.box("gorge sud", 0, H - 0.06, -D / 2 + 0.12, W - 0.4, 0.05, 0.05, strip(neons[0]));
    ctx.box("gorge est", W / 2 - 0.12, H - 0.06, 0, 0.05, 0.05, D - 0.4, strip(neons[2]));
    ctx.box("gorge ouest", -W / 2 + 0.12, H - 0.06, 0, 0.05, 0.05, D - 0.4, strip(neons[1]));
    ctx.box("néon sous le bar", -3.2, 0.1, 3.52, 6.2, 0.03, 0.03, strip(neons[1]));
    const sign = std(scene, "néon ARCADE", { diffuse: "#000000", unlit: true,
      emissiveTexture: signTexture(scene, "néon ARCADE", "ARCADE", { width: 1024, height: 256, color: "#ff5ae0",
        background: null, font: "italic bold 190px sans-serif", glow: 24 }) });
    sign.emissiveTexture.hasAlpha = true;
    sign.opacityTexture = sign.emissiveTexture;
    ctx.plane("enseigne ARCADE", -W / 2 + 0.05, 2.6, -1, 3.6, 0.9, sign, -Math.PI / 2);
    // Reflets : sol miroir flouté et sonde pour la laque, le chrome et le plateau du bar.
    ctx.mirrorFloor(look.floor, { level: 0.55, blur: 18 });
    ctx.probe([look.lacquer, look.metal, look.counterTop, look.door], { level: 0.22 });
    // Les néons respirent doucement.
    const pulse = look.trim.emissiveColor.clone();
    ctx.onUpdate((time) => {
      const k = 0.85 + 0.15 * Math.sin(time * 1.7);
      look.trim.emissiveColor.copyFrom(pulse).scaleInPlace(k);
    });
  },
};
