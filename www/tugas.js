// ==========================================
// tugas.js — CRUD Tugas + Filter + Reminder Override
// ==========================================
// Field tugas (ERD §1):
//   id, nama, mata_kuliah_id, deadline (ISO), catatan,
//   status_selesai, reminder_override (inline), created_at, updated_at
// PRD §5.1: deadline = timestamp absolut, tidak berubah oleh toggle
// ==========================================

var TugasState = {
    list: [],
    filter: "semua",
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
        TugasState.inited = true;
    }
}

async function loadAndRenderTugas() {
    TugasState.list = await getTugas();
    await renderTugasList();
}

// ==========================================
// FILTER & SORT
// ==========================================
function filterTugas(list, filter) {
    var now = Date.now();
    var todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    var todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
    var weekEnd = new Date(now + 7 * 86400000);

    return list.filter(function (t) {
        if (filter === "selesai") return !!t.status_selesai;
        if (t.status_selesai) return false;

        var dl = new Date(t.deadline).getTime();
        if (isNaN(dl)) return filter === "semua";

        if (filter === "hari") return dl >= todayStart.getTime() && dl <= todayEnd.getTime();
        if (filter === "minggu") return dl >= now && dl <= weekEnd.getTime();
        if (filter === "terlambat") return dl < now;
        return true; // semua
    });
}

function compareTugas(a, b) {
    // Selesai selalu di bawah, diurutkan by updated_at desc
    if (a.status_selesai && b.status_selesai) {
        return (b.updated_at || "").localeCompare(a.updated_at || "");
    }
    if (a.status_selesai !== b.status_selesai) return a.status_selesai ? 1 : -1;

    var da = new Date(a.deadline).getTime();
    var db = new Date(b.deadline).getTime();
    if (isNaN(da)) return 1;
    if (isNaN(db)) return -1;
    return da - db;
}

// ==========================================
// RENDER
// ==========================================
async function renderTugasList() {
    var el = document.getElementById("task-list");
    var empty = document.getElementById("task-empty");
    if (!el || !empty) return;

    var matkulList = await getMatkul();
    var matkulMap = {};
    matkulList.forEach(function (m) { matkulMap[m.id] = m; });

    var filtered = filterTugas(TugasState.list, TugasState.filter);
    filtered.sort(compareTugas);

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
    var warna = matkul ? matkul.warna : "#3B82F6";
    var namaMatkul = matkul ? matkul.nama : "Tanpa Matkul";
    var overdue = isTerlambat(t);

    var cardCls = "task-card";
    if (overdue) cardCls += " is-overdue";
    if (t.status_selesai) cardCls += " is-done";

    var deadlineCls = "";
    if (overdue) deadlineCls = "is-overdue";
    else if (isDalamRentangHari(t, 1)) deadlineCls = "is-soon";

    var catatan = t.catatan ? renderCatatan(t.catatan) : "";

    return (
        '<div class="' + cardCls + '" data-id="' + escapeHtml(t.id) + '" style="--accent:' + escapeHtml(warna) + '">' +
            '<button class="task-checkbox" data-check-id="' + escapeHtml(t.id) + '" aria-label="' + (t.status_selesai ? "Tandai belum selesai" : "Tandai selesai") + '">' +
                '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</button>' +
            '<div class="task-body">' +
                '<div class="task-title">' + escapeHtml(t.nama) + '</div>' +
                '<div class="task-meta">' +
                    '<span class="task-matkul"><span class="task-matkul-dot"></span>' + escapeHtml(namaMatkul) + '</span>' +
                    '<span class="task-deadline ' + deadlineCls + '">' + (overdue ? "⚠ " : "") + escapeHtml(formatRelatif(t.deadline)) + '</span>' +
                '</div>' +
                catatan +
            '</div>' +
            '<button class="task-menu" data-menu-id="' + escapeHtml(t.id) + '" aria-label="Menu">⋯</button>' +
        '</div>'
    );
}

function renderCatatan(catatan) {
    // Deteksi URL sederhana → jadikan clickable
    var safe = escapeHtml(catatan);
    var linked = safe.replace(/(https?:\/\/[^\s]+)/g, function (url) {
        return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + url + '</a>';
    });
    return '<div class="task-note">' + linked + '</div>';
}

