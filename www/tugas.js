// ==========================================
// tugas.js — CRUD Tugas + Kalender & Sort (v2.0)
// ==========================================

var TugasState = {
    list: [],
    filter: "semua",
    searchQuery: "",
    sortBy: "deadline",
    viewMode: "list", // 'list' | 'calendar'
    calDate: new Date(), // Bulan yang lagi dilihat di kalender
    editing: null,
    reminderOverride: [],
    inited: false
};

var _cachedDefaultReminders = [];

// ==========================================
// INIT
// ==========================================
async function initTugas() {
    await loadAndRenderTugas();
    if (!TugasState.inited) {
        setupTugasButtons();
        setupTugasFilters();
        setupTugasModal();
        setupCalendar();
        TugasState.inited = true;
    }
}

async function loadAndRenderTugas() {
    TugasState.list = await getTugas();
    await renderTugasList();
}

// ==========================================
// FILTER, SEARCH & SORT
// ==========================================
function getProcessedTugas() {
    var now = Date.now();
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    var weekEnd = new Date(now + 7 * 86400000);

    // 1. Filter
    var filtered = TugasState.list.filter(function (t) {
        if (TugasState.filter === "selesai") {
            if (!t.status_selesai) return false;
        } else {
            if (t.status_selesai) return false;
            var dl = new Date(t.deadline).getTime();
            if (isNaN(dl)) return TugasState.filter === "semua";
            if (TugasState.filter === "hari" && !(dl >= todayStart.getTime() && dl <= todayEnd.getTime())) return false;
            if (TugasState.filter === "minggu" && !(dl >= now && dl <= weekEnd.getTime())) return false;
            if (TugasState.filter === "terlambat" && !(dl < now)) return false;
        }

        // 2. Search
        if (TugasState.searchQuery) {
            var q = TugasState.searchQuery.toLowerCase();
            if (!t.nama.toLowerCase().includes(q)) return false;
        }
        return true;
    });

    // 3. Sort
    filtered.sort(function (a, b) {
        // Selesai selalu di bawah
        if (a.status_selesai && !b.status_selesai) return 1;
        if (!a.status_selesai && b.status_selesai) return -1;

        if (TugasState.sortBy === "prioritas") {
            var pMap = { "TINGGI": 3, "SEDANG": 2, "RENDAH": 1 };
            var pA = pMap[a.priority || "SEDANG"] || 2;
            var pB = pMap[b.priority || "SEDANG"] || 2;
            if (pA !== pB) return pB - pA; // Prioritas tinggi dulu
        } else if (TugasState.sortBy === "matkul") {
            var mMap = {};
            // Asumsi TugasState.list udah ada map matkul (kita ambil dari render)
            var namaA = a._namaMatkul || "";
            var namaB = b._namaMatkul || "";
            if (namaA !== namaB) return namaA.localeCompare(namaB);
        }

        // Default / fallback: Deadline terdekat
        var da = new Date(a.deadline).getTime() || 0;
        var db = new Date(b.deadline).getTime() || 0;
        return da - db;
    });

    return filtered;
}

// ==========================================
// RENDER LIST
// ==========================================
async function renderTugasList() {
    if (TugasState.viewMode !== "list") return;

    var el = document.getElementById("task-list");
    var empty = document.getElementById("task-empty");
    if (!el || !empty) return;

    var matkulList = await getMatkul();
    var matkulMap = {};
    matkulList.forEach(function (m) { matkulMap[m.id] = m; });

    // Suntik nama matkul ke objek tugas buat sorting
    TugasState.list.forEach(function (t) {
        var m = matkulMap[t.mata_kuliah_id];
        t._namaMatkul = m ? m.nama : "";
    });

    var filtered = getProcessedTugas();

    if (filtered.length === 0) {
        el.innerHTML = "";
        empty.hidden = false;
        updateEmptyMessage(TugasState.filter);
        return;
    }
    empty.hidden = true;

    el.innerHTML = filtered.map(function (t) {
        return renderTaskCard(t, matkulMap);
    }).join("");

    wireTaskEvents();
}

