/* Ruhsat Takip Pro — çoklu evrak ekleme ve kayıt düzeltmesi */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

const money = n =>
  (Number(n) || 0).toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    maximumFractionDigits: 0
  });

const today = () => new Date().toISOString().slice(0, 10);

const seed = {
  clients: [],
  files: [],
  tasks: [],
  transactions: []
};

let db = loadLocal();
let supabaseClient = null;
let sessionUser = null;
let syncingFromCloud = false;
let cloudBusy = false;
let dialogMode = null;
let editId = null;

function loadLocal() {
  try {
    return {
      ...seed,
      ...JSON.parse(localStorage.getItem("rtp_local_v1") || "{}")
    };
  } catch {
    return JSON.parse(JSON.stringify(seed));
  }
}

function saveLocal() {
  localStorage.setItem("rtp_local_v1", JSON.stringify(db));
  render();

  if (sessionUser && !syncingFromCloud) {
    syncAllToCloud();
  }
}

function toast(msg) {
  const el = $("#toast");
  if (!el) return;

  el.textContent = msg;
  el.classList.add("show");

  setTimeout(() => el.classList.remove("show"), 2800);
}

function esc(s = "") {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function statusClass(s) {
  return ["Eksik evrak", "Beklemede"].includes(s)
    ? "warn"
    : s === "Tamamlandı"
      ? ""
      : "danger";
}

function empty(msg) {
  return `<div class="empty">${esc(msg)}</div>`;
}

function getClientName(id) {
  return db.clients.find(c => c.id === id)?.name || "Müşteri seçilmedi";
}

function calc() {
  const collected = db.transactions
    .filter(t => t.kind === "Tahsilat")
    .reduce((a, t) => a + Number(t.amount), 0);

  const expenses = db.transactions
    .filter(t => t.kind === "Gider")
    .reduce((a, t) => a + Number(t.amount), 0);

  const contracted = db.files
    .reduce((a, f) => a + Number(f.fee || 0), 0);

  const due = Math.max(0, contracted - collected);
  const month = today().slice(0, 7);

  const mcol = db.transactions
    .filter(t => t.kind === "Tahsilat" && (t.date || "").startsWith(month))
    .reduce((a, t) => a + Number(t.amount), 0);

  const mexp = db.transactions
    .filter(t => t.kind === "Gider" && (t.date || "").startsWith(month))
    .reduce((a, t) => a + Number(t.amount), 0);

  return {
    collected,
    expenses,
    contracted,
    due,
    net: collected - expenses,
    monthNet: mcol - mexp
  };
}

function render() {
  const f = db.files;
  const t = db.tasks;
  const fin = calc();

  if ($("#metricActive")) {
    $("#metricActive").textContent =
      f.filter(x => x.status !== "Tamamlandı").length;
  }

  if ($("#metricMissing")) {
    $("#metricMissing").textContent =
      f.filter(x => x.status === "Eksik evrak").length;
  }

  if ($("#metricDue")) $("#metricDue").textContent = money(fin.due);
  if ($("#metricProfit")) $("#metricProfit").textContent = money(fin.monthNet);
  if ($("#moneyCollected")) $("#moneyCollected").textContent = money(fin.collected);
  if ($("#moneyExpenses")) $("#moneyExpenses").textContent = money(fin.expenses);
  if ($("#moneyReceivable")) $("#moneyReceivable").textContent = money(fin.due);
  if ($("#moneyNet")) $("#moneyNet").textContent = money(fin.net);

  const up = t
    .filter(x => !x.done)
    .sort((a, b) =>
      (a.due_date || "9999").localeCompare(b.due_date || "9999")
    )
    .slice(0, 4);

  if ($("#upcomingList")) {
    $("#upcomingList").innerHTML = up.length
      ? up.map(taskCard).join("")
      : empty("Yaklaşan görev yok. İstersen yeni hatırlatma ekle.");
  }

  const recent = [...f]
    .sort((a, b) =>
      (b.created_at || "").localeCompare(a.created_at || "")
    )
    .slice(0, 4);

  if ($("#recentFiles")) {
    $("#recentFiles").innerHTML = recent.length
      ? recent.map(fileCard).join("")
      : empty("Henüz dosya eklenmedi.");
  }

  const cq = ($("#clientSearch")?.value || "").toLocaleLowerCase("tr");

  const clients = db.clients.filter(c =>
    (c.name + " " + c.phone + " " + c.business)
      .toLocaleLowerCase("tr")
      .includes(cq)
  );

  if ($("#clientsList")) {
    $("#clientsList").innerHTML = clients.length
      ? clients.map(clientCard).join("")
      : empty("Müşteri kaydı bulunamadı.");
  }

  const fq = ($("#fileSearch")?.value || "").toLocaleLowerCase("tr");
  const fs = $("#fileStatusFilter")?.value || "";

  const files = db.files.filter(f =>
    (!fs || f.status === fs) &&
    (f.title + " " + getClientName(f.client_id) + " " + f.address)
      .toLocaleLowerCase("tr")
      .includes(fq)
  );

  if ($("#filesList")) {
    $("#filesList").innerHTML = files.length
      ? files.map(fileCard).join("")
      : empty("Ruhsat dosyası bulunamadı.");
  }

  const tasks = [...t].sort((a, b) =>
    (a.done ? 1 : 0) - (b.done ? 1 : 0) ||
    (a.due_date || "9999").localeCompare(b.due_date || "9999")
  );

  if ($("#tasksList")) {
    $("#tasksList").innerHTML = tasks.length
      ? tasks.map(taskCard).join("")
      : empty("Hatırlatma bulunmuyor.");
  }

  if ($("#transactionsList")) {
    $("#transactionsList").innerHTML = db.transactions.length
      ? [...db.transactions]
          .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
          .map(txCard)
          .join("")
      : empty("Henüz finans işlemi eklenmedi.");
  }
}

function clientCard(c) {
  return `<article class="list-item">
    <div class="list-top">
      <div>
        <div class="list-title">${esc(c.name)}</div>
        <div class="subline">${esc(c.business || "İşletme belirtilmedi")} · ${esc(c.phone || "Telefon yok")}</div>
      </div>
      <span class="pill">Müşteri</span>
    </div>
    ${c.address ? `<div class="subline">${esc(c.address)}</div>` : ""}
    ${c.notes ? `<div class="subline">${esc(c.notes)}</div>` : ""}
    <div class="item-actions">
      <button class="small-btn" data-edit="client" data-id="${c.id}">Düzenle</button>
      <button class="small-btn" data-delete="client" data-id="${c.id}">Sil</button>
    </div>
  </article>`;
}

function fileCard(f) {
  const n = (f.checklist || []).filter(x => x.done).length;
  const total = (f.checklist || []).length;

  return `<article class="list-item">
    <div class="list-top">
      <div>
        <div class="list-title">${esc(f.title)}</div>
        <div class="subline">${esc(f.type)} · ${esc(getClientName(f.client_id))}</div>
      </div>
      <span class="pill ${statusClass(f.status)}">${esc(f.status)}</span>
    </div>
    <div class="subline">${f.address ? esc(f.address) + " · " : ""}Takip tarihi: ${esc(f.due_date || "Belirlenmedi")}</div>
    ${total ? `<div class="subline">Evrak kontrolü: ${n}/${total}</div>` : ""}
    <div class="list-top">
      <strong>${money(f.fee)}</strong>
      <span class="subline">${f.parcel ? `Ada/parsel: ${esc(f.parcel)}` : ""}</span>
    </div>
    <div class="item-actions">
      <button class="small-btn" data-edit="file" data-id="${f.id}">Dosyayı aç / düzenle</button>
      <button class="small-btn" data-delete="file" data-id="${f.id}">Sil</button>
    </div>
  </article>`;
}

function taskCard(t) {
  return `<article class="list-item">
    <div class="list-top">
      <div>
        <div class="list-title">${esc(t.title)}</div>
        <div class="subline">${t.file_id ? esc(db.files.find(f => f.id === t.file_id)?.title || "Dosya silinmiş") : "Genel görev"}</div>
      </div>
      <span class="pill ${t.done ? "" : "warn"}">${t.done ? "Tamamlandı" : "Bekliyor"}</span>
    </div>
    <div class="subline">Tarih: ${esc(t.due_date || "Belirlenmedi")}${t.notes ? " · " + esc(t.notes) : ""}</div>
    <div class="item-actions">
      <button class="small-btn" data-toggle-task="${t.id}">${t.done ? "Tamamlanmadı yap" : "Tamamlandı işaretle"}</button>
      <button class="small-btn" data-edit="task" data-id="${t.id}">Düzenle</button>
      <button class="small-btn" data-delete="task" data-id="${t.id}">Sil</button>
    </div>
  </article>`;
}

function txCard(t) {
  return `<article class="list-item">
    <div class="list-top">
      <div>
        <div class="list-title">${esc(t.kind)} · ${esc(t.category || "Genel")}</div>
        <div class="subline">${esc(t.date)} ${t.file_id ? "· " + esc(db.files.find(f => f.id === t.file_id)?.title || "Dosya silinmiş") : ""}</div>
      </div>
      <strong style="color:${t.kind === "Gider" ? "#a53535" : "#285047"}">${t.kind === "Gider" ? "−" : "+"}${money(t.amount)}</strong>
    </div>
    ${t.notes ? `<div class="subline">${esc(t.notes)}</div>` : ""}
    <div class="item-actions">
      <button class="small-btn" data-edit="transaction" data-id="${t.id}">Düzenle</button>
      <button class="small-btn" data-delete="transaction" data-id="${t.id}">Sil</button>
    </div>
  </article>`;
}

function field(label, name, type = "text", value = "", opts = null, required = false) {
  let input = "";

  if (type === "select") {
    input = `<select name="${name}" ${required ? "required" : ""}>
      ${(opts || []).map(o =>
        `<option value="${esc(o.value)}" ${o.value === value ? "selected" : ""}>${esc(o.label)}</option>`
      ).join("")}
    </select>`;
  } else if (type === "textarea") {
    input = `<textarea name="${name}" ${required ? "required" : ""}>${esc(value || "")}</textarea>`;
  } else {
    input = `<input name="${name}" type="${type}" value="${esc(value ?? "")}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="0.01"' : ""}>`;
  }

  return `<label>${label}${input}</label>`;
}

/* Evrak listesi: mevcut evraklar ve yeni evrak ekleme alanı */
function checklistEditor(items = []) {
  const standard = [
    "Başvuru formu / dilekçe",
    "Kimlik veya şirket belgeleri",
    "Tapu / kira veya kullanım hakkı",
    "Yapı kullanım / uygunluk belgeleri",
    "Faaliyete özel rapor ve izinler"
  ];

  const arr = items.length
    ? items
    : standard.map(title => ({ title, done: false }));

  return `<div class="checklist-box">
    <strong>Evrak kontrol listesi</strong>
    <div class="checklist-items">
      ${arr.map((x, i) => `
        <label class="check-row">
          <input type="checkbox" name="check_${i}" ${x.done ? "checked" : ""}>
          <input type="hidden" name="checktitle_${i}" value="${esc(x.title)}">
          <span>${esc(x.title)}</span>
        </label>
      `).join("")}
    </div>
    <div class="checklist-add">
      <input type="text" class="new-checklist-title" placeholder="Yeni evrak adını yaz">
      <button type="button" class="add-checklist-item">+ Listeye ekle</button>
    </div>
  </div>`;
}

function openForm(mode, id = null) {
  dialogMode = mode;
  editId = id;

  const table = mode === "transaction"
    ? "transactions"
    : mode === "task"
      ? "tasks"
      : mode === "file"
        ? "files"
        : "clients";

  const obj = id ? db[table].find(x => x.id === id) || {} : {};
  const titleMap = {
    client: "Müşteri",
    file: "Ruhsat dosyası",
    task: "Hatırlatma",
    transaction: "Finans işlemi"
  };

  $("#dialogTitle").textContent = (id ? "Düzenle: " : "Yeni ") + titleMap[mode];

  let html = "";

  if (mode === "client") {
    html =
      field("Ad soyad / müşteri adı", "name", "text", obj.name || "", null, true) +
      field("Telefon", "phone", "tel", obj.phone || "") +
      field("İşletme / şirket", "business", "text", obj.business || "") +
      field("Adres", "address", "text", obj.address || "") +
      field("Görüşme notları", "notes", "textarea", obj.notes || "");
  } else if (mode === "file") {
    html =
      field("Dosya başlığı", "title", "text", obj.title || "", null, true) +
      field("Müşteri", "client_id", "select", obj.client_id || "", [
        { value: "", label: "Müşteri seç (isteğe bağlı)" },
        ...db.clients.map(c => ({ value: c.id, label: c.name }))
      ]) +
      field("İşlem türü", "type", "select", obj.type || "İşyeri açma ruhsatı", [
        "İşyeri açma ruhsatı",
        "İnşaat ruhsatı / iskân",
        "İmar ve evrak takibi"
      ].map(x => ({ value: x, label: x })), true) +
      field("Durum", "status", "select", obj.status || "Yeni başvuru", [
        "Yeni başvuru",
        "Evrak hazırlanıyor",
        "Eksik evrak",
        "Belediyede işlemde",
        "Tamamlandı",
        "Beklemede"
      ].map(x => ({ value: x, label: x }))) +
      field("Adres", "address", "text", obj.address || "") +
      field("Ada / parsel", "parcel", "text", obj.parcel || "") +
      field("Takip tarihi", "due_date", "date", obj.due_date || today()) +
      field("Anlaşılan hizmet bedeli (TL)", "fee", "number", obj.fee ?? 0) +
      field("Notlar", "notes", "textarea", obj.notes || "") +
      checklistEditor(obj.checklist || []);
  } else if (mode === "task") {
    html =
      field("Görev adı", "title", "text", obj.title || "", null, true) +
      field("Bağlı dosya", "file_id", "select", obj.file_id || "", [
        { value: "", label: "Genel görev" },
        ...db.files.map(f => ({ value: f.id, label: f.title }))
      ]) +
      field("Tarih", "due_date", "date", obj.due_date || today()) +
      field("Durum", "done", "select", String(!!obj.done), [
        { value: "false", label: "Bekliyor" },
        { value: "true", label: "Tamamlandı" }
      ]) +
      field("Not", "notes", "textarea", obj.notes || "");
  } else {
    html =
      field("İşlem türü", "kind", "select", obj.kind || "Tahsilat", [
        { value: "Tahsilat", label: "Tahsilat" },
        { value: "Gider", label: "Gider" }
      ]) +
      field("Kategori", "category", "text", obj.category || "") +
      field("Bağlı dosya", "file_id", "select", obj.file_id || "", [
        { value: "", label: "Dosya seç (isteğe bağlı)" },
        ...db.files.map(f => ({ value: f.id, label: f.title }))
      ]) +
      field("Tutar (TL)", "amount", "number", obj.amount ?? 0, null, true) +
      field("Tarih", "date", "date", obj.date || today(), null, true) +
      field("Açıklama", "notes", "textarea", obj.notes || "");
  }

  $("#formFields").innerHTML = html;

  /* Yeni evrak ekle düğmesi ve Enter tuşu */
  const checklistBox = $("#formFields .checklist-box");

  if (checklistBox) {
    const itemsBox = checklistBox.querySelector(".checklist-items");
    const titleInput = checklistBox.querySelector(".new-checklist-title");
    const addButton = checklistBox.querySelector(".add-checklist-item");

    const addChecklistItem = () => {
      const title = titleInput.value.trim();

      if (!title) {
        titleInput.focus();
        return;
      }

      const index = itemsBox.querySelectorAll(".check-row").length;

      const row = document.createElement("label");
      row.className = "check-row";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = `check_${index}`;

      const hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.name = `checktitle_${index}`;
      hidden.value = title;

      const span = document.createElement("span");
      span.textContent = title;

      row.appendChild(checkbox);
      row.appendChild(hidden);
      row.appendChild(span);
      itemsBox.appendChild(row);

      titleInput.value = "";
      titleInput.focus();
    };

    addButton.addEventListener("click", addChecklistItem);

    titleInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        addChecklistItem();
      }
    });
  }

  $("#formError").hidden = true;
  $("#recordDialog").showModal();
}

