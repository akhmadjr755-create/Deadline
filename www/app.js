var AppState = { currentPage: "tugas", booted: false };

document.addEventListener("DOMContentLoaded", async function () {
    try { await initDB(); } catch (e) { return; }
    try { initNotifikasi(); } catch (e) {}

    setupModals();
    setupNavigation();
    setupTugasHeaderSync();

    try { await initTugas(); } catch(e) { console.error("initTugas err", e); }
    try { await initMatkul(); } catch(e) { console.error("initMatkul err", e); }
    try { await initPengaturan(); } catch(e) { console.error("initPengaturan err", e); }
    try { initBackup(); } catch(e) { console.error("initBackup err", e); }

    await navigateTo("tugas");
    AppState.booted = true;
});

function setupNavigation() {
    document.querySelectorAll(".nav-pill[data-page]").forEach(el => el.addEventListener("click", () => navigateTo(el.getAttribute("data-page"))));
    document.querySelectorAll(".bn-item[data-page]").forEach(el => el.addEventListener("click", () => navigateTo(el.getAttribute("data-page"))));
}

async function navigateTo(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    var target = document.getElementById("page-" + page);
    if (!target) return;
    target.classList.add("active");

    document.querySelectorAll(".nav-pill[data-page]").forEach(el => el.classList.toggle("active", el.getAttribute("data-page") === page));
    document.querySelectorAll(".bn-item[data-page]").forEach(el => el.classList.toggle("active", el.getAttribute("data-page") === page));

    AppState.currentPage = page;

    try {
        if (page === "tugas") {
            if (typeof loadAndRenderTugas === "function") await loadAndRenderTugas();
            updateTugasHeader();
        } else if (page === "matkul") {
            if (typeof loadAndRenderMatkul === "function") await loadAndRenderMatkul();
        } else if (page === "pengaturan") {
            if (typeof initPengaturan === "function") await initPengaturan();
        }
    } catch (e) {}
    window.scrollTo({ top: 0, behavior: "smooth" });
}

function openModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.hidden = false;
    void m.offsetWidth; 
    m.classList.add("show");
    document.body.classList.add("modal-open");
}

function closeModal(id) {
    var m = document.getElementById(id);
    if (!m) return;
    m.classList.remove("show");
    setTimeout(function () {
        m.hidden = true;
        if (!document.querySelector(".modal-overlay.show")) document.body.classList.remove("modal-open");
    }, 300); 
}

function setupModals() {
    document.querySelectorAll("[data-close]").forEach(btn => btn.addEventListener("click", () => closeModal(btn.getAttribute("data-close"))));
    document.querySelectorAll(".modal-overlay").forEach(overlay => overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay.id); }));
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay:not([hidden])").forEach(m => closeModal(m.id)); });
}

window.openModal = openModal;
window.closeModal = closeModal;
window.navigateTo = navigateTo;

function setupTugasHeaderSync() {
    var filterRow = document.getElementById("filter-row");
    if (filterRow) filterRow.addEventListener("click", (e) => { if (e.target.classList.contains("filter-chip")) setTimeout(updateTugasHeader, 30); });
    var taskList = document.getElementById("task-list");
    if (taskList && typeof MutationObserver !== "undefined") new MutationObserver(() => updateTugasHeader()).observe(taskList, { childList: true });
    updateTugasHeader();
}

function updateTugasHeader() {
    var titleEl = document.getElementById("tugas-title");
    var subEl = document.getElementById("tugas-sub");
    if (!titleEl || !subEl) return;
    var activeChip = document.querySelector("#filter-row .filter-chip.active");
    var filter = activeChip ? activeChip.getAttribute("data-filter") : "semua";
    var titles = { semua: "Semua Tugas", hari: "Hari Ini", minggu: "Minggu Ini", terlambat: "Terlambat", selesai: "Selesai" };
    titleEl.textContent = titles[filter] || "Tugas";
    var count = document.querySelectorAll("#task-list .task-card").length;
    subEl.textContent = count === 0 ? "Tidak ada tugas" : count + " tugas";
}

window.DeadlineDebug = {
    resetAll: async function () {
        if (!await konfirmasi("Hapus SEMUA data?", "Reset Total")) return;
        await importAllData({ version: 2, data: { matkul: [], tugas: [], pengaturan: { default_reminders: [] } } }, "replace");
        setTimeout(() => location.reload(), 800);
    }
};
