/* Ruhsat Takip Pro — eklenti 2: yedekleme, dosya bakiyesi, takip tarihi uyarıları.
   index.html içinde ozellikler.js'den SONRA yüklenmelidir. */
(function () {
  const BACKUP_KEY = "rtp_last_backup";
  const TABLES = ["clients", "files", "tasks", "transactions"];

  /* ---------- Yardımcılar ---------- */
  const fmtDate = s => (s ? String(s).slice(0, 10).split("-").reverse().join(".") : "");

  function daysUntil(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    const n = new Date();
    const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const diff = Math.round((new Date(y, m - 1, d) - t) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  function localDate() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  function phoneDigits(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "90" + d.slice(1);
    else if (d.length === 10) d = "90" + d;
    return d;
  }

  const lastBackup = () => {
    try { return localStorage.getItem(BACKUP_KEY) || ""; } catch { return ""; }
  };

  /* ---------- 2) Dosya bakiyesi + ödeme hatırlatma ---------- */
  function paidFor(f) {
    return db.transactions
      .filter(t => t.kind === "Tahsilat" && t.file_id === f.id)
      .reduce((a, t) => a + Number(t.amount || 0), 0);
  }

  function payHref(f, left) {
    const c = db.clients.find(x => x.id === f.client_id);
    const ph = phoneDigits(c?.phone);
    if (!ph) return "";

    const msg = `Merhaba ${c.name}, ${f.title} dosyanız için kalan hizmet bedeli ${money(left)}. Uygun olduğunuzda ödeme yapabilirseniz sevinirim. Teşekkürler.`;
    return `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
  }

  const _fileCard = fileCard;
  fileCard = function (f) {
    const html = _fileCard(f);
    const fee = Number(f.fee) || 0;
    const paid = paidFor(f);
    if (!fee && !paid) return html;

    const left = Math.max(0, fee - paid);
    const line = `<div class="subline">Bedel ${money(fee)} · Tahsil ${money(paid)} · <b>Kalan ${money(left)}</b></div>`;
    const href = left > 0 ? payHref(f, left) : "";
    const btn = href
      ? `<a class="small-btn wa" href="${href}" target="_blank" rel="noopener">Ödeme hatırlat</a>`
      : "";

    return html.replace('<div class="item-actions">', () => line + '<div class="item-actions">' + btn);
  };

  /* ---------- 1) Yedekle / geri yükle ---------- */
  function markBackup() {
    try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch {}
    render();
  }

  async function exportBackup() {
    const payload = {
      app: "ruhsat-takip-pro",
      version: 1,
      exported_at: new Date().toISOString(),
      data: Object.fromEntries(TABLES.map(t => [t, db[t]]))
    };

    const name = `ruhsat-takip-yedek-${localDate()}.json`;
    const file = new File([JSON.stringify(payload, null, 2)], name, { type: "application/json" });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
        markBackup();
        return;
      }
    } catch (e) {
      if (e.name === "AbortError") return;
    }

    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markBackup();
  }

  async function importBackup(file) {
    try {
      const json = JSON.parse(await file.text());
      const data = json.data || json;

      if (!TABLES.some(t => Array.isArray(data[t]))) throw new Error("format");

      const total = TABLES.reduce((n, t) => n + (Array.isArray(data[t]) ? data[t].length : 0), 0);

      if (!confirm(`Yedekte ${total} kayıt var. Aynı kayıtlar güncellenir, yeniler eklenir; mevcut kayıtların hiçbiri silinmez. Devam edilsin mi?`)) return;

      TABLES.forEach(t => {
        (Array.isArray(data[t]) ? data[t] : []).forEach(row => {
          if (!row || !row.id) return;
          const i = db[t].findIndex(x => x.id === row.id);
          if (i >= 0) db[t][i] = row;
          else db[t].push(row);
        });
      });

      saveLocal();
      toast("Yedek yüklendi.");
    } catch {
      toast("Yedek dosyası okunamadı.");
    }
  }

  function mountBackupCard() {
    if ($("#backupCard")) return;

    const card = document.createElement("div");
    card.id = "backupCard";
    card.className = "card";
    card.innerHTML = `<h2>Yedek</h2>
      <p id="backupInfo" class="subline"></p>
      <div class="item-actions">
        <button type="button" class="small-btn" id="backupExport">Yedeği indir</button>
        <button type="button" class="small-btn" id="backupImportBtn">Yedekten geri yükle</button>
        <input type="file" id="backupImport" accept="application/json,.json" hidden>
      </div>`;

    const home = $("#view-home");
    const note = home?.querySelector(".footnote");
    if (note) note.before(card);
    else home?.appendChild(card);

    $("#backupExport").addEventListener("click", exportBackup);
    $("#backupImportBtn").addEventListener("click", () => $("#backupImport").click());
    $("#backupImport").addEventListener("change", e => {
      const f = e.target.files[0];
      if (f) importBackup(f);
      e.target.value = "";
    });
  }

  /* ---------- 3) Takip tarihi + yedek uyarıları ---------- */
  function buildAlerts2() {
    const out = [];

    db.files.forEach(f => {
      if (f.status === "Tamamlandı" || !f.due_date) return;
      const d = daysUntil(f.due_date);

      if (d !== null && d <= 0) {
        out.push({
          level: d < 0 ? "danger" : "warn",
          rank: d,
          label: "Takip",
          title: f.title,
          sub: getClientName(f.client_id),
          file: f,
          text: d < 0
            ? `Takip tarihi ${-d} gün önce geçti (${fmtDate(f.due_date)})`
            : "Takip tarihi bugün"
        });
      }
    });

    out.sort((a, b) => (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1) || a.rank - b.rank);

    const total = TABLES.reduce((n, t) => n + db[t].length, 0);
    const last = lastBackup();
    const age = last ? Math.floor((Date.now() - new Date(last)) / 86400000) : null;

    if (!sessionUser && total > 0 && (age === null || age > 14)) {
      out.push({
        level: "warn",
        rank: 2000,
        label: "Yedek",
        title: "Yedek zamanı",
        sub: "",
        text: age === null ? "Henüz yedek alınmadı." : `Son yedek ${age} gün önce alındı.`
      });
    }

    return out;
  }

  function card2(a) {
    return `<article class="list-item">
      <div class="list-top">
        <div>
          <div class="list-title">${esc(a.title)}</div>
          <div class="subline">${esc(a.sub || "")}</div>
        </div>
        <span class="pill ${a.level}">${a.label}</span>
      </div>
      <div class="subline">${esc(a.text)}</div>
      <div class="item-actions">${
        a.file
          ? `<button class="small-btn" data-edit="file" data-id="${a.file.id}">Dosyayı aç</button>`
          : `<button class="small-btn bk-now">Şimdi yedekle</button>`
      }</div>
    </article>`;
  }

  function mountBoxes() {
    if (!$("#autoAlerts2Home")) {
      const first = $("#autoAlertsHome");
      const anchor = first || $("#upcomingList")?.closest(".card");

      if (anchor) {
        const box = document.createElement("div");
        box.id = "autoAlerts2Home";
        box.className = "card";
        if (first) first.after(box);
        else anchor.before(box);
      }
    }

    if (!$("#autoAlerts2Tasks")) {
      const first = $("#autoAlertsTasks");
      const anchor = first || $("#tasksList");

      if (anchor) {
        const box = document.createElement("div");
        box.id = "autoAlerts2Tasks";
        box.className = "card";
        if (first) first.after(box);
        else anchor.before(box);
      }
    }
  }

  function fillBox(box, list, limit) {
    if (!box) return;

    if (!list.length) {
      box.style.display = "none";
      box.innerHTML = "";
      return;
    }

    const shown = limit ? list.slice(0, limit) : list;
    box.style.display = "";
    box.innerHTML = `<div class="section-head"><h2>Takip ve yedek</h2>${
      limit && list.length > limit
        ? `<button class="text-btn auto-goto2">Tümü (${list.length})</button>`
        : ""
    }</div><div class="list">${shown.map(card2).join("")}</div>`;
  }

  function renderExtra() {
    mountBackupCard();
    mountBoxes();

    const alerts = buildAlerts2();
    fillBox($("#autoAlerts2Home"), alerts, 3);
    fillBox($("#autoAlerts2Tasks"), alerts, 0);

    const tab = $('.tab[data-tab="tasks"]');
    if (tab) {
      const n = (Number(tab.querySelector(".tab-badge")?.textContent) || 0) + alerts.length;
      tab.innerHTML = "Hatırlatmalar" + (n ? `<span class="tab-badge">${n}</span>` : "");
    }

    const info = $("#backupInfo");
    if (info) {
      const last = lastBackup();
      info.textContent = last
        ? `Son yedek: ${fmtDate(last.slice(0, 10))}. Yedeği indirince “Dosyalara Kaydet” seç.`
        : "Henüz yedek alınmadı. Yedeği indirince “Dosyalara Kaydet” seç.";
    }
  }

  const _render = render;
  render = function () {
    _render();
    renderExtra();
  };

  document.addEventListener("click", e => {
    if (e.target.closest(".auto-goto2")) showTab("tasks");
    if (e.target.closest(".bk-now")) exportBackup();
  });

  render();
})();
