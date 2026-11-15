var PengaturanState = {
    reminders: [],
    inited: false
};

async function initPengaturan() {
    await loadPengaturan();
    
    // 1. Isi Dropdown Jam & Menit
    var hourSel = document.getElementById("settings-summary-hour");
    var minSel = document.getElementById("settings-summary-minute");
    
    if (hourSel && hourSel.children.length === 0) {
        for (var i = 0; i < 24; i++) {
            var val = String(i).padStart(2, '0');
            hourSel.innerHTML += `<option value="${val}">${val}</option>`;
        }
    }
    if (minSel && minSel.children.length === 0) {
        for (var i = 0; i < 60; i += 5) { // Kelipatan 5 menit
            var val = String(i).padStart(2, '0');
            minSel.innerHTML += `<option value="${val}">${val}</option>`;
        }
    }

    // 2. Set Nilai Dropdown dari Database
    var p = await getPengaturan();
    if (p && p.daily_summary_time) {
        var parts = p.daily_summary_time.split(":");
        if (hourSel) hourSel.value = parts[0];
        if (minSel) minSel.value = parts[1];
    }

    if (!PengaturanState.inited) {
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

function renderDefaultReminders() {
    var el = document.getElementById("reminder-default-rows");
    if (!el) return;

    if (PengaturanState.reminders.length === 0) {
        el.innerHTML = '<p style="font-size:14px;color:var(--text-muted);padding:6px 0">Belum ada pengingat default.</p>';
        return;
    }

    el.innerHTML = PengaturanState.reminders.map(function (r, i) {
        return (
            '<div class="reminder-row">' +
                '<input type="number" min="1" max="999" value="' + Number(r.nilai) + '" data-idx="' + i + '" data-field="nilai">' +
                '<select data-idx="' + i + '" data-field="satuan">' +
                    '<option value="menit"' + (r.satuan === "menit" ? " selected" : "") + '>menit</option>' +
                    '<option value="jam"' + (r.satuan === "jam" ? " selected" : "") + '>jam</option>' +
                    '<option value="hari"' + (r.satuan === "hari" ? " selected" : "") + '>hari</option>' +
                '</select>' +
                '<button type="button" class="btn-remove" data-remove-idx="' + i + '">×</button>' +
            '</div>'
        );
    }).join("");

    el.querySelectorAll("[data-field]").forEach(function (inp) {
        inp.addEventListener("change", async function () {
            var idx = parseInt(inp.getAttribute("data-idx"), 10);
            var field = inp.getAttribute("data-field");
            if (field === "nilai") {
                PengaturanState.reminders[idx].nilai = parseInt(inp.value, 10) || 1;
                inp.value = PengaturanState.reminders[idx].nilai;
            } else {
                PengaturanState.reminders[idx].satuan = inp.value;
            }
            await saveDefaultReminders();
        });
    });

    el.querySelectorAll("[data-remove-idx]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
            var idx = parseInt(btn.getAttribute("data-remove-idx"), 10);
            PengaturanState.reminders.splice(idx, 1);
            renderDefaultReminders();
            await saveDefaultReminders();
        });
    });
}

async function saveDefaultReminders() {
    try {
        var pengaturan = await getPengaturan() || {};
        pengaturan.default_reminders = PengaturanState.reminders;
        await savePengaturan(pengaturan);
        showToast("Pengingat default disimpan.", "success");
    } catch (e) {
        showToast("Gagal menyimpan pengaturan.", "error");
    }
}

function updateStorageInfo() {
    var el = document.getElementById("storage-info");
    if (!el) return;
    var isNative = (typeof _isCapacitorNative === "function" && _isCapacitorNative());
    el.textContent = isNative ? "Perangkat (Preferences)" : "Browser (localStorage)";
}

// ==========================================
// GLOBAL EVENT LISTENER (ANTI-GAGAL KLIK)
// ==========================================
// Gua pasang di sini biar gak peduli file lain error atau nggak,
// tombol ini PASTI bakal nangkep kliknya.
document.addEventListener("click", async function(e) {
    // 1. Tombol Simpan Rangkuman
    if (e.target && e.target.id === "btn-save-summary") {
        var h = document.getElementById("settings-summary-hour").value;
        var m = document.getElementById("settings-summary-minute").value;
        
        if (!h || !m) return showToast("Pilih jam dan menit.", "error");
        var timeVal = h + ":" + m;
        
        var p = await getPengaturan() || {};
        p.daily_summary_time = timeVal;
        p.daily_summary_enabled = true;
        await savePengaturan(p);
        
        showToast("Rangkuman disimpan jam " + timeVal, "success");
        
        if (typeof scheduleDailySummary === "function") {
            await scheduleDailySummary();
        }
    }

    // 2. Tombol Tambah Pengingat Default
    if (e.target && e.target.id === "btn-tambah-reminder-default") {
        PengaturanState.reminders.push({ satuan: "jam", nilai: 2 });
        renderDefaultReminders();
        await saveDefaultReminders();
    }

    // 3. Tombol Tes Notifikasi
    if (e.target && e.target.id === "btn-test-notif") {
        if (typeof testNotifikasi === "function") testNotifikasi();
    }
});

console.log("[Deadline] pengaturan.js loaded (Global Click)");

// ==========================================
// FUNGSI INLINE ONCLICK (ANTI-GAGAL)
// ==========================================
window.simpanRangkumanPagi = async function() {
    try {
        var h = document.getElementById("settings-summary-hour").value;
        var m = document.getElementById("settings-summary-minute").value;
        
        if (!h || !m) {
            if (typeof showToast === 'function') showToast("Pilih jam dan menit.", "error");
            return;
        }
        
        var timeVal = h + ":" + m;
        var p = await getPengaturan() || {};
        p.daily_summary_time = timeVal;
        p.daily_summary_enabled = true;
        await savePengaturan(p);
        
        if (typeof showToast === 'function') showToast("Rangkuman disimpan jam " + timeVal, "success");
        
        if (typeof scheduleDailySummary === "function") {
            await scheduleDailySummary();
        }
    } catch(e) {
        console.error(e);
        if (typeof showToast === 'function') showToast("Error: " + e.message, "error");
    }
};