function renderTaskCard(t, matkulMap) {
    var matkul = matkulMap[t.mata_kuliah_id];
    var warna = matkul ? matkul.warna : "#4F8CFF";
    var namaMatkul = matkul ? matkul.nama : "Tanpa Matkul";
    var overdue = isTerlambat(t);

    var cardCls = "task-card";
    if (overdue) cardCls += " is-overdue";
    if (t.status_selesai) cardCls += " is-done";

    var deadlineCls = "";
    if (overdue) deadlineCls = "is-overdue";
    else if (isDalamRentangHari(t, 1)) deadlineCls = "is-soon";

    var catatan = t.catatan ? renderCatatan(t.catatan) : "";
    var cat = t.category || 'TUGAS';
    var badgeCat = `<span class="badge-cat">${escapeHtml(cat)}</span>`;
    var badgePrio = "";
    if (t.priority === 'TINGGI') badgePrio = `<span class="badge-cat badge-prio-tinggi">Tinggi</span>`;
    if (t.priority === 'RENDAH') badgePrio = `<span class="badge-cat badge-prio-rendah">Rendah</span>`;

    return (
        '<div class="' + cardCls + '" data-id="' + escapeHtml(t.id) + '" style="--accent:' + escapeHtml(warna) + '">' +
            '<button class="task-checkbox" data-check-id="' + escapeHtml(t.id) + '">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</button>' +
            '<div class="task-body">' +
                '<div class="task-title">' + escapeHtml(t.nama) + '</div>' +
                '<div class="task-meta">' +
                    '<span class="task-matkul"><span class="task-matkul-dot"></span>' + escapeHtml(namaMatkul) + '</span>' +
                    badgeCat + badgePrio +
                    '<span class="task-deadline ' + deadlineCls + '">' + (overdue ? "⚠ " : "") + escapeHtml(formatRelatif(t.deadline)) + '</span>' +
                '</div>' + catatan +
            '</div>' +
            '<button class="task-menu" data-menu-id="' + escapeHtml(t.id) + '">⋯</button>' +
        '</div>'
    );
}

function renderCatatan(catatan) {
    var safe = escapeHtml(catatan);
    return '<div class="task-note">' + safe.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>') + '</div>';
}

function updateEmptyMessage(filter) {
    var title = document.querySelector("#task-empty .empty-title");
    var desc = document.querySelector("#task-empty .empty-desc");
    if (!title || !desc) return;
    if (TugasState.searchQuery) {
        title.textContent = "Tugas tidak ditemukan";
        desc.textContent = "Coba kata kunci lain.";
        return;
    }
    var messages = {
        semua: { t: "Belum ada tugas", d: "Yuk, catat tugas pertamamu." },
        hari: { t: "Tidak ada tugas hari ini", d: "Kerja bagus! Nikmati harimu." },
        minggu: { t: "Minggu ini kosong", d: "Belum ada deadline dalam 7 hari." },
        terlambat: { t: "Tidak ada yang terlambat", d: "Kamu on track." },
        selesai: { t: "Belum ada yang selesai", d: "Selesaikan tugas untuk melihatnya di sini." }
    };
    var m = messages[filter] || messages.semua;
    title.textContent = m.t;
    desc.textContent = m.d;
}

function wireTaskEvents() {
    var list = document.getElementById("task-list");
    if (!list) return;
    list.querySelectorAll("[data-check-id]").forEach(function (btn) {
        btn.addEventListener("click", function (e) { e.stopPropagation(); toggleTugasSelesai(btn.getAttribute("data-check-id")); });
    });
    list.querySelectorAll("[data-menu-id]").forEach(function (btn) {
        btn.addEventListener("click", function (e) { e.stopPropagation(); showTaskMenu(btn, btn.getAttribute("data-menu-id")); });
    });
}

// ==========================================
// KALENDER VIEW
// ==========================================
function setupCalendar() {
    document.getElementById("btn-view-list").addEventListener("click", () => {
        TugasState.viewMode = "list";
        document.getElementById("btn-view-list").classList.add("active");
        document.getElementById("btn-view-cal").classList.remove("active");
        document.getElementById("list-view").hidden = false;
        document.getElementById("calendar-view").hidden = true;
        renderTugasList();
    });

    document.getElementById("btn-view-cal").addEventListener("click", () => {
        TugasState.viewMode = "calendar";
        document.getElementById("btn-view-cal").classList.add("active");
        document.getElementById("btn-view-list").classList.remove("active");
        document.getElementById("list-view").hidden = true;
        document.getElementById("calendar-view").hidden = false;
        renderKalender();
    });

    document.getElementById("cal-prev").addEventListener("click", () => {
        TugasState.calDate.setMonth(TugasState.calDate.getMonth() - 1);
        renderKalender();
    });

    document.getElementById("cal-next").addEventListener("click", () => {
        TugasState.calDate.setMonth(TugasState.calDate.getMonth() + 1);
        renderKalender();
    });

    // Default aktif list
    document.getElementById("btn-view-list").classList.add("active");
}

