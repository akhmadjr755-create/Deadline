// ==========================================
// db.js — Deadline: Storage Layer (v2)
// ==========================================
// Dual-backend:
//   - Capacitor (APK):  @capacitor/preferences
//   - Browser (dev):    localStorage
// ==========================================

const DB_PREFIX = "deadline:v2:"; // Naik ke v2
const KEY_MATKUL = DB_PREFIX + "matkul";
const KEY_TUGAS = DB_PREFIX + "tugas";
const KEY_PENGATURAN = DB_PREFIX + "pengaturan";

// Key Lama untuk migrasi (v1)
const KEY_MATKUL_V1 = "deadline:v1:matkul";
const KEY_TUGAS_V1 = "deadline:v1:tugas";
const KEY_PENGATURAN_V1 = "deadline:v1:pengaturan";

var _backend = null;

// ==========================================
// BACKEND DETECTION
// ==========================================
function _detectBackend() {
    if (typeof window !== "undefined" &&
        window.Capacitor &&
        window.Capacitor.isNativePlatform &&
        window.Capacitor.isNativePlatform() &&
        window.Capacitor.Plugins &&
        window.Capacitor.Plugins.Preferences) {
        console.log("[Deadline] DB backend: Capacitor Preferences");
        return _capacitorBackend(window.Capacitor.Plugins.Preferences);
    }
    console.log("[Deadline] DB backend: localStorage (browser)");
    return _localStorageBackend();
}

function _capacitorBackend(Prefs) {
    return {
        name: "capacitor",
        async get(key) { const res = await Prefs.get({ key }); return res && res.value !== undefined ? res.value : null; },
        async set(key, value) { await Prefs.set({ key, value }); },
        async remove(key) { await Prefs.remove({ key }); }
    };
}

function _localStorageBackend() {
    return {
        name: "localStorage",
        async get(key) { try { return localStorage.getItem(key); } catch (e) { return null; } },
        async set(key, value) { try { localStorage.setItem(key, value); } catch (e) { console.error(e); throw e; } },
        async remove(key) { try { localStorage.removeItem(key); } catch (e) {} }
    };
}

// ==========================================
// LOW-LEVEL GET/SET (JSON)
// ==========================================
async function _getJSON(key, fallback) {
    var raw = await _backend.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
}

async function _setJSON(key, obj) {
    await _backend.set(key, JSON.stringify(obj));
}

// ==========================================
// INIT & MIGRASI
// ==========================================
async function initDB() {
    _backend = _detectBackend();
    
    // 1. Jalankan migrasi v1 -> v2
    await migrateToV2();

    // 2. Seed pengaturan default kalau belum ada
    var pengaturan = await getPengaturan();
    if (!pengaturan) {
        await savePengaturan({
            default_reminders: [
                { satuan: "hari", nilai: 1 },
                { satuan: "jam", nilai: 2 }
            ]
        });
        console.log("[Deadline] Pengaturan default di-seed.");
    }
}

async function migrateToV2() {
    try {
        // Cek apakah data v1 ada di backend
        var oldMatkul = await _getJSON(KEY_MATKUL_V1, null);
        var oldTugas = await _getJSON(KEY_TUGAS_V1, null);
        var oldPengaturan = await _getJSON(KEY_PENGATURAN_V1, null);

        // Cek apakah v2 udah ada isinya
        var newMatkul = await _getJSON(KEY_MATKUL, null);

        if (newMatkul === null && (oldMatkul !== null || oldTugas !== null)) {
            console.log("[Deadline] Melakukan migrasi dari v1 ke v2...");
            
            // Pindahkan Matkul
            if (oldMatkul) await _setJSON(KEY_MATKUL, oldMatkul);
            
            // Pindahkan Tugas & tambahkan field default v2
            if (oldTugas) {
                oldTugas.forEach(t => {
                    if (!t.category) t.category = 'TUGAS';
                    if (!t.priority) t.priority = 'SEDANG';
                    if (!t.reminder_mode) t.reminder_mode = 'DEFAULT';
                });
                await _setJSON(KEY_TUGAS, oldTugas);
            }

            // Pindahkan Pengaturan
            if (oldPengaturan) await _setJSON(KEY_PENGATURAN, oldPengaturan);
            
            console.log("[Deadline] Migrasi DB v2 berhasil. Data lama tetap aman.");
        } else {
            // Kalau gak ada data v1, pastikan key v2 diinisialisasi array kosong
            if (!newMatkul) await _setJSON(KEY_MATKUL, []);
            var currentTugas = await _getJSON(KEY_TUGAS, null);
            if (!currentTugas) await _setJSON(KEY_TUGAS, []);
        }
    } catch (e) {
        console.error("[Deadline] Gagal migrasi DB:", e);
    }
}

