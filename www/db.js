// ==========================================
// db.js — Deadline: Storage Layer
// ==========================================
// Dual-backend:
//   - Capacitor (APK):  @capacitor/preferences via window.Capacitor.Plugins.Preferences
//   - Browser (dev):    localStorage
// Semua data disimpan sebagai JSON string per key.
// Key namespace: "deadline:v1:<name>"
// ==========================================

const DB_PREFIX = "deadline:v1:";
const KEY_MATKUL = DB_PREFIX + "matkul";
const KEY_TUGAS = DB_PREFIX + "tugas";
const KEY_PENGATURAN = DB_PREFIX + "pengaturan";

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
        async get(key) {
            const res = await Prefs.get({ key });
            return res && res.value !== undefined ? res.value : null;
        },
        async set(key, value) {
            await Prefs.set({ key, value });
        },
        async remove(key) {
            await Prefs.remove({ key });
        }
    };
}

function _localStorageBackend() {
    return {
        name: "localStorage",
        async get(key) {
            try { return localStorage.getItem(key); } catch (e) { return null; }
        },
        async set(key, value) {
            try { localStorage.setItem(key, value); } catch (e) {
                console.error("[Deadline] localStorage set failed:", e);
                throw e;
            }
        },
        async remove(key) {
            try { localStorage.removeItem(key); } catch (e) {}
        }
    };
}

// ==========================================
// LOW-LEVEL GET/SET (JSON)
// ==========================================
async function _getJSON(key, fallback) {
    var raw = await _backend.get(key);
    if (!raw) return fallback;
    try {
        return JSON.parse(raw);
    } catch (e) {
        console.warn("[Deadline] Corrupt JSON di", key, "→ pakai fallback");
        return fallback;
    }
}

async function _setJSON(key, obj) {
    await _backend.set(key, JSON.stringify(obj));
}

// ==========================================
// INIT
// ==========================================
async function initDB() {
    _backend = _detectBackend();
    // Seed pengaturan default kalau belum ada
    var pengaturan = await getPengaturan();
    if (!pengaturan) {
        await savePengaturan({
            default_reminders: [
                { satuan: "hari", nilai: 1 },
                { satuan: "jam", nilai: 2 }
            ]
        });
        console.log("[Deadline] Pengaturan default di-seed (1 hari, 2 jam sebelum deadline).");
    }
}

// ==========================================
// MATA KULIAH
// ==========================================
async function getMatkul() {
    return (await _getJSON(KEY_MATKUL, [])) || [];
}

async function saveMatkul(matkul) {
    var all = await getMatkul();
    var idx = all.findIndex(function (m) { return m.id === matkul.id; });
    if (idx >= 0) all[idx] = matkul;
    else all.push(matkul);
    await _setJSON(KEY_MATKUL, all);
}

async function deleteMatkul(id) {
    var all = await getMatkul();
    // Cek: apakah masih ada tugas yang mereferensi matkul ini?
    var tugasAll = await getTugas();
    var used = tugasAll.some(function (t) { return t.mata_kuliah_id === id; });
    if (used) {
        throw new Error("Mata kuliah ini masih punya tugas. Hapus atau pindahkan tugas dulu.");
    }
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
async function getTugas() {
    return (await _getJSON(KEY_TUGAS, [])) || [];
}

async function saveTugas(tugas) {
    var all = await getTugas();
    var idx = all.findIndex(function (t) { return t.id === tugas.id; });
    if (idx >= 0) all[idx] = tugas;
    else all.push(tugas);
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
async function getPengaturan() {
    return await _getJSON(KEY_PENGATURAN, null);
}

async function savePengaturan(obj) {
    await _setJSON(KEY_PENGATURAN, obj);
}

// ==========================================
// BACKUP / RESTORE (dipakai backup.js)
// ==========================================
async function exportAllData() {
    return {
        version: 1,
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
    // mode: "replace" (default) atau "merge"
    mode = mode || "replace";
    if (!payload || !payload.data) throw new Error("Format backup tidak valid.");
    var d = payload.data;

    if (mode === "replace") {
        await _setJSON(KEY_MATKUL, Array.isArray(d.matkul) ? d.matkul : []);
        await _setJSON(KEY_TUGAS, Array.isArray(d.tugas) ? d.tugas : []);
        if (d.pengaturan) await _setJSON(KEY_PENGATURAN, d.pengaturan);
    } else {
        // merge: gabung berdasarkan id, data baru menang
        var curMatkul = await getMatkul();
        var curTugas = await getTugas();
        var mapMatkul = {};
        curMatkul.forEach(function (m) { mapMatkul[m.id] = m; });
        (d.matkul || []).forEach(function (m) { mapMatkul[m.id] = m; });
        var mergedMatkul = Object.keys(mapMatkul).map(function (k) { return mapMatkul[k]; });

        var mapTugas = {};
        curTugas.forEach(function (t) { mapTugas[t.id] = t; });
        (d.tugas || []).forEach(function (t) { mapTugas[t.id] = t; });
        var mergedTugas = Object.keys(mapTugas).map(function (k) { return mapTugas[k]; });

        await _setJSON(KEY_MATKUL, mergedMatkul);
        await _setJSON(KEY_TUGAS, mergedTugas);
        if (d.pengaturan) await _setJSON(KEY_PENGATURAN, d.pengaturan);
    }
}

console.log("[Deadline] db.js loaded");