function renderKalender() {
    var grid = document.getElementById("calendar-grid");
    var title = document.getElementById("cal-month-year");
    if (!grid || !title) return;

    var year = TugasState.calDate.getFullYear();
    var month = TugasState.calDate.getMonth();
    var firstDay = new Date(year, month, 1).getDay(); // 0=Min, 1=Sen
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Title
    var monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    title.textContent = monthNames[month] + " " + year;

    // Map tugas per tanggal (format YYYY-MM-DD)
    var tasksByDate = {};
    TugasState.list.forEach(t => {
        if (t.status_selesai) return; // Sembunyikan yang selesai di kalender
        var d = new Date(t.deadline);
        var key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
        if (!tasksByDate[key]) tasksByDate[key] = [];
        tasksByDate[key].push(t);
    });

    var html = "";

    // Padding awal (Minggu = 0, kita mulai dari Senin = 1)
    var startOffset = firstDay === 0 ? 6 : firstDay - 1;
    for (var i = 0; i < startOffset; i++) {
        html += '<div class="cal-day empty"></div>';
    }

    // Days
    var today = new Date();
    for (var d = 1; d <= daysInMonth; d++) {
        var dateKey = year + "-" + String(month+1).padStart(2,'0') + "-" + String(d).padStart(2,'0');
        var hasTask = tasksByDate[dateKey] && tasksByDate[dateKey].length > 0;
        var isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        
        var cls = "cal-day";
        if (hasTask) cls += " has-task";
        if (isToday) cls += " today";

        var dot = hasTask ? '<div class="cal-dot"></div>' : '';
        var dataAttr = hasTask ? `onclick="showTaskListForDate('${dateKey}')"` : '';

        html += `<div class="${cls}" ${dataAttr}>${d}${dot}</div>`;
    }

    grid.innerHTML = html;
}

window.showTaskListForDate = function(dateKey) {
    // Ambil tugas pada tanggal tersebut
    var tasks = TugasState.list.filter(t => {
        if (t.status_selesai) return false;
        var d = new Date(t.deadline);
        var key = d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
        return key === dateKey;
    });

    if (tasks.length === 0) return;
    
    // Tampilkan via alert sederhana atau modal (untuk MVP, kita pakai alert/confirm dulu)
    var msg = "Tugas pada tanggal ini:\n\n";
    tasks.forEach(t => { msg += `- ${t.nama}\n`; });
    
    // Pindah ke tampilan list & filter manual (opsional, untuk simplifikasi kita pakai alert)
    alert(msg);
}

// ==========================================
// MENU POPUP & CRUD (Sama kayak sebelumnya)
// ==========================================
function showTaskMenu(btn, tugasId) {
    closeTaskMenu();
    var rect = btn.getBoundingClientRect();
    var popup = document.createElement("div");
    popup.className = "task-menu-popup";
    popup.style.position = "fixed";
    popup.style.top = (rect.bottom + 4) + "px";
    popup.style.right = (window.innerWidth - rect.right) + "px";
    popup.style.left = "auto";
    popup.style.zIndex = "150";
    popup.style.background = "#fff";
    popup.style.border = "1px solid var(--border)";
    popup.style.borderRadius = "var(--radius)";
    popup.style.boxShadow = "var(--shadow-sm)";
    popup.innerHTML = `
        <button data-act="edit" style="display:block; width:100%; padding:10px 16px; border:none; background:none; text-align:left; font-family:inherit; cursor:pointer;">Edit</button>
        <button data-act="delete" style="display:block; width:100%; padding:10px 16px; border:none; background:none; text-align:left; font-family:inherit; color:var(--danger); border-top:1px solid var(--border-light); cursor:pointer;">Hapus</button>
    `;
    document.body.appendChild(popup);
    popup.querySelector('[data-act="edit"]').onclick = () => { closeTaskMenu(); openTugasModalForEdit(tugasId); };
    popup.querySelector('[data-act="delete"]').onclick = () => { closeTaskMenu(); confirmDeleteTugas(tugasId); };
    setTimeout(() => {
        var handler = (ev) => { if (!popup.contains(ev.target) && ev.target !== btn) { closeTaskMenu(); document.removeEventListener("click", handler, true); } };
        document.addEventListener("click", handler, true);
    }, 0);
}

