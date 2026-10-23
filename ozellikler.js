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