function updateEmptyMessage(filter) {
    var title = document.querySelector("#task-empty .empty-title");
    var desc = document.querySelector("#task-empty .empty-desc");
    if (!title || !desc) return;

    var messages = {
        semua: { t: "Belum ada tugas", d: "Yuk, catat tugas pertamamu — cukup 30 detik." },
        hari: { t: "Tidak ada tugas hari ini", d: "Kerja bagus! Nikmati harimu." },
        minggu: { t: "Minggu ini kosong", d: "Belum ada deadline dalam 7 hari ke depan." },
        terlambat: { t: "Tidak ada yang terlambat", d: "Kamu on track. Semangat!" },
        selesai: { t: "Belum ada yang selesai", d: "Selesaikan tugas dan lihat hasilnya di sini." }
    };
    var m = messages[filter] || messages.semua;
    title.textContent = m.t;
    desc.textContent = m.d;
}

function wireTaskEvents() {
    var list = document.getElementById("task-list");
    if (!list) return;

    // Checkbox toggle
    list.querySelectorAll("[data-check-id]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            toggleTugasSelesai(btn.getAttribute("data-check-id"));
        });
    });

    // Menu ⋯ → popup Edit / Hapus
    list.querySelectorAll("[data-menu-id]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            showTaskMenu(btn, btn.getAttribute("data-menu-id"));
        });
    });
}

