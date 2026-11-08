// ==========================================
// backup.js — Export / Import Backup JSON
// ==========================================
// Format backup (lihat db.js exportAllData):
//   { version, exported_at, app: "Deadline", data: { matkul, tugas, pengaturan } }
//
// Export:
//   - Browser: download .json via Blob URL
//   - Capacitor: Filesystem + Share plugin (kalau ada), fallback clipboard
// Import:
//   - Browser: file picker
//   - Capacitor: paste textarea (tanpa plugin native tambahan)
// ==========================================

// ==========================================
// INIT
// ==========================================
function initBackup() {
    var btnExport = document.getElementById("btn-export");
    if (btnExport) btnExport.addEventListener("click", exportBackup);

    var btnImport = document.getElementById("btn-import");
    if (btnImport) btnImport.addEventListener("click", startImport);

    var fileInput = document.getElementById("file-import");
    if (fileInput) fileInput.addEventListener("change", handleFileImport);
}

// ==========================================
// EXPORT
// ==========================================
async function exportBackup() {
    try {
        var payload = await exportAllData();
        var json = JSON.stringify(payload, null, 2);
        var filename = "deadline-backup-" + getTodayISO() + ".json";

        if (typeof _isCapacitorNative === "function" && _isCapacitorNative()) {
            await _exportNative(json, filename);
        } else {
            _exportBrowser(json, filename);
        }
    } catch (e) {
        console.error("[Deadline] exportBackup gagal:", e);
        showToast("Gagal membuat backup.", "error");
    }
}

function _exportBrowser(json, filename) {
    var blob = new Blob([json], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    showToast("Backup diunduh: " + filename, "success");
}

async function _exportNative(json, filename) {
    var P = window.Capacitor && window.Capacitor.Plugins;

    // Strategi 1: Filesystem + Share
    if (P && P.Filesystem && P.Share) {
        try {
            var base64 = btoa(unescape(encodeURIComponent(json)));
            await P.Filesystem.writeFile({
                path: filename,
                data: base64,
                directory: "CACHE",
                encoding: "base64"
            });
            var uriRes = await P.Filesystem.getUri({
                path: filename,
                directory: "CACHE"
            });
            await P.Share.share({
                title: "Backup Deadline",
                text: "Backup data Deadline tanggal " + getTodayISO(),
                url: uriRes.uri,
                dialogTitle: "Simpan atau bagikan backup"
            });
            return;
        } catch (e) {
            console.warn("[Deadline] Native export gagal, fallback clipboard:", e);
        }
    }

    // Strategi 2: Copy ke clipboard
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(json);
            showToast("Backup disalin ke clipboard. Simpan ke file .json.", "info");
            return;
        }
    } catch (e) { /* ignore */ }

    // Strategi 3: Alert dengan JSON (paling terakhir)
    alert("Copy JSON berikut dan simpan sebagai file .json:\n\n" + json);
}

// ==========================================
// IMPORT
// ==========================================
async function startImport() {
    var isNative = (typeof _isCapacitorNative === "function" && _isCapacitorNative());

    if (isNative) {
        var text = await _promptPasteJSON();
        if (!text) return;
        await _processImport(text);
    } else {
        var input = document.getElementById("file-import");
        if (input) input.click();
    }
}

async function handleFileImport(ev) {
    var file = ev.target.files && ev.target.files[0];
    if (!file) return;
    try {
        var text = await file.text();
        await _processImport(text);
    } catch (e) {
        console.error("[Deadline] handleFileImport gagal:", e);
        showToast("Gagal membaca file.", "error");
    } finally {
        ev.target.value = "";
    }
}

async function _processImport(text) {
    var payload;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        showToast("File bukan JSON yang valid.", "error");
        return;
    }

    if (!payload || payload.app !== "Deadline" || !payload.data) {
        showToast("File bukan backup Deadline yang valid.", "error");
        return;
    }

    var mode = await _confirmImportMode(payload);
    if (!mode) return;

    try {
        await importAllData(payload, mode);
        showToast("Data berhasil dipulihkan.", "success");

        // Refresh UI kalau fungsi tersedia
        if (typeof loadAndRenderMatkul === "function") await loadAndRenderMatkul();
        if (typeof loadPengaturan === "function") await loadPengaturan();
        if (typeof loadAndRenderTugas === "function") await loadAndRenderTugas();

        // Reschedule notifikasi untuk tugas yang belum selesai
        await _rescheduleAllNotifications();
    } catch (e) {
        console.error("[Deadline] import gagal:", e);
        showToast("Gagal memulihkan: " + (e.message || "coba lagi."), "error");
    }
}

