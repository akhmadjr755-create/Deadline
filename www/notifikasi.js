// ==========================================
// notifikasi.js — Scheduler (Capacitor + Web fallback)
// ==========================================
// PRD §5.3 & §9:
//   - Notifikasi dijadwalkan lewat OS (Capacitor Local Notifications)
//   - ID deterministik: {tugas_id}_{index} di-hash ke numeric
//   - Saat selesai → cancel semua notifikasi tugas itu
//   - Saat undo → hanya schedule ulang yang masih future
// ==========================================
// Catatan implementasi:
//   - Stateless: tidak persist tabel notifikasi_terjadwal.
//     Cancel = coba cancel ID 0..MAX_REMINDER_INDEX.
//     Schedule = hitung ulang dari tugas + reminder.
//   - Browser fallback pakai Web Notification + setTimeout
//     (tab harus terbuka saat trigger, untuk dev).
// ==========================================

var NotifState = {
    permission: "unknown", // "granted" | "denied" | "unknown" | "default"
    webTimeouts: {}, // notifId -> timerId (browser)
    inited: false
};

var MAX_REMINDER_INDEX = 20; // batas atas index reminder (untuk cancel)

// ==========================================
// PLATFORM HELPERS
// ==========================================
function _isCapacitorNative() {
    return typeof window !== "undefined" &&
        window.Capacitor &&
        typeof window.Capacitor.isNativePlatform === "function" &&
        window.Capacitor.isNativePlatform();
}

function _getLocalNotifications() {
    if (!_isCapacitorNative()) return null;
    if (!window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins.LocalNotifications || null;
}

// ==========================================
// INIT (dipanggil dari app.js saat boot)
// ==========================================
async function initNotifikasi() {
    if (NotifState.inited) return;
    NotifState.inited = true;

    if (_isCapacitorNative()) {
        try {
            var LN = _getLocalNotifications();
            if (LN) {
                var perm = await LN.checkPermissions();
                NotifState.permission = (perm.display === "granted") ? "granted" : "unknown";
            }
        } catch (e) {
            console.warn("[Deadline] LocalNotif.checkPermissions gagal:", e);
        }
    } else if (typeof Notification !== "undefined") {
        NotifState.permission = Notification.permission; // "default" | "granted" | "denied"
    } else {
        NotifState.permission = "denied";
    }
    console.log("[Deadline] Notifikasi init. Permission:", NotifState.permission);
}

async function ensureNotifPermission() {
    if (NotifState.permission === "granted") return true;

    if (_isCapacitorNative()) {
        try {
            var LN = _getLocalNotifications();
            if (!LN) return false;
            var res = await LN.requestPermissions();
            if (res.display === "granted") {
                NotifState.permission = "granted";
                return true;
            }
            NotifState.permission = "denied";
            return false;
        } catch (e) {
            console.warn("[Deadline] requestPermissions gagal:", e);
            return false;
        }
    } else if (typeof Notification !== "undefined") {
        try {
            var p = await Notification.requestPermission();
            NotifState.permission = p;
            return p === "granted";
        } catch (e) {
            return false;
        }
    }
    return false;
}

// ==========================================
// REMINDER LOOKUP
// ==========================================
async function getRemindersForTugas(tugas) {
    // Override ada dan valid → pakai itu
    if (Array.isArray(tugas.reminder_override)) {
        return tugas.reminder_override
            .filter(function (r) { return r && r.satuan && Number(r.nilai) > 0; })
            .map(function (r) { return { satuan: r.satuan, nilai: Number(r.nilai) }; });
    }
    // Fallback ke default
    var pengaturan = await getPengaturan();
    if (pengaturan && Array.isArray(pengaturan.default_reminders)) {
        return pengaturan.default_reminders
            .filter(function (r) { return r && r.satuan && Number(r.nilai) > 0; });
    }
    return [];
}

// ==========================================
// CANCEL — batalkan semua notifikasi untuk tugas
// ==========================================
async function batalkanNotifikasiTugas(tugasId) {
    var ids = [];
    for (var i = 0; i < MAX_REMINDER_INDEX; i++) {
        ids.push(notifIdFor(tugasId, i));
    }

    // Browser: clear semua setTimeout
    if (!_isCapacitorNative()) {
        ids.forEach(function (id) {
            if (NotifState.webTimeouts[id]) {
                clearTimeout(NotifState.webTimeouts[id]);
                delete NotifState.webTimeouts[id];
            }
        });
        return;
    }

    // Capacitor: minta OS cancel
    var LN = _getLocalNotifications();
    if (!LN) return;
    try {
        await LN.cancel({
            notifications: ids.map(function (id) { return { id: id }; })
        });
    } catch (e) {
        // Beberapa versi plugin lempar error kalau ID tidak ditemukan — abaikan
        console.warn("[Deadline] cancel notif (mungkin kosong):", e && e.message);
    }
}

// ==========================================
// SYNC — jadwalkan ulang notifikasi untuk satu tugas
// ==========================================
/**
 * Dipanggil pada: create tugas, edit tugas, toggle status_selesai.
 * Urutan:
 *   1. Cancel semua notifikasi lama untuk tugas ini
 *   2. Kalau sudah selesai → stop
 *   3. Hitung reminder (override atau default)
 *   4. Schedule yang waktu_trigger-nya masih future
 */
async function syncNotifikasiTugas(tugas) {
    // 1. Cancel dulu (idempotent)
    await batalkanNotifikasiTugas(tugas.id);

    // 2. Sudah selesai → jangan schedule
    if (tugas.status_selesai) return;

    // 3. Deadline harus valid
    if (!tugas.deadline) return;
    var deadlineMs = new Date(tugas.deadline).getTime();
    if (isNaN(deadlineMs)) return;

    // 4. Reminder list
    var reminders = await getRemindersForTugas(tugas);
    if (reminders.length === 0) return;

    // 5. Matkul (untuk body)
    var matkul = await getMatkulById(tugas.mata_kuliah_id);
    var matkulName = matkul && matkul.nama ? matkul.nama : "Tanpa Mata Kuliah";

    // 6. Permission? (lazy — hanya minta kalau benar-benar mau schedule)
    var ok = await ensureNotifPermission();
    if (!ok) {
        console.warn("[Deadline] Izin notifikasi belum diberikan — reminder tidak dijadwalkan.");
        return;
    }

    // 7. Build payload
    var now = Date.now();
    var toSchedule = [];
    reminders.forEach(function (r, index) {
        var triggerMs = deadlineMs - offsetToMs(r.satuan, r.nilai);
        if (triggerMs <= now) return; // skip yang sudah lewat
        toSchedule.push({
            id: notifIdFor(tugas.id, index),
            title: "Pengingat: " + tugas.nama,
            body: matkulName + " · Deadline " + formatTanggalWaktu(tugas.deadline),
            triggerMs: triggerMs
        });
    });

    if (toSchedule.length === 0) return;

    // 8. Dispatch ke platform
    if (_isCapacitorNative()) {
        await _scheduleNative(toSchedule);
    } else {
        _scheduleWeb(toSchedule);
    }
}

// ==========================================
// SCHEDULE — NATIVE (Capacitor)
// ==========================================
async function _scheduleNative(items) {
    var LN = _getLocalNotifications();
    if (!LN) return;
    var payload = items.map(function (n) {
        return {
            id: n.id,
            title: n.title,
            body: n.body,
            schedule: { 
                at: new Date(n.triggerMs),
                allowWhileIdle: true // Wajib: biar notif nembus mode hemat daya
            },
            iconColor: "#3B82F6"
            // gua hapus smallIcon karena bikin crash di Android
        };
    });
    try {
        await LN.schedule({ notifications: payload });
        console.log("[Deadline] Native notif terjadwal:", payload.length);
    } catch (e) {
        console.error("[Deadline] schedule native gagal:", e);
        showToast("Gagal menjadwalkan pengingat.", "error");
    }
}
// ==========================================
// SCHEDULE — WEB (browser dev)
// ==========================================
function _scheduleWeb(items) {
    items.forEach(function (n) {
        var delay = n.triggerMs - Date.now();
        if (delay <= 0) return;
        // Batas setTimeout ~24.8 hari — kalau lebih, abaikan di web
        if (delay > 2147483647) {
            console.warn("[Deadline] Reminder terlalu jauh untuk setTimeout web, skip:", n.id);
            return;
        }
        var timer = setTimeout(function () {
            _fireWebNotification(n);
            delete NotifState.webTimeouts[n.id];
        }, delay);
        NotifState.webTimeouts[n.id] = timer;
    });
    console.log("[Deadline] Web notif terjadwal:", Object.keys(NotifState.webTimeouts).length);
}

function _fireWebNotification(n) {
    try {
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification(n.title, { body: n.body });
        }
    } catch (e) { /* ignore */ }
    // Fallback: toast kalau tab sedang terbuka
    showToast(n.title + " — " + n.body, "info");
}