// ==========================================
// MENU POPUP
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
    popup.innerHTML =
        '<button data-act="edit">Edit</button>' +
        '<button data-act="delete" class="danger">Hapus</button>';
    document.body.appendChild(popup);

    popup.querySelector('[data-act="edit"]').addEventListener("click", function () {
        closeTaskMenu();
        openTugasModalForEdit(tugasId);
    });
    popup.querySelector('[data-act="delete"]').addEventListener("click", function () {
        closeTaskMenu();
        confirmDeleteTugas(tugasId);
    });

    setTimeout(function () {
        var handler = function (ev) {
            if (!popup.contains(ev.target) && ev.target !== btn) {
                closeTaskMenu();
                document.removeEventListener("click", handler, true);
            }
        };
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
    var fab = document.getElementById("btn-fab");
    if (fab) fab.addEventListener("click", openTugasModalForCreate);

    var btnHeader = document.getElementById("btn-tambah-header");
    if (btnHeader) btnHeader.addEventListener("click", openTugasModalForCreate);

    var btnEmpty = document.getElementById("btn-empty-add");
    if (btnEmpty) btnEmpty.addEventListener("click", openTugasModalForCreate);
}

function setupTugasFilters() {
    var chips = document.querySelectorAll("#filter-row .filter-chip");
    chips.forEach(function (chip) {
        chip.addEventListener("click", function () {
            chips.forEach(function (c) { c.classList.remove("active"); });
            chip.classList.add("active");
            TugasState.filter = chip.getAttribute("data-filter");
            renderTugasList();
        });
    });
}

// ==========================================
// MODAL SETUP
// ==========================================
function setupTugasModal() {
    // Radio mode default/custom
    document.querySelectorAll('input[name="reminder-mode"]').forEach(function (r) {
        r.addEventListener("change", function () {
            var mode = document.querySelector('input[name="reminder-mode"]:checked').value;
            var wrap = document.getElementById("reminder-custom-wrap");
            if (mode === "custom") {
                wrap.hidden = false;
                if (TugasState.reminderOverride.length === 0) {
                    // Prefill dari default (biar gak mulai kosong)
                    TugasState.reminderOverride = _cachedDefaultReminders.map(function (r) {
                        return { satuan: r.satuan, nilai: r.nilai };
                    });
                    if (TugasState.reminderOverride.length === 0) {
                        TugasState.reminderOverride.push({ satuan: "jam", nilai: 2 });
                    }
                }
                renderOverrideRows();
            } else {
                wrap.hidden = true;
            }
            updateReminderSummary();
        });
    });

    // Tambah baris override
    var btnAddRow = document.getElementById("btn-tambah-reminder-override");
    if (btnAddRow) btnAddRow.addEventListener("click", function () {
        TugasState.reminderOverride.push({ satuan: "jam", nilai: 2 });
        renderOverrideRows();
        updateReminderSummary();
    });

    // Simpan
    var btnSave = document.getElementById("btn-save-tugas");
    if (btnSave) btnSave.addEventListener("click", saveTugasFromModal);

    // Quick-add matkul dari dalam modal tugas
    var btnQuickMatkul = document.getElementById("btn-quick-matkul");
    if (btnQuickMatkul) btnQuickMatkul.addEventListener("click", function () {
        if (typeof openMatkulModalForCreate === "function") {
            openMatkulModalForCreate();
        }
    });

    // Enter di nama → pindah ke deadline (UX kecil)
    var namaInput = document.getElementById("tugas-nama");
    if (namaInput) namaInput.addEventListener("keydown", function (e) {
        if (e.key === "Enter") {
            e.preventDefault();
            document.getElementById("tugas-matkul").focus();
        }
    });
}

// ==========================================
// REMINDER OVERRIDE ROWS
// ==========================================
function renderOverrideRows() {
    var wrap = document.getElementById("reminder-override-rows");
    if (!wrap) return;

    if (TugasState.reminderOverride.length === 0) {
        wrap.innerHTML = '<p style="font-size:14px;color:#94A3B8;padding:4px 0">Belum ada pengingat. Klik tombol di bawah untuk menambah.</p>';
        return;
    }

    wrap.innerHTML = TugasState.reminderOverride.map(function (r, i) {
        return (
            '<div class="reminder-row">' +
                '<input type="number" min="1" max="999" value="' + Number(r.nilai) + '" data-ridx="' + i + '" data-field="nilai" aria-label="Jumlah">' +
                '<select data-ridx="' + i + '" data-field="satuan" aria-label="Satuan">' +
                    '<option value="menit"' + (r.satuan === "menit" ? " selected" : "") + '>menit</option>' +
                    '<option value="jam"' + (r.satuan === "jam" ? " selected" : "") + '>jam</option>' +
                    '<option value="hari"' + (r.satuan === "hari" ? " selected" : "") + '>hari</option>' +
                '</select>' +
                '<button type="button" class="btn-remove" data-remove-idx="' + i + '" aria-label="Hapus baris">×</button>' +
            '</div>'
        );
    }).join("");

    wrap.querySelectorAll("[data-field]").forEach(function (inp) {
        inp.addEventListener("input", function () {
            var idx = parseInt(inp.getAttribute("data-ridx"), 10);
            var field = inp.getAttribute("data-field");
            if (field === "nilai") TugasState.reminderOverride[idx].nilai = parseInt(inp.value, 10) || 0;
            else TugasState.reminderOverride[idx].satuan = inp.value;
            updateReminderSummary();
        });
    });

    wrap.querySelectorAll("[data-remove-idx]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            var idx = parseInt(btn.getAttribute("data-remove-idx"), 10);
            TugasState.reminderOverride.splice(idx, 1);
            renderOverrideRows();
            updateReminderSummary();
        });
    });
}

function updateReminderSummary() {
    var summary = document.getElementById("reminder-summary");
    if (!summary) return;
    var mode = document.querySelector('input[name="reminder-mode"]:checked').value;

    if (mode === "default") {
        var count = _cachedDefaultReminders.length;
        summary.textContent = count === 0 ? "Belum ada default" : count + " pengingat default";
    } else {
        var valid = TugasState.reminderOverride.filter(function (r) {
            return r && Number(r.nilai) > 0;
        }).length;
        summary.textContent = valid + " pengingat khusus";
    }
}

// ==========================================
// MODAL OPEN — CREATE
// ==========================================
async function openTugasModalForCreate() {
    var matkulList = await getMatkul();
    if (matkulList.length === 0) {
        showToast("Buat mata kuliah dulu sebelum menambah tugas.", "info");
        if (typeof openMatkulModalForCreate === "function") openMatkulModalForCreate();
        return;
    }

    // Cache default reminders untuk summary & prefill
    var pengaturan = await getPengaturan();
    _cachedDefaultReminders = (pengaturan && pengaturan.default_reminders) || [];

    TugasState.editing = null;
    TugasState.reminderOverride = [];

    document.getElementById("modal-tugas-title").textContent = "Tugas Baru";
    document.getElementById("tugas-id").value = "";
    document.getElementById("tugas-nama").value = "";
    document.getElementById("tugas-deadline").value = defaultDeadlineLocalValue();
    document.getElementById("tugas-catatan").value = "";

    await populateMatkulDropdown("");

    // Reset mode ke default
    var radioDefault = document.querySelector('input[name="reminder-mode"][value="default"]');
    if (radioDefault) radioDefault.checked = true;
    var customWrap = document.getElementById("reminder-custom-wrap");
    if (customWrap) customWrap.hidden = true;
    updateReminderSummary();

    hideTugasError();
    openModal("modal-tugas");
    setTimeout(function () {
        document.getElementById("tugas-nama").focus();
    }, 180);
}

