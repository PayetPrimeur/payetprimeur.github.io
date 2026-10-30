/* Téléchargement de la recette en PDF (Payet Primeur) */
(function () {
  const btn = document.getElementById("pdf-btn");
  const msg = document.getElementById("pdf-msg");
  const data = JSON.parse(document.getElementById("recette").textContent);
  if (!btn || !window.jspdf) { if (btn) btn.parentNode.hidden = true; return; }
  btn.disabled = false;

  const T = s => String(s ?? "").replace(/œ/g, "oe").replace(/Œ/g, "OE").replace(/[’]/g, "'").replace(/…/g, "...");
  const toDataUrl = (src, type) => new Promise((ok, ko) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext("2d").drawImage(img, 0, 0); ok({ url: c.toDataURL(type, .85), w: c.width, h: c.height }); };
    img.onerror = ko; img.src = src;
  });
  const slug = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function build() {
    const { jsPDF } = window.jspdf;
    const r = data.recette;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 18, W = 210 - 2 * M, PH = 297;
    const FR = [182, 17, 92], INK = [58, 42, 34], MUT = [122, 106, 95], VERT = [90, 120, 39];
    let y = 16;
    const color = c => doc.setTextColor(...c);
    const ensure = h => { if (y + h > PH - 18) { doc.addPage(); y = 18; } };
    try { const logo = await toDataUrl("../logo.png", "image/png"); doc.addImage(logo.url, "PNG", M, y, 52, 52 * logo.h / logo.w); } catch (e) {}
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); color(MUT);
    doc.text("Recette de la semaine", 210 - M, y + 5, { align: "right" });
    doc.text(T(data.semaine), 210 - M, y + 10, { align: "right" });
    y += 24;
    doc.setFont("helvetica", "bold"); doc.setFontSize(28); color(FR); doc.text(T(data.nom), M, y); y += 3;
    doc.setDrawColor(249, 176, 15); doc.setLineWidth(1.2); doc.line(M, y, M + 40, y); y += 8;
    if (data.photo && data.photo.src) {
      try {
        const im = await toDataUrl(data.photo.src, "image/jpeg"); const ih = Math.min(W * im.h / im.w, 90);
        doc.addImage(im.url, "JPEG", M, y, W, ih); y += ih + 3;
        if (data.photo.credit) { doc.setFontSize(7.5); color(MUT); doc.text(T(`Photo : ${data.photo.credit} sur Unsplash`), M, y + 1); y += 5; }
        y += 3;
      } catch (e) {}
    }
    doc.setFont("helvetica", "bold"); doc.setFontSize(17); color(INK);
    const t = doc.splitTextToSize(T(r.titre), W); doc.text(t, M, y); y += t.length * 7 + 1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); color(MUT);
    const intro = doc.splitTextToSize(T(r.intro), W); doc.text(intro, M, y); y += intro.length * 5 + 4;
    doc.setFontSize(10); color(INK);
    const meta = [r.prep && `Préparation ${r.prep}`, r.cuisson && `Cuisson ${r.cuisson}`,
      `Pour ${r.pers}${/^\d+$/.test(r.pers) ? " personnes" : ""}`, r.niveau].filter(Boolean).join("   ·   ");
    doc.setDrawColor(234, 223, 206); doc.setLineWidth(0.4); doc.setLineDashPattern([1.2, 1.2], 0); doc.rect(M, y - 5, W, 9); doc.setLineDashPattern([], 0);
    doc.text(T(meta), M + 3, y + 0.8); y += 13;
    const heading = s => { ensure(12); doc.setFont("helvetica", "bold"); doc.setFontSize(10); color(VERT); doc.text(s.toUpperCase(), M, y, { charSpace: 0.6 }); y += 6; };
    heading("La liste de courses");
    r.ingredients.forEach(([q, n, ref]) => {
      ensure(7); doc.setFontSize(10.5);
      doc.setDrawColor(...(ref ? FR : MUT)); doc.setLineWidth(0.4); doc.rect(M, y - 3.2, 3.6, 3.6);
      let x = M + 7;
      if (q) { doc.setFont("helvetica", "bold"); color(INK); doc.text(T(q), x, y); x += doc.getTextWidth(T(q)) + 1.8; }
      doc.setFont("helvetica", "normal"); color(INK); doc.text(T(n), x, y);
      if (ref) { x += doc.getTextWidth(T(n)) + 2; doc.setFont("helvetica", "italic"); color(FR); doc.text("chez nous", x, y); }
      y += 6.4;
    });
    y += 4; heading("La préparation");
    r.etapes.forEach((s, i) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5);
      const lines = doc.splitTextToSize(T(s), W - 10); ensure(lines.length * 5 + 3);
      doc.setFont("helvetica", "bold"); doc.setFontSize(13); color(FR); doc.text(`${i + 1}.`, M, y + 0.5);
      doc.setFont("helvetica", "normal"); doc.setFontSize(10.5); color(INK); doc.text(lines, M + 10, y);
      y += lines.length * 5 + 3;
    });
    y += 4; doc.setFontSize(10.5);
    const tip = doc.splitTextToSize(T(r.conseil), W - 12); const th = tip.length * 5 + 13; ensure(th);
    doc.setFillColor(255, 243, 207); doc.rect(M, y, W, th, "F"); doc.setFillColor(249, 176, 15); doc.rect(M, y, 1.8, th, "F");
    doc.setFont("helvetica", "bold"); color([164, 28, 41]); doc.text("Le conseil du primeur", M + 6, y + 7);
    doc.setFont("helvetica", "normal"); color(INK); doc.text(tip, M + 6, y + 13);
    doc.setFontSize(8.5); color(MUT);
    doc.text(T("Payet Primeur · Saint-Selve & Villenave-d'Ornon · Une nouvelle recette chaque dimanche"), 105, PH - 10, { align: "center" });
    return doc;
  }

  btn.addEventListener("click", async () => {
    btn.disabled = true; msg.textContent = "Préparation du PDF…";
    try { (await build()).save(`recette-${slug(data.nom)}-payet-primeur.pdf`); msg.textContent = "Recette téléchargée, bonne cuisine !"; }
    catch (e) { msg.textContent = "Le PDF n'a pas pu être créé. Rechargez la page puis réessayez."; }
    finally { btn.disabled = false; }
  });
})();
