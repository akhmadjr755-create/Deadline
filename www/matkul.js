// ==========================================
// matkul.js — CRUD Mata Kuliah + Color Picker
// ==========================================

// Palet warna dari Skylearn + turunannya (mudah dibedakan)
var WARNA_PALETTE = [
    "#3B82F6", // Sky
    "#22C55E", // Leaf
    "#FBBF24", // Sun
    "#F87171", // Coral
    "#A855F7", // Berry
    "#06B6D4", // Cyan
    "#EC4899", // Pink
    "#F97316"  // Orange
];

var MatkulState = {
    list: [],
    editing: null, // null = create, else id
    selectedWarna: WARNA_PALETTE[0],
    inited: false
};

// ==========================================
// INIT
// ==========================================
async function initMatkul() {
    await loadAndRenderMatkul();
    if (!MatkulState.inited) {
        setupMatkulButtons();
        MatkulState.inited = true;
    }
}

async function loadAndRenderMatkul() {
    MatkulState.list = await getMatkul();
    await renderMatkulList();
}

// ==========================================
// RENDER
// ==========================================
async function renderMatkulList() {
    var el = document.getElementById("matkul-list");
    var empty = document.getElementById("matkul-empty");
    if (!el) return;

    if (MatkulState.list.length === 0) {
        el.innerHTML = "";
        if (empty) empty.hidden = false;
        return;
    }
    if (empty) empty.hidden = true;

    // Hitung jumlah tugas per matkul
    var tugasAll = await getTugas();
    var countMap = {};
    tugasAll.forEach(function (t) {
        if (!t.status_selesai) {
            countMap[t.mata_kuliah_id] = (countMap[t.mata_kuliah_id] || 0) + 1;
        }
    });

    el.innerHTML = MatkulState.list.map(function (m) {
        var count = countMap[m.id] || 0;
        var countLabel = count === 0
            ? "Tidak ada tugas aktif"
            : count + " tugas aktif";
        return (
            '<div class="matkul-card" data-matkul-id="' + escapeHtml(m.id) + '">' +
                '<div class="matkul-color-bar" style="background:' + escapeHtml(m.warna) + '"></div>' +
                '<div class="matkul-info">' +
                    '<div class="matkul-name">' + escapeHtml(m.nama) + '</div>' +
                    '<div class="matkul-count">' + escapeHtml(countLabel) + '</div>' +
                '</div>' +
                '<div class="matkul-actions">' +
                    '<button class="matkul-action-btn" data-action="edit" data-id="' + escapeHtml(m.id) + '" title="Edit">' +
                        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
                    '</button>' +
                    '<button class="matkul-action-btn danger" data-action="delete" data-id="' + escapeHtml(m.id) + '" title="Hapus">' +
                        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>' +
                    '</button>' +
                '</div>' +
            '</div>'
        );
    }).join("");

    // Wire action buttons
    el.querySelectorAll("[data-action]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
            e.stopPropagation();
            var id = btn.getAttribute("data-id");
            var action = btn.getAttribute("data-action");
            if (action === "edit") openMatkulModalForEdit(id);
            else if (action === "delete") confirmDeleteMatkul(id);
        });
    });
}

// ==========================================
// BUTTON WIRING
// ==========================================
function setupMatkulButtons() {
    var btnAdd = document.getElementById("btn-tambah-matkul");
    if (btnAdd) btnAdd.addEventListener("click", openMatkulModalForCreate);

    var btnEmptyAdd = document.getElementById("btn-empty-matkul");
    if (btnEmptyAdd) btnEmptyAdd.addEventListener("click", openMatkulModalForCreate);

    var btnSave = document.getElementById("btn-save-matkul");
    if (btnSave) btnSave.addEventListener("click", saveMatkulFromModal);
}

// ==========================================
// MODAL OPEN
// ==========================================
function openMatkulModalForCreate() {
    MatkulState.editing = null;
    MatkulState.selectedWarna = WARNA_PALETTE[0];
    document.getElementById("matkul-id").value = "";
    document.getElementById("matkul-nama").value = "";
    document.getElementById("modal-matkul-title").textContent = "Mata Kuliah Baru";
    hideMatkulError();
    renderColorPicker();
    openModal("modal-matkul");
    setTimeout(function () {
        document.getElementById("matkul-nama").focus();
    }, 150);
}

function openMatkulModalForEdit(id) {
    var m = MatkulState.list.find(function (x) { return x.id === id; });
    if (!m) return;
    MatkulState.editing = id;
    MatkulState.selectedWarna = m.warna || WARNA_PALETTE[0];
    document.getElementById("matkul-id").value = m.id;
    document.getElementById("matkul-nama").value = m.nama || "";
    document.getElementById("modal-matkul-title").textContent = "Edit Mata Kuliah";
    hideMatkulError();
    renderColorPicker();
    openModal("modal-matkul");
}

