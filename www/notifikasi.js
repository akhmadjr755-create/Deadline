var NotifState = {
    permission: "unknown",
    webTimeouts: {},
    inited: false
};

var MAX_REMINDER_INDEX = 20;

function _isCapacitorNative() {
    return typeof window !== "undefined" && window.Capacitor && typeof window.Capacitor.isNativePlatform === "function" && window.Capacitor.isNativePlatform();
}

function _getLocalNotifications() {
    if (!_isCapacitorNative() || !window.Capacitor.Plugins) return null;
    return window.Capacitor.Plugins.LocalNotifications || null;
}

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
        } catch (e) {}
    } else if (typeof Notification !== "undefined") {
        NotifState.permission = Notification.permission;
    }
}

async function ensureNotifPermission() {
    if (NotifState.permission === "granted") return true;
    if (_isCapacitorNative()) {
        try {
            var LN = _getLocalNotifications();
            if (!LN) return false;
            var res = await LN.requestPermissions();
            if (res.display === "granted") { NotifState.permission = "granted"; return true; }
            return false;
        } catch (e) { return false; }
    } else if (typeof Notification !== "undefined") {
        try {
            var p = await Notification.requestPermission();
            NotifState.permission = p;
            return p === "granted";
        } catch (e) { return false; }
    }
    return false;
}

async function getRemindersForTugas(tugas) {
    if (tugas.reminder_mode === 'NONE') return [];
    if (Array.isArray(tugas.reminder_override)) {
        return tugas.reminder_override.filter(r => r && r.satuan && Number(r.nilai) > 0);
    }
    var pengaturan = await getPengaturan();
    if (pengaturan && Array.isArray(pengaturan.default_reminders)) {
        return pengaturan.default_reminders.filter(r => r && r.satuan && Number(r.nilai) > 0);
    }
    return [];
}

async function batalkanNotifikasiTugas(tugasId) {
    var ids = [];
    for (var i = 0; i < MAX_REMINDER_INDEX; i++) ids.push(notifIdFor(tugasId, i));
    if (!_isCapacitorNative()) {
        ids.forEach(id => { if (NotifState.webTimeouts[id]) { clearTimeout(NotifState.webTimeouts[id]); delete NotifState.webTimeouts[id]; } });
        return;
    }
    var LN = _getLocalNotifications();
    if (LN) {
        try { await LN.cancel({ notifications: ids.map(id => ({ id })) }); } catch (e) {}
    }
}

async function syncNotifikasiTugas(tugas) {
    await batalkanNotifikasiTugas(tugas.id);
    if (tugas.status_selesai || tugas.reminder_mode === 'NONE') return;
    var deadlineMs = new Date(tugas.deadline).getTime();
    if (isNaN(deadlineMs)) return;
    var reminders = await getRemindersForTugas(tugas);
    if (reminders.length === 0) return;
    var matkul = await getMatkulById(tugas.mata_kuliah_id);
    var matkulName = matkul ? matkul.nama : "Tanpa Matkul";
    var ok = await ensureNotifPermission();
    if (!ok) return;

    var now = Date.now();
    var toSchedule = [];
    reminders.forEach(function (r, index) {
        var triggerMs = deadlineMs - offsetToMs(r.satuan, r.nilai);
        if (triggerMs <= now) return;
        toSchedule.push({
            id: notifIdFor(tugas.id, index),
            title: "Pengingat: " + tugas.nama,
            body: matkulName + " · Deadline " + formatTanggalWaktu(tugas.deadline),
            triggerMs: triggerMs
        });
    });
    if (toSchedule.length === 0) return;
    if (_isCapacitorNative()) await _scheduleNative(toSchedule);
    else _scheduleWeb(toSchedule);
}

// ==========================================
// RANGKUMAN PAGI
// ==========================================
async function scheduleDailySummary() {
    var p = await getPengaturan();
    if (!p || !p.daily_summary_enabled || !p.daily_summary_time) return;

    var timeParts = p.daily_summary_time.split(":");
    var h = parseInt(timeParts[0], 10);
    var m = parseInt(timeParts[1], 10);

    var now = new Date();
    var target = new Date();
    target.setHours(h, m, 0, 0);
    if (target <= now) target.setDate(target.getDate() + 1);

    var tugas = await getTugas();
    var besok = new Date(target);
    besok.setDate(besok.getDate() + 1);
    
    var countToday = 0, countBesok = 0;
    tugas.forEach(t => {
        if (t.status_selesai) return;
        var dl = new Date(t.deadline);
        if (dl >= now && dl <= target) countToday++;
        if (dl > target && dl <= besok) countBesok++;
    });

    var msg = "Hari ini: " + countToday + " deadline. Besok: " + countBesok + " deadline.";
    var ok = await ensureNotifPermission();
    if (!ok) return;

    if (_isCapacitorNative()) {
        var LN = _getLocalNotifications();
        if (LN) {
            await LN.schedule({
                notifications: [{
                    id: 99999, // ID statis buat summary
                    title: "☀️ Rangkuman Pagi",
                    body: msg,
                    schedule: { at: target, allowWhileIdle: true },
                    channelId: 'deadline_reminder'
                }]
            });
        }
    } else {
        var delay = target.getTime() - now.getTime();
        if (delay > 0 && delay < 2147483647) {
            setTimeout(() => {
                if (Notification.permission === "granted") new Notification("☀️ Rangkuman Pagi", { body: msg });
            }, delay);
        }
    }
}

// ==========================================
// SCHEDULER CORE
// ==========================================
async function _scheduleNative(items) {
    var LN = _getLocalNotifications();
    if (!LN) return;
    var payload = items.map(function (n) {
        return {
            id: n.id, title: n.title, body: n.body,
            schedule: { at: new Date(n.triggerMs), allowWhileIdle: true },
            channelId: 'deadline_reminder'
        };
    });
    try { await LN.schedule({ notifications: payload }); } catch (e) { console.error(e); }
}

function _scheduleWeb(items) {
    items.forEach(function (n) {
        var delay = n.triggerMs - Date.now();
        if (delay <= 0 || delay > 2147483647) return;
        var timer = setTimeout(function () {
            try { if (Notification.permission === "granted") new Notification(n.title, { body: n.body }); } catch (e) {}
            showToast(n.title + " — " + n.body, "info");
            delete NotifState.webTimeouts[n.id];
        }, delay);
        NotifState.webTimeouts[n.id] = timer;
    });
}

async function testNotifikasi() {
    if (!_isCapacitorNative()) { showToast("Tes notif hanya di APK.", "info"); return; }
    var ok = await ensureNotifPermission();
    if (!ok) return;
    var LN = _getLocalNotifications();
    await LN.schedule({
        notifications: [{
            id: 9999, title: "Tes Notifikasi", body: "Berhasil!",
            schedule: { at: new Date(Date.now() + 5000) }
        }]
    });
    showToast("Notif dites dalam 5 detik.", "success");
}
console.log("[Deadline] notifikasi.js loaded");