function saveForm(e) {
  e.preventDefault();

  const form = $("#recordForm");
  const data = Object.fromEntries(new FormData(form).entries());
  const id = editId || crypto.randomUUID();
  const stamp = new Date().toISOString();

  if (dialogMode === "client") {
    if (!data.name?.trim()) return formError("Müşteri adı gerekli.");

    const obj = {
      id,
      name: data.name.trim(),
      phone: data.phone || "",
      business: data.business || "",
      address: data.address || "",
      notes: data.notes || "",
      created_at: editId
        ? (db.clients.find(x => x.id === id)?.created_at || stamp)
        : stamp
    };

    upsert("clients", obj);
  } else if (dialogMode === "file") {
    if (!data.title?.trim()) return formError("Dosya başlığı gerekli.");

    const checklist = [];

    const titles = Object.keys(data)
      .filter(k => k.startsWith("checktitle_"))
      .sort((a, b) =>
        Number(a.split("_")[1]) - Number(b.split("_")[1])
      );

    titles.forEach(k => {
      const i = k.split("_")[1];

      checklist.push({
        title: data[k],
        done: form.elements[`check_${i}`]?.checked || false
      });
    });

    const obj = {
      id,
      title: data.title.trim(),
      client_id: data.client_id || null,
      type: data.type,
      status: data.status,
      address: data.address || "",
      parcel: data.parcel || "",
      due_date: data.due_date || null,
      fee: Number(data.fee) || 0,
      notes: data.notes || "",
      checklist,
      created_at: editId
        ? (db.files.find(x => x.id === id)?.created_at || stamp)
        : stamp
    };

    upsert("files", obj);
  } else if (dialogMode === "task") {
    const obj = {
      id,
      title: data.title.trim(),
      file_id: data.file_id || null,
      due_date: data.due_date || null,
      done: data.done === "true",
      notes: data.notes || "",
      created_at: editId
        ? (db.tasks.find(x => x.id === id)?.created_at || stamp)
        : stamp
    };

    upsert("tasks", obj);
  } else {
    const obj = {
      id,
      kind: data.kind,
      category: data.category || "",
      file_id: data.file_id || null,
      amount: Number(data.amount) || 0,
      date: data.date || today(),
      notes: data.notes || "",
      created_at: editId
        ? (db.transactions.find(x => x.id === id)?.created_at || stamp)
        : stamp
    };

    upsert("transactions", obj);
  }

  $("#recordDialog").close();
  saveLocal();
  toast("Kayıt bu cihazda kaydedildi.");
}