// ==========================================
// MODAL OPEN — EDIT
// ==========================================
async function openTugasModalForEdit(id) {
    var t = TugasState.list.find(function (x) { return x.id === id; });
    if (!t) { showToast("Tugas tidak ditemukan.", "error"); return; }

    var pengaturan = await getPengaturan();
    _cachedDefaultReminders = (pengaturan && pengaturan.default_reminders) || [];

    TugasState.editing = id;

    document.getElementById("modal-tugas-title").textContent = "Edit Tugas";
    document.getElementById("tugas-id").value = t.id;
    document.getElementById("tugas-nama").value = t.nama || "";
    document.getElementById("tugas-deadline").value = toDateTimeLocalValue(t.deadline);
    document.getElementById("tugas-catatan").value = t.catatan || "";

    await populateMatkulDropdown(t.mata_kuliah_id);

    // Reminder mode
    var hasOverride = Array.isArray(t.reminder_override);
    var customWrap = document.getElementById("reminder-custom-wrap");

    if (hasOverride) {
        document.querySelector('input[name="reminder-mode"][value="custom"]').checked = true;
        TugasState.reminderOverride = t.reminder_override.map(function (r) {
            return { satuan: r.satuan, nilai: r.nilai };
        });
        if (customWrap) customWrap.hidden = false;
        renderOverrideRows();
    } else {
        document.querySelector('input[name="reminder-mode"][value="default"]').checked = true;
        TugasState.reminderOverride = [];
        if (customWrap) customWrap.hidden = true;
    }
    updateReminderSummary();

    hideTugasError();
    openModal("modal-tugas");
}

// ==========================================
// HELPERS — FORM
// ==========================================
async function populateMatkulDropdown(selectedId) {
    var sel = document.getElementById("tugas-matkul");
    if (!sel) return;
    var list = await getMatkul();
    sel.innerHTML = '<option value="">— Pilih mata kuliah —</option>' +
        list.map(function (m) {
            var selAttr = m.id === selectedId ? " selected" : "";
            return '<option value="' + escapeHtml(m.id) + '"' + selAttr + '>' + escapeHtml(m.nama) + '</option>';
        }).join("");
}

function defaultDeadlineLocalValue() {
    var d = new Date();
    d.setHours(d.getHours() + 2);
    d.setMinutes(0, 0, 0);
    return toDateTimeLocalValue(d.toISOString());
}