function closeTaskMenu() {
    var existing = document.querySelector(".task-menu-popup");
    if (existing) existing.remove();
}

// ==========================================
// BUTTON & FILTER WIRING
// ==========================================
function setupTugasButtons() {
    document.getElementById("btn-fab").onclick = openTugasModalForCreate;
    document.getElementById("btn-tambah-header").onclick = openTugasModalForCreate;
    document.getElementById("btn-empty-add").onclick = openTugasModalForCreate;
}

function setupTugasFilters() {
    var chips = document.querySelectorAll("#filter-row .filter-chip");
    chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
            chips.forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            TugasState.filter = chip.getAttribute("data-filter");
            renderTugasList();
        });
    });

    // Search
    document.getElementById("search-input").addEventListener("input", debounce(function(e) {
        TugasState.searchQuery = e.target.value;
        renderTugasList();
    }, 300));

    // Sort
    document.getElementById("sort-select").addEventListener("change", function(e) {
        TugasState.sortBy = e.target.value;
        renderTugasList();
    });
}

// ==========================================
// MODAL SETUP
// ==========================================
function setupTugasModal() {
    document.querySelectorAll('input[name="reminder-mode"]').forEach(function (r) {
        r.addEventListener("change", function () {
            var mode = document.querySelector('input[name="reminder-mode"]:checked').value;
            var wrap = document.getElementById("reminder-custom-wrap");
            if (mode === "custom") {
                wrap.hidden = false;
                if (TugasState.reminderOverride.length === 0) {
                    TugasState.reminderOverride = _cachedDefaultReminders.map(r => ({ satuan: r.satuan, nilai: r.nilai }));
                    if (TugasState.reminderOverride.length === 0) TugasState.reminderOverride.push({ satuan: "jam", nilai: 2 });
                }
                renderOverrideRows();
            } else {
                wrap.hidden = true;
            }
            updateReminderSummary();
        });
    });

    document.getElementById("btn-tambah-reminder-override").onclick = function () {
        TugasState.reminderOverride.push({ satuan: "jam", nilai: 2 });
        renderOverrideRows(); updateReminderSummary();
    };

    document.getElementById("btn-save-tugas").onclick = saveTugasFromModal;
    document.getElementById("btn-quick-matkul").onclick = function () {
        if (typeof openMatkulModalForCreate === "function") openMatkulModalForCreate();
    };
}

function renderOverrideRows() {
    var wrap = document.getElementById("reminder-override-rows");
    if (!wrap) return;
    if (TugasState.reminderOverride.length === 0) {
        wrap.innerHTML = '<p style="font-size:14px;color:var(--text-muted)">Belum ada pengingat.</p>';
        return;
    }
    wrap.innerHTML = TugasState.reminderOverride.map(function (r, i) {
        return `
            <div class="reminder-row">
                <input type="number" min="1" max="999" value="${Number(r.nilai)}" data-ridx="${i}" data-field="nilai">
                <select data-ridx="${i}" data-field="satuan">
                    <option value="menit" ${r.satuan==="menit"?"selected":""}>menit</option>
                    <option value="jam" ${r.satuan==="jam"?"selected":""}>jam</option>
                    <option value="hari" ${r.satuan==="hari"?"selected":""}>hari</option>
                </select>
                <button type="button" class="btn-remove" data-remove-idx="${i}">×</button>
            </div>`;
    }).join("");

    wrap.querySelectorAll("[data-field]").forEach(inp => {
        inp.addEventListener("input", () => {
            var idx = parseInt(inp.getAttribute("data-ridx"), 10);
            if (inp.getAttribute("data-field") === "nilai") TugasState.reminderOverride[idx].nilai = parseInt(inp.value, 10) || 0;
            else TugasState.reminderOverride[idx].satuan = inp.value;
            updateReminderSummary();
        });
    });
    wrap.querySelectorAll("[data-remove-idx]").forEach(btn => {
        btn.addEventListener("click", () => {
            TugasState.reminderOverride.splice(parseInt(btn.getAttribute("data-remove-idx"), 10), 1);
            renderOverrideRows(); updateReminderSummary();
        });
    });
}