function upsert(table, obj) {
  const i = db[table].findIndex(x => x.id === obj.id);

  if (i >= 0) {
    db[table][i] = obj;
  } else {
    db[table].push(obj);
  }

  if (sessionUser) {
    obj.user_id = sessionUser.id;
  }
}

function formError(msg) {
  $("#formError").textContent = msg;
  $("#formError").hidden = false;
}

async function deleteRecord(table, id) {
  if (!confirm("Bu kaydı silmek istediğine emin misin?")) return;

  db[table] = db[table].filter(x => x.id !== id);
  saveLocal();

  if (sessionUser && supabaseClient) {
    const result = await supabaseClient
      .from(table)
      .delete()
      .eq("id", id)
      .eq("user_id", sessionUser.id);

    if (result.error) {
      toast("Cihazdan silindi; bulut silme hatası: " + result.error.message);
    }
  } else {
    toast("Kayıt cihazdan silindi.");
  }
}

/* SEKME SORUNU DÜZELTİLDİ */
function showTab(tab) {
  const targetId = "view-" + tab;
  let found = false;

  $$(".view").forEach(view => {
    const isActive = view.id === targetId;

    view.hidden = !isActive;
    view.style.display = isActive ? "flex" : "none";

    if (isActive) found = true;
  });

  $$(".tab").forEach(button => {
    const isActive = button.dataset.tab === tab;

    button.classList.toggle("active", isActive);

    if (isActive) {
      button.setAttribute("aria-current", "page");
    } else {
      button.removeAttribute("aria-current");
    }
  });

  if (!found) {
    console.warn("Sekme görünümü bulunamadı:", targetId);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

$$(".tab").forEach(button => {
  button.addEventListener("click", () => {
    showTab(button.dataset.tab);
  });
});

$$("[data-goto]").forEach(button => {
  button.addEventListener("click", () => {
    showTab(button.dataset.goto);
  });
});

$("#quickAdd").addEventListener("click", () => openForm("file"));
$("#addClientBtn").addEventListener("click", () => openForm("client"));
$("#addFileBtn").addEventListener("click", () => openForm("file"));
$("#addTaskBtn").addEventListener("click", () => openForm("task"));
$("#addMoneyBtn").addEventListener("click", () => openForm("transaction"));

$("#closeDialog").addEventListener("click", () => $("#recordDialog").close());
$("#cancelDialog").addEventListener("click", () => $("#recordDialog").close());
$("#recordForm").addEventListener("submit", saveForm);

$("#clientSearch").addEventListener("input", render);
$("#fileSearch").addEventListener("input", render);
$("#fileStatusFilter").addEventListener("change", render);

document.addEventListener("click", e => {
  const edit = e.target.closest("[data-edit]");

  if (edit) {
    openForm(edit.dataset.edit, edit.dataset.id);
    return;
  }

  const del = e.target.closest("[data-delete]");

  if (del) {
    const map = {
      client: "clients",
      file: "files",
      task: "tasks",
      transaction: "transactions"
    };

    deleteRecord(map[del.dataset.delete], del.dataset.id);
    return;
  }

  const toggle = e.target.closest("[data-toggle-task]");

  if (toggle) {
    const task = db.tasks.find(x => x.id === toggle.dataset.toggleTask);

    if (task) {
      task.done = !task.done;
      saveLocal();
    }
  }
});

$("#accountBtn").addEventListener("click", () => {
  $("#authPanel").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
});

function setCloudStatus(message, good = false) {
  const el = $("#cloudStatus");
  el.textContent = message;
  el.style.background = good ? "#e3f4e9" : "#edf3ef";
  el.style.color = good ? "#245b3b" : "#315a48";
}

function setAuthUI(user) {
  sessionUser = user || null;

  $("#signOut").hidden = !user;
  $("#signIn").hidden = !!user;
  $("#signUp").hidden = !!user;
  $("#email").disabled = !!user;
  $("#password").disabled = !!user;

  if (user) {
    $("#authMessage").textContent =
      "Hesap: " + user.email + ". Bulut eşitlemesi açık.";

    setCloudStatus("Buluta bağlı · " + user.email, true);
  }
}

function configLoad() {
  const cfg = JSON.parse(
    localStorage.getItem("rtp_supabase_config") || "{}"
  );

  $("#supabaseUrl").value = cfg.url || "";
  $("#supabaseKey").value = cfg.key || "";

  if (cfg.url && cfg.key) {
    $("#loginForm").hidden = false;
    initSupabase(cfg);
  }
}

function initSupabase(cfg) {
  if (!window.supabase?.createClient) {
    setCloudStatus(
      "Supabase kütüphanesi yüklenemedi. İnternet bağlantısını kontrol et."
    );
    return;
  }

  try {
    supabaseClient = window.supabase.createClient(
      cfg.url,
      cfg.key,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      }
    );

    $("#loginForm").hidden = false;

    setCloudStatus("Bulut bağlantısı ayarlandı. Giriş yap veya hesap oluştur.");

    supabaseClient.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        setCloudStatus("Oturum kontrol hatası: " + error.message);
        return;
      }

      if (data.session) {
        setAuthUI(data.session.user);
        await initialCloudLoad();
      }
    });

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session?.user) {
        setAuthUI(session.user);

        if (event === "SIGNED_IN") {
          setTimeout(() => initialCloudLoad(), 0);
        }
      } else if (event === "SIGNED_OUT") {
        setAuthUI(null);
        setCloudStatus("Çıkış yapıldı · yerel kayıtlar bu cihazda kalır.");
      }
    });
  } catch (e) {
    setCloudStatus("Bulut ayarları kontrol edilemedi: " + e.message);
  }
}