// ==========================================
// HELPER — untuk UI preview
// ==========================================
/**
 * Kembalikan daftar { waktu_trigger, ms } untuk ditampilkan di modal tugas.
 * Hanya yang future.
 */
async function previewJadwalNotifikasi(tugas) {
    if (!tugas.deadline) return [];
    var deadlineMs = new Date(tugas.deadline).getTime();
    if (isNaN(deadlineMs)) return [];
    var reminders = await getRemindersForTugas(tugas);
    var now = Date.now();
    var out = [];
    reminders.forEach(function (r, index) {
        var triggerMs = deadlineMs - offsetToMs(r.satuan, r.nilai);
        if (triggerMs <= now) return;
        out.push({
            index: index,
            waktu_trigger: new Date(triggerMs).toISOString(),
            offset: r
        });
    });
    out.sort(function (a, b) {
        return new Date(a.waktu_trigger) - new Date(b.waktu_trigger);
    });
    return out;
}

// ==========================================
// TEST NOTIFIKASI (5 detik ke depan)
// ==========================================
async function testNotifikasi() {
    if (!_isCapacitorNative()) {
        showToast("Tes notifikasi hanya berjalan di aplikasi Android.", "info");
        return;
    }
    var ok = await ensureNotifPermission();
    if (!ok) {
        showToast("Izin ditolak. Buka Pengaturan HP > Aplikasi > Deadline > Notifikasi.", "error");
        return;
    }
    var LN = _getLocalNotifications();
    try {
        await LN.schedule({
            notifications: [{
                id: 9999,
                title: "Tes Notifikasi",
                body: "Berhasil! Notifikasi Deadline berfungsi.",
                schedule: { at: new Date(Date.now() + 5000), allowWhileIdle: true }
            }]
        });
        showToast("Notif dites dalam 5 detik. Kunci HP sekarang!", "success");
    } catch (e) {
        showToast("Gagal tes: " + e.message, "error");
    }
}

console.log("[Deadline] notifikasi.js loaded");