// ==========================================
// SAVE
// ==========================================
async function saveTugasFromModal() {
    hideTugasError();

    var id = document.getElementById("tugas-id").value;
    var nama = document.getElementById("tugas-nama").value.trim();
    var matkulId = document.getElementById("tugas-matkul").value;
    var deadlineLocal = document.getElementById("tugas-deadline").value;
    var catatan = document.getElementById("tugas-catatan").value.trim();

    if (!nama) return showTugasError("Nama tugas wajib diisi.");
    if (nama.length > 120) return showTugasError("Nama terlalu panjang (maks 120 karakter).");
    if (!matkulId) return showTugasError("Pilih mata kuliah dulu.");
    if (!deadlineLocal) return showTugasError("Deadline wajib diisi.");

    var deadlineISO = parseDateTimeLocal(deadlineLocal);
    if (!deadlineISO) return showTugasError("Format deadline tidak valid.");

    // Mode reminder
    var mode = document.querySelector('input[name="reminder-mode"]:checked').value;
    var reminderOverride = null;

    if (mode === "custom") {
        var cleaned = TugasState.reminderOverride.filter(function (r) {
            return r && r.satuan && Number(r.nilai) > 0;
        });
        if (cleaned.length === 0) {
            return showTugasError("Tambahkan minimal 1 pengingat, atau pilih mode default.");
        }
        reminderOverride = cleaned;
    }

    try {
        var tugas;
        if (id) {
            var existing = TugasState.list.find(function (t) { return t.id === id; });
            if (!existing) return showTugasError("Tugas tidak ditemukan.");
            tugas = Object.assign({}, existing, {
                nama: nama,
                mata_kuliah_id: matkulId,
                deadline: deadlineISO,
                catatan: catatan,
                reminder_override: reminderOverride,
                updated_at: getNowISO()
            });
        } else {
            tugas = {
                id: generateId(),
                nama: nama,
                mata_kuliah_id: matkulId,
                deadline: deadlineISO,
                catatan: catatan,
                status_selesai: false,
                reminder_override: reminderOverride,
                created_at: getNowISO(),
                updated_at: getNowISO()
            };
        }

        await saveTugas(tugas);
        await syncNotifikasiTugas(tugas);

        closeModal("modal-tugas");
        showToast(id ? "Tugas diperbarui." : "Tugas ditambahkan.", "success");
        await loadAndRenderTugas();
    } catch (e) {
        console.error("[Deadline] saveTugas gagal:", e);
        showTugasError("Gagal menyimpan: " + (e.message || "coba lagi."));
    }
}

// ==========================================
// TOGGLE SELESAI
// ==========================================
async function toggleTugasSelesai(id) {
    var t = TugasState.list.find(function (x) { return x.id === id; });
    if (!t) return;

    var willComplete = !t.status_selesai;
    var updated = Object.assign({}, t, {
        status_selesai: willComplete,
        updated_at: getNowISO()
    });
    // PENTING: t.deadline TIDAK BERUBAH (PRD §5.1)

    try {
        await saveTugas(updated);
        // Sync: kalau completed → cancel semua; kalau undo → schedule ulang yang future
        await syncNotifikasiTugas(updated);

        if (willComplete) {
            fireConfetti();
            showToast("Selesai! Kerja bagus.", "success");
        } else {
            showToast("Ditandai belum selesai.", "info");
        }

        await loadAndRenderTugas();
    } catch (e) {
        console.error("[Deadline] toggle gagal:", e);
        showToast("Gagal mengubah status.", "error");
    }
}

// ==========================================
// DELETE
// ==========================================
async function confirmDeleteTugas(id) {
    var t = TugasState.list.find(function (x) { return x.id === id; });
    if (!t) return;

    if (!await konfirmasi('Hapus tugas "' + t.nama + '"?\n\nPengingat yang terjadwal akan dibatalkan.', "Hapus Tugas")) return;

    try {
        await batalkanNotifikasiTugas(id);
        await deleteTugas(id);
        showToast("Tugas dihapus.", "success");
        await loadAndRenderTugas();
    } catch (e) {
        console.error("[Deadline] delete gagal:", e);
        showToast("Gagal menghapus.", "error");
    }
}

// ==========================================
// CONFETTI (Skylearn motion)
// ==========================================
function fireConfetti() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    var colors = ["#3B82F6", "#FBBF24", "#22C55E", "#A855F7"];
    for (var i = 0; i < 24; i++) {
        (function () {
            var piece = document.createElement("div");
            piece.className = "confetti-piece";
            piece.style.left = (Math.random() * 100) + "%";
            piece.style.background = colors[Math.floor(Math.random() * colors.length)];
            piece.style.animationDelay = (Math.random() * 0.2) + "s";
            piece.style.animationDuration = (0.9 + Math.random() * 0.4) + "s";
            piece.style.top = "-10px";
            document.body.appendChild(piece);
            setTimeout(function () {
                if (piece.parentNode) piece.remove();
            }, 1500);
        })();
    }
}

// ==========================================
// HELPERS
// ==========================================
function showTugasError(msg) {
    var el = document.getElementById("tugas-error");
    if (el) { el.textContent = msg; el.hidden = false; }
}
function hideTugasError() {
    var el = document.getElementById("tugas-error");
    if (el) { el.textContent = ""; el.hidden = true; }
}

console.log("[Deadline] tugas.js loaded");
