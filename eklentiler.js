/* Ruhsat Takip Pro — eklenti: otomatik uyarılar, evrak listesi, WhatsApp.
   index.html içinde app.js'den SONRA yüklenmelidir. */
(function () {
  const WARN_DAYS = 30;
  const URGENT_DAYS = 7;
  const openLists = new Set();

  const style = document.createElement("style");
  style.textContent = `
    a.small-btn{text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
    .small-btn.wa{background:#25d366;border-color:#25d366;color:#fff}
    .tab-badge{display:inline-block;min-width:18px;padding:0 5px;margin-left:5px;border-radius:9px;background:#c0392b;color:#fff;font-size:11px;line-height:18px}
    .check-live{margin:8px 0}
    .check-live summary{font-size:.9rem;cursor:pointer}
    .check-live label{display:flex;gap:10px;align-items:center;padding:7px 0}
    .check-live input{width:20px;height:20px}
    .remove-check{margin-left:auto;border:0;background:none;color:#a53535;font-size:22px;line-height:1;padding:0 6px}
  `;
  document.head.appendChild(style);

  /* ---------- Yardımcılar ---------- */
  function daysUntil(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    const n = new Date();
    const t = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const diff = Math.round((new Date(y, m - 1, d) - t) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  const fmtDate = s => (s ? String(s).slice(0, 10).split("-").reverse().join(".") : "");
  const missingDocs = f => (f.checklist || []).filter(x => !x.done).map(x => x.title);

  function phoneDigits(p) {
    let d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "90" + d.slice(1);
    else if (d.length === 10) d = "90" + d;
    return d;
  }

  function pickKind(f) {
    const d = daysUntil(f.expiry_date);
    if (f.status !== "Tamamlandı" && missingDocs(f).length) return "docs";
    if (d !== null && d <= WARN_DAYS) return "expiry";
    return "status";
  }

  /* ---------- WhatsApp ---------- */
  function waHref(f, kind) {
    const c = db.clients.find(x => x.id === f.client_id);
    const ph = phoneDigits(c?.phone);
    if (!ph) return "";

    const k = kind || pickKind(f);
    const d = daysUntil(f.expiry_date);
    let msg;

    if (k === "docs") {
      msg = `Merhaba ${c.name}, ${f.title} dosyanız için şu evraklar hâlâ eksik: ${missingDocs(f).join(", ")}. Hazır olduğunda iletebilir misiniz? Teşekkürler.`;
    } else if (k === "expiry") {
      msg = d < 0
        ? `Merhaba ${c.name}, ${f.title} ruhsatınızın süresi ${fmtDate(f.expiry_date)} tarihinde doldu. Yenileme işlemleri için uygun olduğunuzda dönüş yapar mısınız?`
        : `Merhaba ${c.name}, ${f.title} ruhsatınızın geçerlilik süresi ${fmtDate(f.expiry_date)} tarihinde doluyor. Yenileme işlemlerine başlamak için dönüş yapar mısınız?`;
    } else {
      msg = `Merhaba ${c.name}, ${f.title} dosyanızın güncel durumu: ${f.status}.`;
    }

    return `https://wa.me/${ph}?text=${encodeURIComponent(msg)}`;
  }

  const waBtn = href =>
    href ? `<a class="small-btn wa" href="${href}" target="_blank" rel="noopener">WhatsApp</a>` : "";

  /* ---------- Otomatik uyarılar ---------- */
  function buildAlerts() {
    const out = [];

    db.files.forEach(f => {
      const d = daysUntil(f.expiry_date);

      if (d !== null && d <= WARN_DAYS) {
        out.push({
          kind: "expiry",
          level: d <= URGENT_DAYS ? "danger" : "warn",
          rank: d,
          file: f,
          text: d < 0
            ? `Ruhsat süresi ${-d} gün önce doldu (${fmtDate(f.expiry_date)})`
            : d === 0
              ? "Ruhsat süresi bugün doluyor"
              : `Ruhsat bitişine ${d} gün kaldı (${fmtDate(f.expiry_date)})`
        });
      }

      if (f.status !== "Tamamlandı") {
        const miss = missingDocs(f);

        if (miss.length || f.status === "Eksik evrak") {
          out.push({
            kind: "docs",
            level: "warn",
            rank: 1000,
            file: f,
            text: miss.length
              ? `${miss.length} evrak eksik: ${miss.slice(0, 3).join(", ")}${miss.length > 3 ? " …" : ""}`
              : "Durum “Eksik evrak” olarak işaretli"
          });
        }
      }
    });

    return out.sort((a, b) =>
      (a.level === b.level ? 0 : a.level === "danger" ? -1 : 1) || a.rank - b.rank
    );
  }

  function alertCard(a) {
    const f = a.file;

    return `<article class="list-item">
      <div class="list-top">
        <div>
          <div class="list-title">${esc(f.title)}</div>
          <div class="subline">${esc(getClientName(f.client_id))}</div>
        </div>
        <span class="pill ${a.level}">${a.kind === "expiry" ? "Süre" : "Evrak"}</span>
      </div>
      <div class="subline">${esc(a.text)}</div>
      <div class="item-actions">
        <button class="small-btn" data-edit="file" data-id="${f.id}">Dosyayı aç</button>
        ${waBtn(waHref(f, a.kind))}
      </div>
    </article>`;
  }

  function mountBoxes() {
    if (!$("#autoAlertsHome")) {
      const anchor = $("#upcomingList")?.closest(".card");
      if (anchor) {
        const box = document.createElement("div");
        box.id = "autoAlertsHome";
        box.className = "card";
        anchor.before(box);
      }
    }

    if (!$("#autoAlertsTasks") && $("#tasksList")) {
      const box = document.createElement("div");
      box.id = "autoAlertsTasks";
      box.className = "card";
      $("#tasksList").before(box);
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
    box.innerHTML = `<div class="section-head"><h2>Otomatik uyarılar</h2>${
      limit && list.length > limit
        ? `<button class="text-btn auto-goto">Tümü (${list.length})</button>`
        : ""
    }</div><div class="list">${shown.map(alertCard).join("")}</div>`;
  }

  function renderAlerts() {
    const alerts = buildAlerts();

    mountBoxes();
    fillBox($("#autoAlertsHome"), alerts, 3);
    fillBox($("#autoAlertsTasks"), alerts, 0);

    const tab = $('.tab[data-tab="tasks"]');
    if (tab) {
      tab.innerHTML = "Hatırlatmalar" +
        (alerts.length ? `<span class="tab-badge">${alerts.length}</span>` : "");
    }

    if ($("#metricMissing")) {
      $("#metricMissing").textContent = alerts.filter(a => a.kind === "docs").length;
    }
  }

  /* ---------- app.js fonksiyonlarını genişlet ---------- */
  const _render = render;
  render = function () {
    _render();
    renderAlerts();
  };

  const _fileCard = fileCard;
  fileCard = function (f) {
    const d = daysUntil(f.expiry_date);
    let extra = "";

    if (d !== null) {
      extra += `<div class="subline">Ruhsat bitiş: ${fmtDate(f.expiry_date)}${
        d <= WARN_DAYS ? ` · <b>${d < 0 ? "süresi doldu" : d + " gün kaldı"}</b>` : ""
      }</div>`;
    }

    const list = f.checklist || [];
    if (list.length) {
      extra += `<details class="check-live" data-fid="${f.id}" ${openLists.has(f.id) ? "open" : ""}>
        <summary>Evrakları işaretle</summary>
        ${list.map((x, i) => `<label><input type="checkbox" data-live-check="${f.id}" data-i="${i}" ${x.done ? "checked" : ""}><span>${esc(x.title)}</span></label>`).join("")}
      </details>`;
    }

    const wa = waBtn(waHref(f));

    return _fileCard(f)
      .replace('<div class="item-actions">', () => extra + '<div class="item-actions">')
      .replace('<button class="small-btn" data-edit="file"', () => wa + '<button class="small-btn" data-edit="file"');
  };

  const _clientCard = clientCard;
  clientCard = function (c) {
    const html = _clientCard(c);
    const ph = phoneDigits(c.phone);
    if (!ph) return html;

    const href = `https://wa.me/${ph}?text=${encodeURIComponent("Merhaba " + c.name + ",")}`;
    return html.replace('<div class="item-actions">', () => '<div class="item-actions">' + waBtn(href));
  };

  /* Ruhsat bitiş tarihi alanı */
  const _upsert = upsert;
  upsert = function (table, obj) {
    if (table === "files") {
      obj.expiry_date = $("#recordForm").elements["expiry_date"]?.value || null;
    }
    return _upsert(table, obj);
  };

  const _openForm = openForm;
  openForm = function (mode, id) {
    _openForm(mode, id);
    if (mode !== "file") return;

    const obj = id ? db.files.find(x => x.id === id) || {} : {};
    const box = $("#formFields .checklist-box");
    const html = `<label>Ruhsat bitiş tarihi (isteğe bağlı)<input name="expiry_date" type="date" value="${esc(obj.expiry_date || "")}"></label>`;

    if (box) box.insertAdjacentHTML("beforebegin", html);
    else $("#formFields").insertAdjacentHTML("beforeend", html);

    enhanceChecklist(box);
  };

  /* Evrak listesinde silme (×) ve numaraları düzenli tutma */
  function enhanceChecklist(box) {
    const items = box?.querySelector(".checklist-items");
    if (!items) return;

    const decorate = () => {
      items.querySelectorAll(".check-row").forEach((row, i) => {
        row.querySelector('input[type="checkbox"]').name = "check_" + i;
        row.querySelector('input[type="hidden"]').name = "checktitle_" + i;

        if (!row.querySelector(".remove-check")) {
          const b = document.createElement("button");
          b.type = "button";
          b.className = "remove-check";
          b.setAttribute("aria-label", "Evrakı sil");
          b.textContent = "×";
          row.appendChild(b);
        }
      });
    };

    decorate();
    new MutationObserver(decorate).observe(items, { childList: true });

    items.addEventListener("click", e => {
      const b = e.target.closest(".remove-check");
      if (!b) return;
      e.preventDefault();
      b.closest(".check-row").remove();
    });
  }

  /* ---------- Olaylar ---------- */
  document.addEventListener("change", e => {
    const cb = e.target.closest?.("[data-live-check]");
    if (!cb) return;

    const f = db.files.find(x => x.id === cb.dataset.liveCheck);
    const item = f?.checklist?.[Number(cb.dataset.i)];

    if (item) {
      item.done = cb.checked;
      saveLocal();
    }
  });

  document.addEventListener("toggle", e => {
    const d = e.target;
    if (d.matches?.("details.check-live")) {
      if (d.open) openLists.add(d.dataset.fid);
      else openLists.delete(d.dataset.fid);
    }
  }, true);

  document.addEventListener("click", e => {
    if (e.target.closest(".auto-goto")) showTab("tasks");
  });

  render();
})();


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


/* Ruhsat Takip Pro — eklenti 4: takvime aktarma, teklif ve makbuz PDF. */
(function () {
  /* ---------- Yardımcılar ---------- */
  const fmtDate = s => (s ? String(s).slice(0, 10).split("-").reverse().join(".") : "");
  const sum = (arr, fn) => arr.reduce((a, x) => a + (Number(fn(x)) || 0), 0);
  const paidFor = f => sum(db.transactions.filter(t => t.kind === "Tahsilat" && t.file_id === f.id), t => t.amount);
  const leftFor = f => Math.max(0, (Number(f.fee) || 0) - paidFor(f));

  function daysUntil(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    const n = new Date();
    const diff = Math.round((new Date(y, m - 1, d) - new Date(n.getFullYear(), n.getMonth(), n.getDate())) / 86400000);
    return Number.isNaN(diff) ? null : diff;
  }

  function localDate() {
    const n = new Date();
    return n.getFullYear() + "-" + String(n.getMonth() + 1).padStart(2, "0") + "-" + String(n.getDate()).padStart(2, "0");
  }

  /* ---------- Takvime aktar (.ics) ---------- */
  const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const ymd = s => String(s).slice(0, 10).replace(/-/g, "");

  function nextDay(s) {
    const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
    const t = new Date(y, m - 1, d + 1);
    return t.getFullYear() + String(t.getMonth() + 1).padStart(2, "0") + String(t.getDate()).padStart(2, "0");
  }

  function calEvents() {
    const ev = [];
    const add = (uid, date, title, desc) => {
      const d = daysUntil(date);
      if (d !== null && d >= 0) ev.push({ uid, date, title, desc });
    };

    db.files.forEach(f => {
      const who = f.client_id ? getClientName(f.client_id) : "";
      add(f.id + "-expiry", f.expiry_date, "Ruhsat bitişi: " + f.title, who);
      if (f.status !== "Tamamlandı") add(f.id + "-followup", f.due_date, "Takip: " + f.title, who);
    });

    db.tasks.filter(t => !t.done).forEach(t => add(t.id + "-task", t.due_date, t.title, t.notes || ""));
    return ev;
  }

  function buildIcs(ev) {
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Ruhsat Takip Pro//TR", "CALSCALE:GREGORIAN"];

    ev.forEach(e => {
      L.push("BEGIN:VEVENT", `UID:${e.uid}@ruhsat-takip-pro`, `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.date)}`, `DTEND;VALUE=DATE:${nextDay(e.date)}`,
        `SUMMARY:${icsEsc(e.title)}`);
      if (e.desc) L.push(`DESCRIPTION:${icsEsc(e.desc)}`);
      /* bir gün önce 09:00 ve o gün 09:00 */
      L.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Hatırlatma", "TRIGGER:-PT15H", "END:VALARM",
        "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Hatırlatma", "TRIGGER:PT9H", "END:VALARM", "END:VEVENT");
    });

    L.push("END:VCALENDAR");
    return L.join("\r\n");
  }

  async function exportCalendar() {
    const ev = calEvents();
    if (!ev.length) { toast("Aktarılacak yaklaşan tarih yok."); return; }

    const name = "ruhsat-takip-takvim.ics";
    const file = new File([buildIcs(ev)], name, { type: "text/calendar" });

    try {
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: name });
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
  }

  function mountCalendarCard() {
    if ($("#calCard")) return;
    const view = $("#view-tasks");
    if (!view) return;

    const card = document.createElement("div");
    card.id = "calCard";
    card.className = "card";
    card.innerHTML = `<h2>Takvime aktar</h2>
      <p id="calInfo" class="subline"></p>
      <div class="item-actions"><button type="button" class="small-btn" id="calExport">Takvime aktar</button></div>`;

    const note = view.querySelector(".footnote");
    if (note) note.before(card);
    else view.appendChild(card);

    $("#calExport").addEventListener("click", exportCalendar);
  }

  /* ---------- Teklif ve makbuz (yazdır → PDF) ---------- */
  function firmName() {
    let n = "";
    try { n = localStorage.getItem("rtp_firm") || ""; } catch {}

    if (!n) {
      n = (prompt("Belgede görünecek firma / ad soyad:", "") || "").trim();
      if (n) { try { localStorage.setItem("rtp_firm", n); } catch {} }
    }
    return n;
  }

  const row = (k, v) => (v ? `<tr><th>${k}</th><td>${esc(v)}</td></tr>` : "");
  const firmHtml = n => (n ? `<div class="firm">${esc(n)}</div>` : "");

  function printDoc(title, body) {
    const w = window.open("", "_blank");
    if (!w) { toast("Pencere açılamadı. Açılır pencerelere izin ver."); return; }

    w.document.write(`<!doctype html><html lang="tr"><head><meta charset="utf-8">
      <meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
      <style>
        body{font-family:-apple-system,Helvetica,Arial,sans-serif;color:#1d2b27;padding:28px;max-width:720px;margin:auto}
        .firm{font-weight:700;font-size:18px;margin-bottom:6px}
        h1{font-size:26px;margin:4px 0 2px}
        h2{font-size:15px;margin:22px 0 6px;color:#315a48;text-transform:uppercase;letter-spacing:.04em}
        .muted{color:#667;font-size:13px}
        .big{font-size:30px;font-weight:700;margin:8px 0}
        table{border-collapse:collapse;width:100%}
        th{text-align:left;width:34%;padding:6px 8px;color:#556;font-weight:600;border-bottom:1px solid #e3e8e5}
        td{padding:6px 8px;border-bottom:1px solid #e3e8e5}
        ul{margin:6px 0 0 18px;padding:0}
        .sign{display:flex;justify-content:space-between;margin-top:56px}
      </style></head><body>${body}</body></html>`);

    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 500);
  }

  function quoteDoc(f) {
    const c = db.clients.find(x => x.id === f.client_id) || {};
    const days = prompt("Teklif kaç gün geçerli olsun?", "15");
    if (days === null) return;

    const firm = firmName();
    const list = (f.checklist || []).map(x => `<li>${esc(x.title)}</li>`).join("");

    printDoc("Hizmet Teklifi - " + f.title, `
      ${firmHtml(firm)}
      <h1>Hizmet Teklifi</h1>
      <p class="muted">Tarih: ${fmtDate(localDate())}</p>
      <h2>Müşteri</h2>
      <table>${row("Ad soyad", c.name)}${row("İşletme", c.business)}${row("Telefon", c.phone)}${row("Adres", c.address)}</table>
      <h2>İş tanımı</h2>
      <table>${row("Dosya", f.title)}${row("İşlem türü", f.type)}${row("Adres", f.address)}${row("Ada / parsel", f.parcel)}</table>
      <h2>Hizmet bedeli</h2>
      <div class="big">${money(f.fee)}</div>
      ${list ? `<h2>Gerekli evraklar</h2><ul>${list}</ul>` : ""}
      <p class="muted">Bu teklif ${esc(days || "15")} gün geçerlidir.</p>`);
  }

  function receiptDoc(t) {
    const f = db.files.find(x => x.id === t.file_id) || {};
    const c = db.clients.find(x => x.id === f.client_id) || {};
    const firm = firmName();

    printDoc("Tahsilat Makbuzu", `
      ${firmHtml(firm)}
      <h1>Tahsilat Makbuzu</h1>
      <p class="muted">Tarih: ${fmtDate(t.date)}</p>
      <div class="big">${money(t.amount)}</div>
      <table>${row("Müşteri", c.name)}${row("Dosya", f.title)}${row("Açıklama", t.notes)}${
        f.id ? row("Toplam bedel", money(f.fee)) + row("Tahsil edilen (toplam)", money(paidFor(f))) + row("Kalan", money(leftFor(f))) : ""
      }</table>
      <div class="sign"><div>Teslim eden<br><br>______________</div><div>Teslim alan<br><br>______________</div></div>`);
  }

  const _fileCard = fileCard;
  fileCard = function (f) {
    return _fileCard(f).replace('<div class="item-actions">', () =>
      `<div class="item-actions"><button class="small-btn doc-pdf" data-doc="quote" data-id="${f.id}">Teklif PDF</button>`);
  };

  const _txCard = txCard;
  txCard = function (t) {
    const html = _txCard(t);
    if (t.kind !== "Tahsilat") return html;

    return html.replace('<div class="item-actions">', () =>
      `<div class="item-actions"><button class="small-btn doc-pdf" data-doc="receipt" data-id="${t.id}">Makbuz PDF</button>`);
  };

  document.addEventListener("click", e => {
    const b = e.target.closest(".doc-pdf");
    if (!b) return;

    if (b.dataset.doc === "quote") {
      const f = db.files.find(x => x.id === b.dataset.id);
      if (f) quoteDoc(f);
    } else {
      const t = db.transactions.find(x => x.id === b.dataset.id);
      if (t) receiptDoc(t);
    }
  });

  /* ---------- Render bağlama ---------- */
  const _render = render;
  render = function () {
    _render();
    mountCalendarCard();

    const info = $("#calInfo");
    if (info) {
      const n = calEvents().length;
      info.textContent = n
        ? `${n} yaklaşan tarih (ruhsat bitişi, takip, görev) takvime aktarılır. Her biri için bir gün önce ve o gün saat 09:00'da hatırlatma eklenir.`
        : "Takvime aktarılacak yaklaşan tarih yok.";
    }
  };

  render();
})();