async function authAction(action) {
  if (!supabaseClient) {
    toast("Önce geçerli Supabase bağlantı ayarlarını kaydet.");
    return;
  }

  const email = $("#email").value.trim();
  const password = $("#password").value;

  if (!email || !password) {
    toast("E-posta ve şifre gir.");
    return;
  }

  if (password.length < 8) {
    toast("Güvenlik için en az 8 karakterli şifre kullan.");
    return;
  }

  setCloudStatus("Hesap işlemi yapılıyor…");

  let result;

  if (action === "signup") {
    result = await supabaseClient.auth.signUp({ email, password });
  } else {
    result = await supabaseClient.auth.signInWithPassword({ email, password });
  }

  if (result.error) {
    setCloudStatus("Hesap işlemi başarısız: " + result.error.message);
    return;
  }

  if (action === "signup" && !result.data.session) {
    setCloudStatus(
      "Hesap oluşturuldu. E-posta doğrulamasını tamamla, ardından giriş yap."
    );

    toast("Doğrulama e-postanı kontrol et.");
    return;
  }

  if (result.data.user) {
    setAuthUI(result.data.user);
    await initialCloudLoad();
  }
}

async function initialCloudLoad() {
  if (!supabaseClient || !sessionUser || cloudBusy) return;

  cloudBusy = true;
  setCloudStatus("Bulut kayıtları yükleniyor…");

  const tables = ["clients", "files", "tasks", "transactions"];

  try {
    const remote = {};

    for (const table of tables) {
      const { data, error } = await supabaseClient
        .from(table)
        .select("*")
        .eq("user_id", sessionUser.id);

      if (error) throw error;

      remote[table] = data || [];
    }

    const remoteCount = tables.reduce(
      (n, table) => n + remote[table].length,
      0
    );

    const localCount = tables.reduce(
      (n, table) => n + db[table].length,
      0
    );

    if (remoteCount === 0 && localCount > 0) {
      for (const table of tables) {
        const rows = db[table].map(row => ({
          ...row,
          user_id: sessionUser.id
        }));

        if (rows.length) {
          const { error } = await supabaseClient.from(table).upsert(rows);
          if (error) throw error;
        }
      }

      for (const table of tables) {
        const { data, error } = await supabaseClient
          .from(table)
          .select("*")
          .eq("user_id", sessionUser.id);

        if (error) throw error;

        remote[table] = data || [];
      }
    } else if (remoteCount > 0 && localCount > 0) {
      for (const table of tables) {
        const remoteIds = new Set(remote[table].map(x => x.id));

        const rows = db[table]
          .filter(x => !remoteIds.has(x.id))
          .map(row => ({
            ...row,
            user_id: sessionUser.id
          }));

        if (rows.length) {
          const { error } = await supabaseClient.from(table).upsert(rows);
          if (error) throw error;
        }
      }

      for (const table of tables) {
        const { data, error } = await supabaseClient
          .from(table)
          .select("*")
          .eq("user_id", sessionUser.id);

        if (error) throw error;

        remote[table] = data || [];
      }
    }

    syncingFromCloud = true;

    for (const table of tables) {
      db[table] = remote[table];
    }

    localStorage.setItem("rtp_local_v1", JSON.stringify(db));
    render();

    syncingFromCloud = false;

    setCloudStatus(
      "Bulut eşitlemesi açık · " + sessionUser.email,
      true
    );
  } catch (e) {
    syncingFromCloud = false;

    setCloudStatus(
      "Bulut yükleme hatası: " + e.message +
      " · schema.sql ve RLS ayarlarını kontrol et."
    );
  } finally {
    cloudBusy = false;
  }
}