function updateReminderSummary() {
    var summary = document.getElementById("reminder-summary");
    if (!summary) return;
    var mode = document.querySelector('input[name="reminder-mode"]:checked').value;
    if (mode === "default") summary.textContent = _cachedDefaultReminders.length + " pengingat default";
    else summary.textContent = TugasState.reminderOverride.filter(r => Number(r.nilai) > 0).length + " pengingat khusus";
}

// ==========================================
// MODAL OPEN
// ==========================================
async function openTugasModalForCreate() {
    var matkulList = await getMatkul();
    if (matkulList.length === 0) {
        showToast("Buat mata kuliah dulu.", "info");
        if (typeof openMatkulModalForCreate === "function") openMatkulModalForCreate();
        return;
    }
    var pengaturan = await getPengaturan();
    _cachedDefaultReminders = (pengaturan && pengaturan.default_reminders) || [];

    TugasState.editing = null;
    TugasState.reminderOverride = [];

    document.getElementById("modal-tugas-title").textContent = "Tugas Baru";
    document.getElementById("tugas-id").value = "";
    document.getElementById("tugas-nama").value = "";
    document.getElementById("tugas-deadline").value = defaultDeadlineLocalValue();
    document.getElementById("tugas-catatan").value = "";
    document.getElementById("tugas-kategori").value = "TUGAS";
    document.getElementById("tugas-prioritas").value = "SEDANG";

    await populateMatkulDropdown("");

    document.querySelector('input[name="reminder-mode"][value="default"]').checked = true;
    document.getElementById("reminder-custom-wrap").hidden = true;
    updateReminderSummary();
    hideTugasError();
    openModal("modal-tugas");
}

async function openTugasModalForEdit(id) {
    var t = TugasState.list.find(x => x.id === id);
    if (!t) return;
    var pengaturan = await getPengaturan();
    _cachedDefaultReminders = (pengaturan && pengaturan.default_reminders) || [];

    TugasState.editing = id;
    document.getElementById("modal-tugas-title").textContent = "Edit Tugas";
    document.getElementById("tugas-id").value = t.id;
    document.getElementById("tugas-nama").value = t.nama || "";
    document.getElementById("tugas-deadline").value = toDateTimeLocalValue(t.deadline);
    document.getElementById("tugas-catatan").value = t.catatan || "";
    document.getElementById("tugas-kategori").value = t.category || "TUGAS";
    document.getElementById("tugas-prioritas").value = t.priority || "SEDANG";

    await populateMatkulDropdown(t.mata_kuliah_id);

    var hasOverride = Array.isArray(t.reminder_override);
    if (hasOverride) {
        document.querySelector('input[name="reminder-mode"][value="custom"]').checked = true;
        TugasState.reminderOverride = t.reminder_override.map(r => ({ satuan: r.satuan, nilai: r.nilai }));
        document.getElementById("reminder-custom-wrap").hidden = false;
        renderOverrideRows();
    } else {
        document.querySelector('input[name="reminder-mode"][value="default"]').checked = true;
        TugasState.reminderOverride = [];
        document.getElementById("reminder-custom-wrap").hidden = true;
    }
    updateReminderSummary();
    hideTugasError();
    openModal("modal-tugas");
}

async function populateMatkulDropdown(selectedId) {
    var sel = document.getElementById("tugas-matkul");
    if (!sel) return;
    var list = await getMatkul();
    sel.innerHTML = '<option value="">— Pilih mata kuliah —</option>' +
        list.map(m => `<option value="${escapeHtml(m.id)}" ${m.id===selectedId?"selected":""}>${escapeHtml(m.nama)}</option>`).join("");
}

function defaultDeadlineLocalValue() {
    var d = new Date(); d.setHours(d.getHours() + 2); d.setMinutes(0, 0, 0);
    return toDateTimeLocalValue(d.toISOString());
}