// ==========================================
// COLOR PICKER
// ==========================================
function renderColorPicker() {
    var wrap = document.getElementById("color-picker");
    if (!wrap) return;

    // Kalau warna existing di luar palette, tambahkan sebagai custom swatch
    var palette = WARNA_PALETTE.slice();
    if (MatkulState.selectedWarna && palette.indexOf(MatkulState.selectedWarna) === -1) {
        palette.push(MatkulState.selectedWarna);
    }

    wrap.innerHTML = palette.map(function (c) {
        var active = (c === MatkulState.selectedWarna) ? " active" : "";
        return (
            '<button type="button" class="color-swatch' + active + '" ' +
                'style="--c:' + escapeHtml(c) + '" ' +
                'data-color="' + escapeHtml(c) + '" ' +
                'aria-label="Warna ' + escapeHtml(c) + '"></button>'
        );
    }).join("");

    wrap.querySelectorAll(".color-swatch").forEach(function (sw) {
        sw.addEventListener("click", function () {
            MatkulState.selectedWarna = sw.getAttribute("data-color");
            wrap.querySelectorAll(".color-swatch").forEach(function (s) {
                s.classList.remove("active");
            });
            sw.classList.add("active");
        });
    });
}

// ==========================================
// SAVE
// ==========================================
async function saveMatkulFromModal() {
    hideMatkulError();

    var nama = document.getElementById("matkul-nama").value.trim();
    if (!nama) return showMatkulError("Nama mata kuliah wajib diisi.");
    if (nama.length > 60) return showMatkulError("Nama terlalu panjang (maks 60 karakter).");

    // Cek duplikat nama (case-insensitive), kecuali diri sendiri saat edit
    var dup = MatkulState.list.find(function (m) {
        return m.nama.toLowerCase() === nama.toLowerCase() &&
            m.id !== MatkulState.editing;
    });
    if (dup) return showMatkulError("Nama mata kuliah sudah ada.");

    try {
        if (MatkulState.editing) {
            var existing = MatkulState.list.find(function (m) { return m.id === MatkulState.editing; });
            if (!existing) return showMatkulError("Mata kuliah tidak ditemukan.");
            var updated = Object.assign({}, existing, {
                nama: nama,
                warna: MatkulState.selectedWarna
            });
            await saveMatkul(updated);
            showToast("Mata kuliah diperbarui.", "success");
        } else {
            var baru = {
                id: generateId(),
                nama: nama,
                warna: MatkulState.selectedWarna
            };
            await saveMatkul(baru);
            showToast("Mata kuliah ditambahkan.", "success");
        }
        closeModal("modal-matkul");
        await loadAndRenderMatkul();
    } catch (e) {
        console.error("[Deadline] saveMatkul gagal:", e);
        showMatkulError("Gagal menyimpan. Coba lagi.");
    }
}

// ==========================================
// DELETE
// ==========================================
async function confirmDeleteMatkul(id) {
    var m = MatkulState.list.find(function (x) { return x.id === id; });
    if (!m) return;

    // Cek tugas dulu, biar pesannya jelas sebelum confirm
    var tugasAll = await getTugas();
    var terkait = tugasAll.filter(function (t) { return t.mata_kuliah_id === id; });
    if (terkait.length > 0) {
        var aktif = terkait.filter(function (t) { return !t.status_selesai; }).length;
        var selesai = terkait.length - aktif;
        var detail = [];
        if (aktif > 0) detail.push(aktif + " tugas aktif");
        if (selesai > 0) detail.push(selesai + " tugas selesai");
        showToast(
            "Tidak bisa hapus \"" + m.nama + "\" — masih ada " + detail.join(" & ") + ". Pindahkan atau hapus tugas itu dulu.",
            "error"
        );
        return;
    }

    if (!konfirmasi("Hapus mata kuliah \"" + m.nama + "\"?")) return;

    try {
        await deleteMatkul(id);
        showToast("Mata kuliah dihapus.", "success");
        await loadAndRenderMatkul();
    } catch (e) {
        console.error("[Deadline] deleteMatkul gagal:", e);
        showToast("Gagal menghapus: " + (e.message || "coba lagi."), "error");
    }
}

// ==========================================
// HELPERS
// ==========================================
function showMatkulError(msg) {
    var el = document.getElementById("matkul-error");
    if (el) { el.textContent = msg; el.hidden = false; }
}
function hideMatkulError() {
    var el = document.getElementById("matkul-error");
    if (el) { el.textContent = ""; el.hidden = true; }
}

/**
 * Helper sinkron — baca dari cache MatkulState.
 * Kalau belum init, return null (caller harusnya async getMatkulById).
 */
function getMatkulCached(id) {
    if (!MatkulState.list) return null;
    return MatkulState.list.find(function (m) { return m.id === id; }) || null;
}

console.log("[Deadline] matkul.js loaded");
