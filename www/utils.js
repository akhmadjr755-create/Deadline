// ==========================================
// utils.js — Deadline: Fungsi Bantuan
// ==========================================

// --- ID & Timestamp ---
function generateId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

function getNowISO() {
    return new Date().toISOString();
}

function getTodayISO() {
    const d = new Date();
    return toISODate(d);
}

function toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

// --- Format Tanggal & Waktu ---
var HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
var BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function formatTanggal(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

function formatWaktu(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
}

function formatTanggalWaktu(iso) {
    if (!iso) return "-";
    return formatTanggal(iso) + " · " + formatWaktu(iso);
}

/**
 * Format relatif terhadap sekarang. Contoh:
 *   "2 hari lagi", "3 jam lagi", "Besok 14:30", "2 hari lalu", "Lewat 1 jam"
 */
function formatRelatif(iso) {
    if (!iso) return "-";
    const target = new Date(iso).getTime();
    if (isNaN(target)) return "-";
    const now = Date.now();
    const diffMs = target - now;
    const abs = Math.abs(diffMs);
    const menit = Math.floor(abs / 60000);
    const jam = Math.floor(abs / 3600000);
    const hari = Math.floor(abs / 86400000);

    let text;
    if (menit < 1) text = "sebentar lagi";
    else if (menit < 60) text = menit + " menit";
    else if (jam < 24) text = jam + " jam";
    else if (hari < 30) text = hari + " hari";
    else text = Math.floor(hari / 30) + " bulan";

    if (diffMs >= 0) return text + " lagi";
    return "Lewat " + text;
}

/**
 * Cek apakah deadline lewat DAN belum selesai → status "terlambat".
 */
function isTerlambat(tugas) {
    if (!tugas || tugas.status_selesai) return false;
    if (!tugas.deadline) return false;
    return new Date(tugas.deadline).getTime() < Date.now();
}

/**
 * Cek deadline dalam N hari ke depan (default 7). Termasuk yang sudah lewat? Tidak.
 */
function isDalamRentangHari(tugas, nHari) {
    if (!tugas || !tugas.deadline) return false;
    const target = new Date(tugas.deadline).getTime();
    const now = Date.now();
    const batas = now + nHari * 86400000;
    return target >= now && target <= batas;
}

function isHariIni(iso) {
    if (!iso) return false;
    const d = new Date(iso);
    const now = new Date();
    return d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate();
}

/**
 * Parse <input type="datetime-local"> value (YYYY-MM-DDTHH:mm) ke ISO string.
 */
function parseDateTimeLocal(val) {
    if (!val) return null;
    const d = new Date(val);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
}

/**
 * Format ISO ke value <input type="datetime-local"> (YYYY-MM-DDTHH:mm).
 */
function toDateTimeLocalValue(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
}

// --- Escape HTML ---
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    const div = document.createElement("div");
    div.textContent = String(str);
    return div.innerHTML;
}

// --- Toast ---
function showToast(message, type) {
    type = type || "info";
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        document.body.appendChild(toast);
    }
    toast.className = "toast toast-" + type;
    toast.textContent = message;
    toast.classList.add("show");
    if (window._toastTimer) clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(function () {
        toast.classList.remove("show");
    }, 2800);
}

// --- Debounce ---
function debounce(fn, wait) {
    wait = wait || 300;
    let t;
    return function () {
        const args = arguments, ctx = this;
        clearTimeout(t);
        t = setTimeout(function () { fn.apply(ctx, args); }, wait);
    };
}

// --- Konfirmasi (pakai native confirm untuk MVP) ---
function konfirmasi(msg, title = "Konfirmasi") {
    return new Promise((resolve) => {
        const existing = document.getElementById('custom-confirm');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'custom-confirm';
        overlay.className = 'modal-overlay custom-confirm-overlay';
        
        overlay.innerHTML = `
            <div class="modal confirm-dialog">
                <h3 class="modal-title" style="margin-bottom:8px; font-size:18px;">${escapeHtml(title)}</h3>
                <p style="color:var(--text-muted); font-size:15px; line-height:1.5; margin-bottom:24px;">${escapeHtml(msg).replace(/\n/g, '<br>')}</p>
                <div class="modal-actions">
                    <button class="btn btn-ghost" id="btn-cancel-confirm">Batal</button>
                    <button class="btn btn-primary" id="btn-ok-confirm" style="background:var(--error); color:white; border-color:var(--error)">Ya, Lanjutkan</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        document.body.classList.add('modal-open');

        requestAnimationFrame(() => { overlay.classList.add('show'); });

        const close = (result) => {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.remove();
                const otherModals = document.querySelectorAll('.modal-overlay.show');
                if (otherModals.length === 0) document.body.classList.remove('modal-open');
                resolve(result);
            }, 300);
        };

        overlay.querySelector('#btn-cancel-confirm').addEventListener('click', () => close(false));
        overlay.querySelector('#btn-ok-confirm').addEventListener('click', () => close(true));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    });
}
/**
 * Hash string ke 32-bit integer positif. Untuk Capacitor LocalNotifications
 * yang butuh numeric ID. Deterministik: string sama → ID sama.
 */
function hashStringToInt(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = ((h << 5) + h) + str.charCodeAt(i);
        h = h & h; // force 32-bit
    }
    return Math.abs(h) % 2147483647;
}

/**
 * ID notifikasi deterministik sesuai PRD §9: {tugas_id}_{index}
 * Lalu di-hash untuk dapat numeric ID Capacitor.
 */
function notifIdFor(tugasId, index) {
    return hashStringToInt(tugasId + "_" + index);
}

// --- Konversi offset reminder ke milidetik ---
function offsetToMs(satuan, nilai) {
    const n = Number(nilai) || 0;
    if (satuan === "menit") return n * 60 * 1000;
    if (satuan === "jam") return n * 60 * 60 * 1000;
    if (satuan === "hari") return n * 24 * 60 * 60 * 1000;
    return 0;
}

console.log("[Deadline] utils.js loaded");