async function syncAllToCloud() {
  if (!supabaseClient || !sessionUser || cloudBusy) return;

  cloudBusy = true;
  setCloudStatus("Değişiklikler buluta kaydediliyor…");

  try {
    for (const table of ["clients", "files", "tasks", "transactions"]) {
      const rows = db[table].map(row => ({
        ...row,
        user_id: sessionUser.id
      }));

      if (rows.length) {
        const { error } = await supabaseClient.from(table).upsert(rows);
        if (error) throw error;
      }
    }

    setCloudStatus(
      "Bulut eşitlemesi tamamlandı · " + sessionUser.email,
      true
    );
  } catch (e) {
    setCloudStatus(
      "Bulut eşitleme hatası: " + e.message +
      " · bağlantıyı ve tablo izinlerini kontrol et."
    );
  } finally {
    cloudBusy = false;
  }
}

$("#saveConfig").addEventListener("click", () => {
  const url = $("#supabaseUrl").value.trim().replace(/\/$/, "");
  const key = $("#supabaseKey").value.trim();

  if (!/^https:\/\/.+\.supabase\.co$/.test(url) || !key) {
    toast("Geçerli Supabase URL ve publishable/anon anahtarı gir.");
    return;
  }

  localStorage.setItem(
    "rtp_supabase_config",
    JSON.stringify({ url, key })
  );

  $("#loginForm").hidden = false;
  initSupabase({ url, key });

  toast("Bulut ayarları kaydedildi.");
});

$("#signIn").addEventListener("click", () => authAction("signin"));
$("#signUp").addEventListener("click", () => authAction("signup"));

$("#signOut").addEventListener("click", async () => {
  if (supabaseClient) {
    const { error } = await supabaseClient.auth.signOut();

    if (error) {
      toast(error.message);
    } else {
      toast("Çıkış yapıldı.");
    }
  }
});

configLoad();

/* Sayfa ilk açıldığında ana ekranı göster */
showTab("home");

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

render();