// ==========================================
// SAVE / DELETE / TOGGLE (Sama kayak sebelumnya)
// ==========================================
async function saveTugasFromModal() {
    hideTugasError();
    var id = document.getElementById("tugas-id").value;
    var nama = document.getElementById("tugas-nama").value.trim();
    var matkulId = document.getElementById("tugas-matkul").value;
    var deadlineLocal = document.getElementById("tugas-deadline").value;
    var catatan = document.getElementById("tugas-catatan").value.trim();
    var category = document.getElementById("tugas-kategori").value;
    var priority = document.getElementById("tugas-prioritas").value;

    if (!nama) return showTugasError("Nama wajib diisi.");
    if (!matkulId) return showTugasError("Pilih matkul.");
    if (!deadlineLocal) return showTugasError("Deadline wajib.");
    var deadlineISO = parseDateTimeLocal(deadlineLocal);

    var mode = document.querySelector('input[name="reminder-mode"]:checked').value;
    var reminderOverride = null;
    if (mode === "custom") {
        reminderOverride = TugasState.reminderOverride.filter(r => r && r.satuan && Number(r.nilai) > 0);
        if (reminderOverride.length === 0) return showTugasError("Tambahkan pengingat atau pilih default.");
    }

    try {
        var tugas;
        if (id) {
            var existing = TugasState.list.find(t => t.id === id);
            tugas = Object.assign({}, existing, { nama, mata_kuliah_id: matkulId, deadline: deadlineISO, catatan, category, priority, reminder_override: reminderOverride, updated_at: getNowISO() });
        } else {
            tugas = { id: generateId(), nama, mata_kuliah_id: matkulId, deadline: deadlineISO, catatan, status_selesai: false, category, priority, reminder_override: reminderOverride, created_at: getNowISO(), updated_at: getNowISO() };
        }
        await saveTugas(tugas);
        await syncNotifikasiTugas(tugas);
        closeModal("modal-tugas");
        showToast(id ? "Diperbarui." : "Ditambahkan.", "success");
        await loadAndRenderTugas();
        if (TugasState.viewMode === "calendar") renderKalender();
    } catch (e) {
        showTugasError("Gagal menyimpan.");
    }
}

async function toggleTugasSelesai(id) {
    var t = TugasState.list.find(x => x.id === id);
    if (!t) return;
    var willComplete = !t.status_selesai;
    var updated = Object.assign({}, t, { status_selesai: willComplete, updated_at: getNowISO() });
    try {
        await saveTugas(updated); await syncNotifikasiTugas(updated);
        if (willComplete) { fireConfetti(); showToast("Selesai!", "success"); }
        await loadAndRenderTugas();
        if (TugasState.viewMode === "calendar") renderKalender();
    } catch (e) { showToast("Gagal update status.", "error"); }
}

async function confirmDeleteTugas(id) {
    var t = TugasState.list.find(x => x.id === id);
    if (!t) return;
    if (!await konfirmasi(`Hapus tugas "${t.nama}"?`, "Hapus Tugas")) return;
    try {
        await batalkanNotifikasiTugas(id); await deleteTugas(id);
        showToast("Dihapus.", "success"); await loadAndRenderTugas();
        if (TugasState.viewMode === "calendar") renderKalender();
    } catch (e) { showToast("Gagal hapus.", "error"); }
}

function fireConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#e8aa42", "#121212", "#214c7e", "#cecdca"];
    for (var i = 0; i < 24; i++) {
        (function () {
            var piece = document.createElement("div"); piece.className = "confetti-piece";
            piece.style.left = (Math.random() * 100) + "%"; piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = (Math.random() * 0.2) + "s"; piece.style.animationDuration = (0.9 + Math.random() * 0.4) + "s";
            piece.style.top = "-10px"; document.body.appendChild(piece);
            setTimeout(function () { if (piece.parentNode) piece.remove(); }, 1500);
        })();
    }
}

function showTugasError(msg) { var el = document.getElementById("tugas-error"); if (el) { el.textContent = msg; el.hidden = false; } }
function hideTugasError() { var el = document.getElementById("tugas-error"); if (el) { el.textContent = ""; el.hidden = true; } }

console.log("[Deadline] tugas.js loaded (v2.0 Full)");
