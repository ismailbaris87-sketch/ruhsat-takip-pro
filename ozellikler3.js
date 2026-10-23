/* Ruhsat Takip Pro — eklenti 3: hızlı filtreler, müşteri sayfası, evrak şablonları,
   tahsilat makbuz mesajı, aylık özet. ozellikler2.js'den SONRA yüklenmelidir. */
(function () {
  const style = document.createElement("style");
  style.textContent = `
    .chips{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
    .chip{border:1px solid #c9d8d1;background:#fff;border-radius:16px;padding:6px 12px;font-size:.85rem}
    .chip.on{background:#173b35;color:#fff;border-color:#173b35}
    #clientPage{width:min(94vw,520px);max-height:88vh;border:0;border-radius:16px;padding:16px}
    #clientPage::backdrop{background:rgba(0,0,0,.4)}
    #clientPage h3{margin:14px 0 6px;font-size:1rem}
    #monthPick{margin:6px 0}
  `;
  document.head.appendChild(style);

  /* ---------- Yardımcılar ---------- */
  const fmtDate = s => (s ? String(s).slice(0, 10).split("-").reverse().join(".") : "");

  function daysUntil(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    const n = new Date();
    const diff = Math.round((new Date(y, m - 1, d) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  function phoneDigits(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "90" + d.slice(1);
    else if (d.length === 10) d = "90" + d;
    return d;
  }

  const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const paidFor = f => sum(db.transactions.filter(t => t.kind === "Tahsilat" && t.file_id === f.id), t => t.amount);
  const leftFor = f => Math.max(0, (Number(f.fee) || 0) - paidFor(f));
  const localMonth = () => { const n = new Date(); return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0"); };

  /* ---------- 2) Hızlı filtreler ---------- */
  let quick = "";

  const QUICK = {
    "": () => true,
    expiring: f => { const d = daysUntil(f.expiry_date); return d !== null && d <= 30; },
    missing: f => f.status !== "Tamamlandı" && ((f.checklist || []).some(x => !x.done) || f.status === "Eksik evrak"),
    debt: f => leftFor(f) > 0
  };

  const CHIPS = [["", "Tümü"], ["expiring", "Süresi yaklaşan"], ["missing", "Eksik evraklı"], ["debt", "Borcu olan"]];

  function mountChips() {
    if ($("#quickChips") || !$("#filesList")) return;

    const row = document.createElement("div");
    row.id = "quickChips";
    row.className = "chips";
    row.innerHTML = CHIPS.map(([k, label]) => `<button type="button" class="chip" data-quick="${k}">${label}</button>`).join("");
    $("#filesList").before(row);

    row.addEventListener("click", e => {
      const b = e.target.closest("[data-quick]");
      if (!b) return;
      quick = b.dataset.quick;
      render();
    });
  }

  function applyQuick() {
    $$("#quickChips .chip").forEach(b => b.classList.toggle("on", b.dataset.quick === quick));
    if (!quick || !$("#filesList")) return;

    const q = ($("#fileSearch")?.value || "").toLocaleLowerCase("tr");
    const st = $("#fileStatusFilter")?.value || "";

    const list = db.files.filter(f =>
      (!st || f.status === st) &&
      (f.title + " " + getClientName(f.client_id) + " " + f.address).toLocaleLowerCase("tr").includes(q) &&
      QUICK[quick](f)
    );

    $("#filesList").innerHTML = list.length ? list.map(fileCard).join("") : empty("Bu filtreye uyan dosya yok.");
  }

  /* arama kutusu eski render'ı çağırdığı için filtreyi yeniden uygula */
  $("#fileSearch")?.addEventListener("input", applyQuick);
  $("#fileStatusFilter")?.addEventListener("change", applyQuick);

  /* ---------- 3) Müşteri sayfası ---------- */
  const dlg = document.createElement("dialog");
  dlg.id = "clientPage";
  document.body.appendChild(dlg);

  function openClientPage(id) {
    const c = db.clients.find(x => x.id === id);
    if (!c) return;

    const files = db.files.filter(f => f.client_id === id);
    const ids = new Set(files.map(f => f.id));
    const pays = db.transactions
      .filter(t => t.kind === "Tahsilat" && ids.has(t.file_id))
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const fee = sum(files, f => f.fee);
    const paid = sum(pays, t => t.amount);
    const ph = phoneDigits(c.phone);

    dlg.innerHTML = `
      <div class="dialog-head"><h2>${esc(c.name)}</h2><button type="button" class="icon-btn cp-close" aria-label="Kapat">×</button></div>
      <p class="subline">${esc(c.business || "")}${c.phone ? " · " + esc(c.phone) : ""}</p>
      <div class="metric-grid">
        <article class="metric"><span>Toplam bedel</span><strong>${money(fee)}</strong></article>
        <article class="metric"><span>Tahsil edilen</span><strong>${money(paid)}</strong></article>
        <article class="metric"><span>Kalan</span><strong>${money(Math.max(0, fee - paid))}</strong></article>
      </div>
      ${ph ? `<div class="item-actions"><a class="small-btn" href="tel:+${ph}">Ara</a><a class="small-btn wa" href="https://wa.me/${ph}" target="_blank" rel="noopener">WhatsApp</a></div>` : ""}
      <h3>Dosyalar (${files.length})</h3>
      ${files.length ? files.map(f => `<article class="list-item">
        <div class="list-top"><div class="list-title">${esc(f.title)}</div><span class="pill ${statusClass(f.status)}">${esc(f.status)}</span></div>
        <div class="subline">Kalan ${money(leftFor(f))}</div>
        <div class="item-actions"><button class="small-btn" data-edit="file" data-id="${f.id}">Dosyayı aç</button></div>
      </article>`).join("") : empty("Bu müşteriye bağlı dosya yok.")}
      <h3>Son tahsilatlar</h3>
      ${pays.length ? pays.slice(0, 5).map(t => `<div class="subline">${fmtDate(t.date)} · ${money(t.amount)}${t.notes ? " · " + esc(t.notes) : ""}</div>`).join("") : empty("Tahsilat kaydı yok.")}
    `;

    dlg.showModal();
  }

  dlg.addEventListener("click", e => {
    if (e.target === dlg || e.target.closest(".cp-close") || e.target.closest("[data-edit]")) dlg.close();
  });

  const _clientCard = clientCard;
  clientCard = function (c) {
    return _clientCard(c).replace('<div class="item-actions">', () =>
      `<div class="item-actions"><button class="small-btn open-client" data-id="${c.id}">Müşteri sayfası</button>`);
  };

  document.addEventListener("click", e => {
    const b = e.target.closest(".open-client");
    if (b) openClientPage(b.dataset.id);
  });

  /* ---------- 4) Evrak şablonları ---------- */
  const TEMPLATES = {
    "İşyeri açma ruhsatı": [
      "Başvuru dilekçesi",
      "Kimlik / şirket evrakları (imza sirküleri, sicil)",
      "Vergi levhası",
      "Tapu veya kira sözleşmesi",
      "Yapı kullanma izin belgesi (iskân)",
      "Yangın güvenliği uygunluk belgesi",
      "Faaliyete özel izin ve raporlar"
    ],
    "İnşaat ruhsatı / iskân": [
      "Başvuru dilekçesi",
      "Kimlik / vekâlet belgesi",
      "Tapu kaydı",
      "İmar durumu belgesi",
      "Mimari, statik, elektrik ve mekanik projeler",
      "Zemin etüt raporu",
      "Yapı denetim ve fenni mesul belgeleri"
    ],
    "İmar ve evrak takibi": [
      "Başvuru dilekçesi",
      "Kimlik / vekâlet belgesi",
      "Tapu kaydı",
      "İmar durumu / çap belgesi",
      "Kurum yazıları ve cevapları"
    ]
  };

  function applyTemplate(type) {
    const items = $("#formFields .checklist-items");
    const list = TEMPLATES[type];
    if (!items || !list) return;

    items.innerHTML = list.map((title, i) => `<label class="check-row">
      <input type="checkbox" name="check_${i}">
      <input type="hidden" name="checktitle_${i}" value="${esc(title)}">
      <span>${esc(title)}</span>
    </label>`).join("");
  }

  const _openForm = openForm;
  openForm = function (mode, id) {
    _openForm(mode, id);
    if (mode !== "file" || id) return;

    const sel = $('#formFields select[name="type"]');
    if (!sel) return;

    applyTemplate(sel.value);
    sel.addEventListener("change", () => applyTemplate(sel.value));
  };

  /* ---------- 5) Tahsilat makbuz mesajı ---------- */
  const _txCard = txCard;
  txCard = function (t) {
    const html = _txCard(t);
    if (t.kind !== "Tahsilat" || !t.file_id) return html;

    const f = db.files.find(x => x.id === t.file_id);
    const c = f && db.clients.find(x => x.id === f.client_id);
    const ph = phoneDigits(c?.phone);
    if (!ph) return html;

    const msg = `Merhaba ${c.name}, ${f.title} dosyası için ${money(t.amount)} tahsil edildi (${fmtDate(t.date)}). Toplam bedel ${money(f.fee)}, tahsil edilen ${money(paidFor(f))}, kalan ${money(leftFor(f))}. Teşekkürler.`;

    return html.replace('<div class="item-actions">', () =>
      `<div class="item-actions"><a class="small-btn wa" href="https://wa.me/${ph}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Makbuz mesajı</a>`);
  };

  /* ---------- 6) Aylık özet ---------- */
  let monthSel = localMonth();

  function monthData() {
    const inM = t => (t.date || "").startsWith(monthSel);
    const col = db.transactions.filter(t => t.kind === "Tahsilat" && inM(t));
    const exp = db.transactions.filter(t => t.kind === "Gider" && inM(t));
    const opened = db.files.filter(f => (f.created_at || "").startsWith(monthSel));
    const cats = {};

    exp.forEach(t => { const k = t.category || "Genel"; cats[k] = (cats[k] || 0) + Number(t.amount || 0); });

    return {
      opened: opened.length,
      done: opened.filter(f => f.status === "Tamamlandı").length,
      collected: sum(col, t => t.amount),
      expenses: sum(exp, t => t.amount),
      cats
    };
  }

  const monthTitle = () =>
    new Date(+monthSel.slice(0, 4), +monthSel.slice(5, 7) - 1, 1).toLocaleDateString("tr-TR", { month: "long", year: "numeric" });

  function renderMonth() {
    const body = $("#monthBody");
    if (!body) return;

    const m = monthData();
    const catLines = Object.entries(m.cats).map(([k, v]) => `<div class="subline">${esc(k)}: ${money(v)}</div>`).join("");

    body.innerHTML = `
      <div class="subline">Açılan dosya: <b>${m.opened}</b> (bunlardan tamamlanan: ${m.done})</div>
      <div class="subline">Tahsilat: <b>${money(m.collected)}</b> · Gider: <b>${money(m.expenses)}</b></div>
      <div class="subline">Yaklaşık net: <b>${money(m.collected - m.expenses)}</b></div>
      ${catLines ? `<div class="subline"><b>Giderler</b></div>${catLines}` : ""}`;
  }

  async function shareMonth() {
    const m = monthData();
    const text = [
      `Ruhsat Takip Pro — ${monthTitle()} özeti`,
      `Açılan dosya: ${m.opened} (tamamlanan: ${m.done})`,
      `Tahsilat: ${money(m.collected)}`,
      `Gider: ${money(m.expenses)}`,
      `Yaklaşık net: ${money(m.collected - m.expenses)}`,
      ...Object.entries(m.cats).map(([k, v]) => `  ${k}: ${money(v)}`)
    ].join("\n");

    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast("Özet kopyalandı.");
    } catch {
      toast("Özet paylaşılamadı.");
    }
  }

  function mountMonth() {
    if ($("#monthCard")) return;
    const grid = $("#view-money .metric-grid");
    if (!grid) return;

    const card = document.createElement("div");
    card.id = "monthCard";
    card.className = "card";
    card.innerHTML = `<h2>Aylık özet</h2>
      <input type="month" id="monthPick" value="${monthSel}">
      <div id="monthBody"></div>
      <div class="item-actions"><button type="button" class="small-btn" id="monthShare">Özeti paylaş</button></div>`;
    grid.after(card);

    $("#monthPick").addEventListener("change", e => {
      monthSel = e.target.value || monthSel;
      renderMonth();
    });
    $("#monthShare").addEventListener("click", shareMonth);
  }

  /* ---------- Render bağlama ---------- */
  const _render = render;
  render = function () {
    _render();
    mountChips();
    applyQuick();
    mountMonth();
    renderMonth();
  };

  render();
})();
