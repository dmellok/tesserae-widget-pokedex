// pokedex — Pokédex entry card: sprite, types, real base stats.
//
// Fragments: full (card), sprite (image tile), stats (bars only).
// Themes: house (Spectra tokens), pokedex (classic red device chrome),
// gameboy (mono-green handheld). No fetch, idempotent.
//
// Themed type sizes use min(Ncqw, Mcqh): width-driven so rows fit at any
// aspect, height-capped so wide-short cells don't blow up vertically.

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);

const STAT_ROWS = [
  ["hp", "HP"], ["atk", "ATK"], ["def", "DEF"],
  ["spa", "SP.A"], ["spd", "SP.D"], ["spe", "SPD"],
];
const STAT_MAX = 180; // practical per-stat ceiling for bar scale

export default function (shadow, ctx) {
  const d = ctx.data || {};
  const o = (ctx.cell && ctx.cell.options) || {};
  const fragment = (ctx.cell && ctx.cell.fragment) || "full";
  const theme = o.theme === "pokedex" || o.theme === "gameboy" ? o.theme : "house";
  const themed = theme !== "house";

  const styles = `
    <link rel="stylesheet" href="/static/style/spectra-widgets.css" />
    <style>
      .w { box-sizing: border-box; width: 100%; height: 100%;
           container-type: size; color: var(--text-primary); background: var(--surface); }
      .body { width: 100%; height: 100%; display: flex; flex-direction: column;
              padding: 5cqmin 6cqmin; gap: 2cqmin; overflow: hidden; }
      .head { display: flex; align-items: baseline; gap: 3cqmin; }
      .no { color: var(--text-secondary); font-size: 6cqmin;
            font-variant-numeric: tabular-nums; }
      .name { font-size: 8cqmin; font-weight: var(--fw-bold, 700); white-space: nowrap;
              overflow: hidden; text-overflow: ellipsis; }
      .genus { margin-left: auto; font-size: 4.5cqmin; color: var(--text-secondary);
               white-space: nowrap; }
      .mid { flex: 1; min-height: 0; display: flex; gap: 4cqmin; align-items: center; }
      .sprite { height: 100%; max-width: 45%; object-fit: contain;
                image-rendering: pixelated; }
      .stats { flex: 1; display: flex; flex-direction: column; gap: 1.2cqmin; }
      .srow { display: flex; align-items: center; gap: 2cqmin; }
      .slbl { width: 12cqmin; font-size: 4.2cqmin; color: var(--text-secondary); }
      .sval { width: 9cqmin; text-align: right; font-size: 4.4cqmin;
              font-variant-numeric: tabular-nums; font-weight: var(--fw-bold, 700); }
      .sbar { flex: 1; height: 2.4cqmin; background: var(--surface-sunken);
              border-radius: 1.2cqmin; overflow: hidden; display: block; }
      .sfill { height: 100%; background: var(--accent-4); display: block; }
      .types { display: flex; gap: 2cqmin; flex-wrap: wrap; }
      .type { font-size: 4cqmin; letter-spacing: 0.08em; padding: 0.8cqmin 2.5cqmin;
              border-radius: 2cqmin; background: var(--surface-sunken);
              color: var(--text-primary); font-weight: var(--fw-bold, 700); }
      .flavor { font-size: 4.2cqmin; color: var(--text-secondary); line-height: 1.35;
                display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
                overflow: hidden; }
      .tile { width: 100%; height: 100%; display: flex; flex-direction: column;
              align-items: center; justify-content: center; gap: 1cqmin;
              background: var(--surface-sunken); border-radius: 4cqmin; padding: 4cqmin; }
      .tile .sprite { max-width: 80%; flex: 1; min-height: 0; }
      .tile-label { font-size: 6cqmin; font-weight: var(--fw-bold, 700); }
      .empty { flex: 1; display: flex; align-items: center; justify-content: center;
               text-align: center; color: var(--text-secondary); font-size: 6cqmin;
               padding: 6cqmin; }

      /* ---- shared themed bits ----
         The two themed modes reproduce real hardware (the Gen-I Pokédex
         device and the DMG Game Boy), so their palettes and pixel fonts
         are data-identity, not style choices. */
      .t-pokedex, .t-gameboy { font-family: var(--font-mono, ui-monospace, Menlo, monospace); /* identity */ }
      .t-pokedex .name, .t-gameboy .name { text-transform: uppercase; }
      .t-pokedex .sbar, .t-gameboy .sbar { border-radius: 0; }
      .t-pokedex .no,   .t-gameboy .no   { font-size: min(3.4cqw, 5.5cqh); }
      .t-pokedex .name, .t-gameboy .name { font-size: min(5cqw, 8cqh); line-height: 1.2;
                                           letter-spacing: 0.04em;
                                           flex: 0 1 auto; min-width: 0; }
      .t-pokedex .genus, .t-gameboy .genus { font-size: min(3.2cqw, 5.5cqh);
                                             flex: 0 1000 auto; min-width: 0;
                                             overflow: hidden; text-overflow: ellipsis; }
      .t-pokedex .slbl, .t-gameboy .slbl { font-size: min(2.4cqw, 3.2cqh); width: 13cqw; }
      .t-pokedex .sval, .t-gameboy .sval { font-size: min(2.8cqw, 3.8cqh); width: 10cqw; }
      .t-pokedex .srow, .t-gameboy .srow { line-height: 1.1; }
      .t-pokedex .type, .t-gameboy .type { font-size: min(2.4cqw, 4cqh);
                                           letter-spacing: 0.08em; border-radius: 0.6cqmin; }
      .t-pokedex .stats, .t-gameboy .stats { min-height: 0; overflow: hidden;
                                             gap: 1cqmin; justify-content: center; }
      .hw { display: flex; gap: 3cqmin; font-size: min(2.6cqw, 4cqh);
            font-variant-numeric: tabular-nums; }
      .hw span { white-space: nowrap; }

      /* ---- pokedex (classic red device) ---- */
      .t-pokedex { background: #d5202f; color: #1a1a1a; } /* identity */
      .dex { width: 100%; height: 100%; display: flex; flex-direction: column;
             padding: 2.5cqmin 3cqmin 3cqmin; gap: 2cqmin; overflow: hidden; }
      .dex-top { display: flex; align-items: center; gap: 2cqmin; flex: 0 0 auto; }
      .lens { width: 8cqmin; height: 8cqmin; border-radius: 50%; flex: 0 0 auto;
              border: 1cqmin solid #f2f2f2; box-sizing: content-box; /* identity */
              background: radial-gradient(circle at 32% 30%,
                #cfe8ff 0%, #cfe8ff 16%, #3f7fdd 45%, #14336e 100%); } /* identity */
      .led { width: 2.6cqmin; height: 2.6cqmin; border-radius: 50%; flex: 0 0 auto;
             border: 0.5cqmin solid rgba(0,0,0,0.4); box-sizing: border-box; } /* identity */
      .led.r { background: #ff5148; } .led.y { background: #ffd23c; } /* identity */
      .led.g { background: #4cd964; } /* identity */
      .dex-title { margin-left: auto; color: #fff; font-weight: 800; /* identity */
                   letter-spacing: 0.14em; font-size: min(3.2cqw, 5cqh); }
      .bezel { flex: 1; min-height: 0; background: #efe6d2; /* identity */
               border-radius: 2cqmin 2cqmin 2cqmin 7cqmin;
               padding: 2.5cqmin 2.5cqmin 3.5cqmin; display: flex;
               box-shadow: inset 0 0 0 0.6cqmin #b9ad91; } /* identity */
      .screen { flex: 1; min-width: 0; background: #fbfaf4; /* identity */
                border: 0.6cqmin solid #2b2b2b; border-radius: 1cqmin; /* identity */
                display: flex; flex-direction: column;
                padding: 2.5cqmin 3cqmin; gap: 1.6cqmin; overflow: hidden; }
      .t-pokedex .no { color: #86122a; font-weight: 800; } /* identity */
      .t-pokedex .genus { color: #555; } /* identity */
      .t-pokedex .slbl { color: #444; } /* identity */
      .t-pokedex .hw { color: #444; } /* identity */
      .t-pokedex .sbar { background: #ddd5c0; box-shadow: inset 0 0 0 0.4cqmin #2b2b2b; } /* identity */
      .t-pokedex .sfill { background: #d5202f; } /* identity */
      .t-pokedex .type { background: #fbfaf4; border: 0.5cqmin solid #2b2b2b; color: #1a1a1a; } /* identity */
      .flavor-screen { flex: 0 0 auto; background: #10251a; /* identity */
                       border-radius: 1.2cqmin; padding: 2cqmin 3cqmin; overflow: hidden;
                       box-shadow: inset 0 0 0 0.5cqmin #000; } /* identity */
      .fs-text { color: #7dff9c; font-size: min(4cqw, 5.5cqh); line-height: 1.3; /* identity */
                 display: -webkit-box; -webkit-line-clamp: 2;
                 -webkit-box-orient: vertical; overflow: hidden; }

      /* ---- gameboy (mono green handheld) ---- */
      .t-gameboy { background: #8bac0f; color: #0f380f; } /* identity */
      .gb { width: 100%; height: 100%; display: flex; flex-direction: column;
            padding: 3cqmin; gap: 1.6cqmin; overflow: hidden;
            border: 1.4cqmin solid #0f380f; box-sizing: border-box; } /* identity */
      .gb-title { display: flex; align-items: baseline; gap: 2cqmin;
                  border-bottom: 0.8cqmin solid #0f380f; padding-bottom: 1.2cqmin; } /* identity */
      .t-gameboy .no { color: #306230; font-weight: 800; } /* identity */
      .t-gameboy .name { color: #0f380f; } /* identity */
      .t-gameboy .genus { color: #306230; font-size: min(3.2cqw, 5.5cqh); } /* identity */
      .t-gameboy .slbl, .t-gameboy .sval { color: #0f380f; } /* identity */
      .t-gameboy .sbar { background: #cadc9f; box-shadow: inset 0 0 0 0.4cqmin #0f380f; } /* identity */
      .t-gameboy .sfill { background: #0f380f; } /* identity */
      .t-gameboy .type { background: #0f380f; color: #9bbc0f; } /* identity */
      .t-gameboy .flavor { color: #0f380f; border-top: 0.8cqmin solid #0f380f; /* identity */
                           padding-top: 1.2cqmin; font-size: min(3.2cqw, 5.5cqh); }
      .t-gameboy .sprite { filter: grayscale(1) contrast(1.15); }
      .t-gameboy .hw { color: #306230; } /* identity */

      /* themed fragments reuse tile/head/stats with theme colors */
      .t-pokedex .tile { background: #efe6d2; /* identity */
                         box-shadow: inset 0 0 0 0.6cqmin #b9ad91; } /* identity */
      .t-pokedex .tile-label { font-size: min(3.5cqw, 6cqh); }
      .t-gameboy .tile { background: #cadc9f; border-radius: 0; /* identity */
                         box-shadow: inset 0 0 0 0.8cqmin #0f380f; } /* identity */

      /* tall cells have room: let the dex text breathe */
      @container (orientation: portrait) {
        .fs-text, .t-gameboy .flavor { -webkit-line-clamp: 4; }
      }
      /* Dex text: Full entry lifts the line clamp; the row above shrinks
         (.mid is flex: 1 with min-height: 0) to give the text its room. */
      .dex-full .flavor, .dex-full .fs-text { display: block; -webkit-line-clamp: unset;
                                              overflow: visible; }
      .dex-full .flavor-screen { overflow: visible; }
      /* The dex screen's green text is the largest; at full length it takes
         the Game Boy size so the stats keep a row. The squeezed row clips
         instead of spilling over the name, and safe centring keeps the
         first stat in view when they no longer all fit. */
      .dex-full .fs-text { font-size: min(3.2cqw, 4.4cqh); }
      .dex-full .mid { overflow: hidden; align-items: stretch; }
      .dex-full .sprite { align-self: center; }
      .dex-full .stats { justify-content: safe center; }

      /* tight cells: drop the wordy bits before they overflow */
      @container (max-height: 130px) {
        .flavor, .flavor-screen, .genus, .hw { display: none; }
      }
    </style>`;

  const dexText = o.dex_text === "full" || o.dex_text === "off" ? o.dex_text : "short";

  const wrap = (inner, cls) => {
    const all = [cls, dexText === "full" ? "dex-full" : ""].filter(Boolean).join(" ");
    shadow.innerHTML = `${styles}<div class="w${all ? " " + all : ""}">${inner}</div>`;
  };
  const themeCls = themed ? `t-${theme}` : "";

  if (d.error) {
    wrap(`<div class="body"><div class="empty">${esc(d.error)}</div></div>`, themeCls);
    return;
  }

  const img = (o.show_art ? d.sprite_art : d.sprite_pixel) || d.sprite_art || d.sprite_pixel;
  const flavor = dexText === "off" ? "" : d.flavor;
  const no = d.id ? "#" + String(d.id).padStart(3, "0") : "";
  const dexNo = d.id ? "Nº" + String(d.id).padStart(3, "0") : "";
  const statsHtml = STAT_ROWS.map(([k, label]) => {
    const v = (d.stats || {})[k] ?? 0;
    const pct = Math.min(100, Math.round((v / STAT_MAX) * 100));
    return (
      `<div class="srow"><span class="slbl">${label}</span>` +
      `<span class="sbar"><span class="sfill" style="width:${pct}%"></span></span>` +
      `<span class="sval">${v}</span></div>`
    );
  }).join("");
  const typesHtml = (d.types || [])
    .map((t) => `<span class="type">${esc(t)}</span>`)
    .join("");
  const spriteHtml = img ? `<img class="sprite" src="${esc(img)}" alt="" />` : "";

  if (fragment === "sprite") {
    wrap(
      `<div class="body"><div class="tile">${spriteHtml}` +
        `<div class="tile-label">${esc(d.name || "")} ${no}</div></div></div>`,
      themeCls
    );
    return;
  }
  if (fragment === "stats") {
    wrap(
      `<div class="body"><div class="head"><span class="name">${esc(d.name || "")}</span>` +
        `<span class="no">${themed ? dexNo : no}</span></div>` +
        `<div class="stats">${statsHtml}</div></div>`,
      themeCls
    );
    return;
  }

  const hwHtml =
    d.height_m || d.weight_kg
      ? `<div class="hw"><span>HT ${esc(d.height_m)}m</span>` +
        `<span>WT ${esc(d.weight_kg)}kg</span></div>`
      : "";

  if (theme === "pokedex") {
    wrap(
      `<div class="dex">` +
        `<div class="dex-top"><span class="lens"></span>` +
        `<span class="led r"></span><span class="led y"></span><span class="led g"></span>` +
        `<span class="dex-title">POKÉDEX</span></div>` +
        `<div class="bezel"><div class="screen">` +
        `<div class="head"><span class="no">${dexNo}</span>` +
        `<span class="name">${esc(d.name || "")}</span>` +
        (d.genus ? `<span class="genus">${esc(d.genus)}</span>` : "") +
        `</div>` +
        `<div class="mid">${spriteHtml}<div class="stats">${statsHtml}</div></div>` +
        `<div class="head" style="gap:2cqmin"><div class="types">${typesHtml}</div>` +
        `<span style="margin-left:auto"></span>${hwHtml}</div>` +
        (flavor
          ? `<div class="flavor-screen"><div class="fs-text">${esc(flavor)}</div></div>`
          : "") +
        `</div></div></div>`,
      themeCls
    );
    return;
  }

  if (theme === "gameboy") {
    wrap(
      `<div class="gb">` +
        `<div class="gb-title"><span class="no">${dexNo}</span>` +
        `<span class="name">${esc(d.name || "")}</span>` +
        (d.genus ? `<span class="genus">${esc(d.genus)}</span>` : "") +
        `</div>` +
        `<div class="mid">${spriteHtml}<div class="stats">${statsHtml}</div></div>` +
        `<div class="head" style="gap:2cqmin"><div class="types">${typesHtml}</div>` +
        `<span style="margin-left:auto"></span>${hwHtml}</div>` +
        (flavor ? `<div class="flavor">${esc(flavor)}</div>` : "") +
        `</div>`,
      themeCls
    );
    return;
  }

  wrap(
    `<div class="body">` +
      `<div class="head"><span class="no">${no}</span>` +
      `<span class="name">${esc(d.name || "")}</span>` +
      (d.genus ? `<span class="genus">${esc(d.genus)}</span>` : "") +
      `</div>` +
      `<div class="mid">${spriteHtml}<div class="stats">${statsHtml}</div></div>` +
      `<div class="types">${typesHtml}</div>` +
      (flavor ? `<div class="flavor">${esc(flavor)}</div>` : "") +
      `</div>`,
    themeCls
  );
}
