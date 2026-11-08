// ==========================================
// app.js — Boot, Navigation, Modal Manager
// ==========================================

var AppState = {
    currentPage: "tugas",
    booted: false
};

// ==========================================
// BOOT SEQUENCE
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
    console.log("[Deadline] Boot starting...");

    // 1. Database
    try {
        await initDB();
    } catch (e) {
        console.error("[Deadline] DB init failed:", e);
        showToast("Gagal inisialisasi database.", "error");
        return;
    }

    // 2. Notifikasi (non-blocking — jangan tunggu permission prompt)
    try {
        initNotifikasi();
    } catch (e) {
        console.warn("[Deadline] Notif init failed (non-fatal):", e);
    }

    // 3. Wire modals & navigation (early, biar tombol responsif)
    setupModals();
    setupNavigation();
    setupTugasHeaderSync();

    // 4. Render awal
    try {
        await initTugas();
        await initMatkul();
        await initPengaturan();
        initBackup();
    } catch (e) {
        console.error("[Deadline] Render awal gagal:", e);
        showToast("Sebagian data gagal dimuat. Cek console.", "error");
    }

    // 5. Buka halaman default
    await navigateTo("tugas");

    AppState.booted = true;
    console.log("[Deadline] Boot complete. Ready.");
});

// ==========================================
// NAVIGATION
// ==========================================
function setupNavigation() {
    // Nav desktop (pill)
    document.querySelectorAll(".nav-pill[data-page]").forEach(function (el) {
        el.addEventListener("click", function () {
            navigateTo(el.getAttribute("data-page"));
        });
    });

    // Bottom nav (mobile)
    document.querySelectorAll(".bn-item[data-page]").forEach(function (el) {
        el.addEventListener("click", function () {
            navigateTo(el.getAttribute("data-page"));
        });
    });
}

async function navigateTo(page) {
    // Hide all pages
    document.querySelectorAll(".page").forEach(function (p) {
        p.classList.remove("active");
    });
    var target = document.getElementById("page-" + page);
    if (!target) {
        console.warn("[Deadline] Page not found:", page);
        return;
    }
    target.classList.add("active");

    // Sync active states di kedua nav
    document.querySelectorAll(".nav-pill[data-page]").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-page") === page);
    });
    document.querySelectorAll(".bn-item[data-page]").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-page") === page);
    });

    AppState.currentPage = page;

    // Refresh data sesuai halaman (data bisa berubah antar page)
    try {
        if (page === "tugas") {
            if (typeof loadAndRenderTugas === "function") await loadAndRenderTugas();
            updateTugasHeader();
        } else if (page === "matkul") {
            if (typeof loadAndRenderMatkul === "function") await loadAndRenderMatkul();
        } else if (page === "pengaturan") {
            if (typeof loadPengaturan === "function") await loadPengaturan();
            if (typeof updateStorageInfo === "function") updateStorageInfo();
        }
    } catch (e) {
        console.warn("[Deadline] Page refresh error:", e);
    }

    // Scroll ke atas
    window.scrollTo({ top: 0, behavior: "smooth" });
}

// ==========================================
// MODAL MANAGER
// ==========================================
function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    void m.offsetWidth; // trigger reflow
    m.classList.add("show");
    document.body.classList.add("modal-open");
}

function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("show");
    setTimeout(function () {
        m.hidden = true;
        var masihTerbuka = document.querySelector(".modal-overlay.show");
        if (!masihTerbuka) document.body.classList.remove("modal-open");
    }, 300); // Samain sama durasi animasi CSS (0.3s)
}

function setupModals() {
    // Tombol close dengan data-close="<modal-id>"
    document.querySelectorAll("[data-close]").forEach(function (btn) {
        btn.addEventListener("click", function () {
            closeModal(btn.getAttribute("data-close"));
        });
    });

    // Klik overlay (di luar modal) → tutup
    document.querySelectorAll(".modal-overlay").forEach(function (overlay) {
        overlay.addEventListener("click", function (e) {
            if (e.target === overlay) closeModal(overlay.id);
        });
    });

    // Escape key
    document.addEventListener("keydown", function (e) {
        if (e.key !== "Escape") return;
        // Tutup modal terbuka
        document.querySelectorAll(".modal-overlay:not([hidden])").forEach(function (m) {
            closeModal(m.id);
        });
        // Tutup popup menu tugas kalau ada
        if (typeof closeTaskMenu === "function") closeTaskMenu();
    });
}

// Expose ke window supaya bisa dipanggil dari file lain (tugas.js, matkul.js, dll)
window.openModal = openModal;
window.closeModal = closeModal;
window.navigateTo = navigateTo;

// ==========================================
// TUGAS HEADER SYNC
// ==========================================
// Update judul & subjudul page tugas sesuai filter aktif
function setupTugasHeaderSync() {
    var filterRow = document.getElementById("filter-row");
    if (filterRow) {
        filterRow.addEventListener("click", function (e) {
            if (e.target.classList && e.target.classList.contains("filter-chip")) {
                // Delay kecil agar class "active" sudah ter-update oleh tugas.js
                setTimeout(updateTugasHeader, 30);
            }
        });
    }

    var taskList = document.getElementById("task-list");
    if (taskList && typeof MutationObserver !== "undefined") {
        new MutationObserver(function () {
            updateTugasHeader();
        }).observe(taskList, { childList: true });
    }

    updateTugasHeader();
}

function updateTugasHeader() {
    var titleEl = document.getElementById("tugas-title");
    var subEl = document.getElementById("tugas-sub");
    if (!titleEl || !subEl) return;

    var activeChip = document.querySelector("#filter-row .filter-chip.active");
    var filter = activeChip ? activeChip.getAttribute("data-filter") : "semua";

    var titles = {
        semua: "Semua Tugas",
        hari: "Hari Ini",
        minggu: "Minggu Ini",
        terlambat: "Terlambat",
        selesai: "Selesai"
    };
    titleEl.textContent = titles[filter] || "Tugas";

    var count = document.querySelectorAll("#task-list .task-card").length;
    subEl.textContent = count === 0 ? "Tidak ada tugas" : count + " tugas";
}

// ==========================================
// DEBUG HELPERS (opsional, untuk console)
// ==========================================
window.DeadlineDebug = {
    state: function () {
        return {
            AppState: AppState,
            TugasState: (typeof TugasState !== "undefined") ? TugasState : null,
            MatkulState: (typeof MatkulState !== "undefined") ? MatkulState : null,
            PengaturanState: (typeof PengaturanState !== "undefined") ? PengaturanState : null,
            NotifState: (typeof NotifState !== "undefined") ? NotifState : null
        };
    },
    dump: async function () {
        return await exportAllData();
    },
    resetAll: async function () {
        if (!await konfirmasi("Hapus SEMUA data Deadline? (matkul, tugas, pengaturan)", "Reset Total")) return;
        await importAllData({
            version: 1, exported_at: getNowISO(), app: "Deadline",
            data: { matkul: [], tugas: [], pengaturan: { default_reminders: [{ satuan: "hari", nilai: 1 }, { satuan: "jam", nilai: 2 }] } }
        }, "replace");
        showToast("Semua data direset.", "success");
        setTimeout(function () { location.reload(); }, 800);
    }
};

console.log("[Deadline] app.js loaded");
