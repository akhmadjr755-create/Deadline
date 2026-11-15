// ==========================================
// update.js — In-App Updater (GitHub Releases)
// ==========================================

// ATUR BAGIAN INI SESUAI REPO GITHUB LO
const GITHUB_OWNER = 'akhmadjr755-create';
const GITHUB_REPO = 'Deadline';

// Versi aplikasi saat ini (Harus diupdate setiap kali rilis versi baru)
const CURRENT_APP_VERSION = '1.0.0'; 

let latestApkUrl = '';

async function cekUpdateAplikasi() {
    var btn = document.getElementById('btn-check-update');
    if (btn) btn.textContent = "⏳ Memeriksa...";

    try {
        var res = await fetch(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`);
        if (!res.ok) throw new Error("Gagal cek server");
        
        var data = await res.json();
        var latestVersion = data.tag_name.replace('v', ''); // hapus huruf 'v' (misal v2.0.1 jadi 2.0.1)
        
        // Bandingkan versi (jika versi GitHub lebih besar)
        if (isVersionNewer(latestVersion, CURRENT_APP_VERSION)) {
            latestApkUrl = data.assets[0].browser_download_url;
            
            document.getElementById('update-version').textContent = data.tag_name;
            document.getElementById('update-changelog').textContent = data.body || "Peningkatan performa dan perbaikan bug.";
            
            if (typeof openModal === 'function') openModal('modal-update');
        } else {
            if (typeof showToast === 'function') showToast("Aplikasi sudah versi terbaru (v" + CURRENT_APP_VERSION + ")", "success");
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') showToast("Gagal cek update. Pastikan ada internet.", "error");
    } finally {
        if (btn) btn.textContent = "🔄 Cek Update Aplikasi";
    }
}

function isVersionNewer(newV, currentV) {
    var n1 = newV.split('.').map(Number);
    var n2 = currentV.split('.').map(Number);
    for (var i = 0; i < Math.max(n1.length, n2.length); i++) {
        var v1 = n1[i] || 0;
        var v2 = n2[i] || 0;
        if (v1 > v2) return true;
        if (v1 < v2) return false;
    }
    return false;
}

// Pasang Event Listener saat DOM siap
document.addEventListener('DOMContentLoaded', function() {
    var btn = document.getElementById('btn-check-update');
    if (btn) btn.addEventListener('click', cekUpdateAplikasi);

    var btnDownload = document.getElementById('btn-download-update');
    if (btnDownload) {
        btnDownload.addEventListener('click', function() {
            if (latestApkUrl) {
                // Buka link download di sistem Android (browser/download manager)
                window.open(latestApkUrl, '_system');
            }
        });
    }
});