// ==========================================
// MATA KULIAH
// ==========================================
async function getMatkul() { return (await _getJSON(KEY_MATKUL, [])) || []; }

async function saveMatkul(matkul) {
    var all = await getMatkul();
    var idx = all.findIndex(function (m) { return m.id === matkul.id; });
    if (idx >= 0) all[idx] = matkul; else all.push(matkul);
    await _setJSON(KEY_MATKUL, all);
}

async function deleteMatkul(id) {
    var all = await getMatkul();
    var tugasAll = await getTugas();
    var used = tugasAll.some(function (t) { return t.mata_kuliah_id === id; });
    if (used) throw new Error("Mata kuliah ini masih punya tugas. Hapus atau pindahkan tugas dulu.");
    all = all.filter(function (m) { return m.id !== id; });
    await _setJSON(KEY_MATKUL, all);
}

async function getMatkulById(id) {
    var all = await getMatkul();
    return all.find(function (m) { return m.id === id; }) || null;
}

// ==========================================
// TUGAS
// ==========================================
async function getTugas() { return (await _getJSON(KEY_TUGAS, [])) || []; }

async function saveTugas(tugas) {
    var all = await getTugas();
    var idx = all.findIndex(function (t) { return t.id === tugas.id; });
    if (idx >= 0) all[idx] = tugas; else all.push(tugas);
    await _setJSON(KEY_TUGAS, all);
}

async function deleteTugas(id) {
    var all = await getTugas();
    all = all.filter(function (t) { return t.id !== id; });
    await _setJSON(KEY_TUGAS, all);
}

async function getTugasById(id) {
    var all = await getTugas();
    return all.find(function (t) { return t.id === id; }) || null;
}

// ==========================================
// PENGATURAN
// ==========================================
async function getPengaturan() { return await _getJSON(KEY_PENGATURAN, null); }
async function savePengaturan(obj) { await _setJSON(KEY_PENGATURAN, obj); }

// ==========================================
// BACKUP / RESTORE
// ==========================================
async function exportAllData() {
    return {
        version: 2,
        exported_at: getNowISO(),
        app: "Deadline",
        data: {
            matkul: await getMatkul(),
            tugas: await getTugas(),
            pengaturan: await getPengaturan()
        }
    };
}

async function importAllData(payload, mode) {
    mode = mode || "replace";
    if (!payload || !payload.data) throw new Error("Format backup tidak valid.");
    var d = payload.data;

    // Pastikan ada default v2 jika file lama (v1)
    if (d.tugas) {
        d.tugas.forEach(t => {
            if (!t.category) t.category = 'TUGAS';
            if (!t.priority) t.priority = 'SEDANG';
            if (!t.reminder_mode) t.reminder_mode = 'DEFAULT';
        });
    }

    if (mode === "replace") {
        await _setJSON(KEY_MATKUL, Array.isArray(d.matkul) ? d.matkul : []);
        await _setJSON(KEY_TUGAS, Array.isArray(d.tugas) ? d.tugas : []);
        if (d.pengaturan) await _setJSON(KEY_PENGATURAN, d.pengaturan);
    } else {
        var curMatkul = await getMatkul();
        var curTugas = await getTugas();
        var mapMatkul = {}; curMatkul.forEach(m => mapMatkul[m.id] = m);
        (d.matkul || []).forEach(m => mapMatkul[m.id] = m);
        var mergedMatkul = Object.keys(mapMatkul).map(k => mapMatkul[k]);
        var mapTugas = {}; curTugas.forEach(t => mapTugas[t.id] = t);
        (d.tugas || []).forEach(t => mapTugas[t.id] = t);
        var mergedTugas = Object.keys(mapTugas).map(k => mapTugas[k]);
        await _setJSON(KEY_MATKUL, mergedMatkul);
        await _setJSON(KEY_TUGAS, mergedTugas);
        if (d.pengaturan) await _setJSON(KEY_PENGATURAN, d.pengaturan);
    }
}

console.log("[Deadline] db.js loaded (v2)");