async function _rescheduleAllNotifications() {
    if (typeof syncNotifikasiTugas !== "function") return;
    try {
        var tugasAll = await getTugas();
        for (var i = 0; i < tugasAll.length; i++) {
            try {
                await syncNotifikasiTugas(tugasAll[i]);
            } catch (e) {
                console.warn("[Deadline] reschedule satu tugas gagal:", e);
            }
        }
    } catch (e) {
        console.warn("[Deadline] reschedule gagal:", e);
    }
}

// ==========================================
// MODAL: PASTE JSON (untuk native tanpa file picker)
// ==========================================
function _promptPasteJSON() {
    return new Promise(function (resolve) {
        var overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.zIndex = "500";
        overlay.innerHTML =
            '<div class="modal">' +
                '<div class="modal-head">' +
                    '<h2 class="modal-title">Tempel Backup</h2>' +
                    '<button class="btn-close" aria-label="Tutup">×</button>' +
                '</div>' +
                '<p class="card-desc">Buka file backup .json di aplikasi lain, salin semua isinya, lalu tempel di sini.</p>' +
                '<textarea class="input-field input-textarea" rows="8" placeholder=\'{"app":"Deadline",...}\' ' +
                    'style="margin-top:12px;font-family:var(--font-mono);font-size:12px;min-height:160px"></textarea>' +
                '<div class="modal-actions" style="margin-top:16px">' +
                    '<button class="btn btn-ghost" data-act="cancel">Batal</button>' +
                    '<button class="btn btn-primary" data-act="ok">Pulihkan</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");

        var ta = overlay.querySelector("textarea");
        function cleanup() {
            overlay.remove();
            document.body.classList.remove("modal-open");
        }
        overlay.querySelector('[data-act="cancel"]').addEventListener("click", function () {
            cleanup(); resolve(null);
        });
        overlay.querySelector(".btn-close").addEventListener("click", function () {
            cleanup(); resolve(null);
        });
        overlay.querySelector('[data-act="ok"]').addEventListener("click", function () {
            var v = ta.value.trim();
            cleanup();
            resolve(v || null);
        });
        setTimeout(function () { ta.focus(); }, 150);
    });
}

// ==========================================
// MODAL: KONFIRMASI MODE IMPORT
// ==========================================
function _confirmImportMode(payload) {
    return new Promise(function (resolve) {
        var overlay = document.createElement("div");
        overlay.className = "modal-overlay";
        overlay.style.zIndex = "500";

        var exportedAt = payload.exported_at ? formatTanggalWaktu(payload.exported_at) : "tidak diketahui";
        var countMatkul = (payload.data.matkul || []).length;
        var countTugas = (payload.data.tugas || []).length;

        overlay.innerHTML =
            '<div class="modal">' +
                '<div class="modal-head">' +
                    '<h2 class="modal-title">Pulihkan Backup?</h2>' +
                    '<button class="btn-close" aria-label="Tutup">×</button>' +
                '</div>' +
                '<p class="card-desc">' +
                    'Backup dari <strong>' + escapeHtml(exportedAt) + '</strong>.<br>' +
                    'Berisi <strong>' + countMatkul + '</strong> mata kuliah dan <strong>' + countTugas + '</strong> tugas.' +
                '</p>' +
                '<div style="margin-top:16px;padding:14px;background:var(--surface);border-radius:var(--r-md);font-size:14px;color:var(--ink-muted);line-height:1.6">' +
                    '<strong style="color:var(--ink)">Ganti</strong> = hapus semua data lama, ganti dengan backup.<br>' +
                    '<strong style="color:var(--ink)">Gabung</strong> = pertahankan data lama, tambahkan dari backup.' +
                '</div>' +
                '<div class="modal-actions" style="margin-top:16px">' +
                    '<button class="btn btn-ghost" data-mode="cancel">Batal</button>' +
                    '<button class="btn btn-secondary" data-mode="merge">Gabung</button>' +
                    '<button class="btn btn-primary" data-mode="replace">Ganti</button>' +
                '</div>' +
            '</div>';
        document.body.appendChild(overlay);
        document.body.classList.add("modal-open");

        function cleanup() {
            overlay.remove();
            document.body.classList.remove("modal-open");
        }
        overlay.querySelectorAll("[data-mode]").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var mode = btn.getAttribute("data-mode");
                cleanup();
                resolve(mode === "cancel" ? null : mode);
            });
        });
        overlay.querySelector(".btn-close").addEventListener("click", function () {
            cleanup(); resolve(null);
        });
    });
}

console.log("[Deadline] backup.js loaded");
