// ==========================================
// pengaturan.js — Pengingat Default + Info Storage
// ==========================================

var PengaturanState = {
    reminders: [],
    inited: false
};

// ==========================================
// INIT
// ==========================================
async function initPengaturan() {
    await loadPengaturan();
    if (!PengaturanState.inited) {
        setupPengaturanButtons();
        updateStorageInfo();
        PengaturanState.inited = true;
    }
}

async function loadPengaturan() {
    var p = await getPengaturan();
    PengaturanState.reminders = (p && Array.isArray(p.default_reminders))
        ? p.default_reminders.map(function (r) { return { satuan: r.satuan, nilai: Number(r.nilai) || 0 }; })
        : [];
    renderDefaultReminders();
}

// ==========================================
// RENDER DEFAULT REMINDERS
// ==========================================
function renderDefaultReminders() {
    var el = document.getElementById("reminder-default-rows");
    if (!el) return;

    if (PengaturanState.reminders.length === 0) {
        el.innerHTML =
            '<p style="font-size:14px;color:var(--ink-subtle);padding:6px 0">' +
            'Belum ada pengingat default. Tugas baru tidak akan punya pengingat otomatis.</p>';
        return;
    }

    el.innerHTML = PengaturanState.reminders.map(function (r, i) {
        return (
            '<div class="reminder-row">' +
                '<input type="number" min="1" max="999" ' +
                    'value="' + Number(r.nilai) + '" ' +
                    'data-idx="' + i + '" data-field="nilai" aria-label="Jumlah">' +
                '<select data-idx="' + i + '" data-field="satuan" aria-label="Satuan">' +
                    '<option value="menit"' + (r.satuan === "menit" ? " selected" : "") + '>menit</option>' +
                    '<option value="jam"' + (r.satuan === "jam" ? " selected" : "") + '>jam</option>' +
                    '<option value="hari"' + (r.satuan === "hari" ? " selected" : "") + '>hari</option>' +
                '</select>' +
                '<button type="button" class="btn-remove" ' +
                    'data-remove-idx="' + i + '" aria-label="Hapus baris">×</button>' +
            '</div>'
        );
    }).join("");

    // Wire input & select
    el.querySelectorAll("[data-field]").forEach(function (inp) {
        inp.addEventListener("change", async function () {
            var idx = parseInt(inp.getAttribute("data-idx"), 10);
            var field = inp.getAttribute("data-field");
            if (field === "nilai") {
                PengaturanState.reminders[idx].nilai = parseInt(inp.value, 10) || 1;
                if (PengaturanState.reminders[idx].nilai < 1) PengaturanState.reminders[idx].nilai = 1;
                inp.value = PengaturanState.reminders[idx].nilai;
            } else {
                PengaturanState.reminders[idx].satuan = inp.value;
            }
            await saveDefaultReminders();
        });
    });

    // Wire hapus baris
    el.querySelectorAll("[data-remove-idx]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
            var idx = parseInt(btn.getAttribute("data-remove-idx"), 10);
            PengaturanState.reminders.splice(idx, 1);
            renderDefaultReminders();
            await saveDefaultReminders();
        });
    });
}

// ==========================================
// SAVE
// ==========================================
async function saveDefaultReminders() {
    try {
        var pengaturan = await getPengaturan() || {};
        pengaturan.default_reminders = PengaturanState.reminders;
        await savePengaturan(pengaturan);
        showToast("Pengingat default disimpan.", "success");
    } catch (e) {
        console.error("[Deadline] saveDefaultReminders gagal:", e);
        showToast("Gagal menyimpan pengaturan.", "error");
    }
}

// ==========================================
// BUTTON WIRING
// ==========================================
function setupPengaturanButtons() {
    var btnAdd = document.getElementById("btn-tambah-reminder-default");
    if (btnAdd) {
        btnAdd.addEventListener("click", async function () {
            PengaturanState.reminders.push({ satuan: "jam", nilai: 2 });
            renderDefaultReminders();
            await saveDefaultReminders();
        });
    }

    // TAMBAHKAN BARIS INI:
    var btnTest = document.getElementById("btn-test-notif");
    if (btnTest) {
        btnTest.addEventListener("click", function() {
            if (typeof testNotifikasi === "function") testNotifikasi();
        });
    }
}

// ==========================================
// STORAGE INFO
// ==========================================
function updateStorageInfo() {
    var el = document.getElementById("storage-info");
    if (!el) return;
    var isNative = (typeof _isCapacitorNative === "function" && _isCapacitorNative());
    el.textContent = isNative ? "Perangkat (Preferences)" : "Browser (localStorage)";
}

console.log("[Deadline] pengaturan.js loaded");
