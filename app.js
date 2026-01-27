// --- CONFIG & STATE ---
let currentUserMeta = JSON.parse(localStorage.getItem('user_meta')) || null;

const timeToMins = (timeStr, isNightShift = false) => {
    if (!timeStr) return 0;
    const [hrs, mins] = timeStr.split(':').map(Number);
    let totalMins = hrs * 60 + mins;
    if (isNightShift && hrs < 12) totalMins += 1440;
    return totalMins;
};

// --- UNIFIED SCORING ENGINE (The 160 Standard) ---
const calculateUnifiedScore = (entry, pos) => {
    let sc = { sleep: 0, wakeup: 0, chanting: 0, read: 0, hear: 0, service: 0, notes: 0, daySleep: 0 };
    
    // 1. SLEEP (Target 10:30 PM) - 5 min slabs
    const sMins = timeToMins(entry.sleep, true);
    if (sMins <= 1350) sc.sleep = 25;
    else if (sMins > 1380) sc.sleep = -5; 
    else sc.sleep = 25 - (Math.ceil((sMins - 1350) / 5) * 5);

    // 2. WAKEUP (Target 5:05 AM) - 5 min slabs
    const wMins = timeToMins(entry.wakeup);
    if (wMins <= 305) sc.wakeup = 25;
    else if (wMins > 335) sc.wakeup = -5; 
    else sc.wakeup = 25 - (Math.ceil((wMins - 305) / 5) * 5);

    // 3. CHANTING (The 2026 Gradual Buckets)
    const cMins = timeToMins(entry.chanting);
    if (cMins <= 540) sc.chanting = 25;      // 9:00 AM
    else if (cMins <= 570) sc.chanting = 20; // 9:30 AM
    else if (cMins <= 660) sc.chanting = 15; // 11:00 AM
    else if (cMins <= 870) sc.chanting = 10; // 2:30 PM
    else if (cMins <= 1020) sc.chanting = 5; // 5:00 PM
    else if (cMins <= 1140) sc.chanting = 0; // 7:00 PM
    else sc.chanting = -5;

    // 4. STUDY (Both Compulsory - No "Best of" anymore)
    const getStudyPts = (m) => (m >= 30 ? 25 : (m >= 15 ? 15 : (m >= 10 ? 5 : 0)));
    sc.read = getStudyPts(entry.read);
    sc.hear = getStudyPts(entry.hear);

    // 5. POSITION SPECIFIC (Senior Batch vs Coordinators)
    if (pos === "Senior Batch") {
        sc.service = entry.service >= 15 ? 10 : 0;
        sc.notes = entry.notes >= 20 ? 15 : 0;
    } else {
        // Coordinators: Reading/Hearing (50) + Service (25)
        sc.service = entry.service >= 30 ? 25 : (entry.service >= 15 ? 15 : (entry.service >= 5 ? 5 : 0));
        sc.notes = 0;
    }

    // 6. DAY SLEEP
    sc.daySleep = entry.daySleep === 0 ? 10 : (entry.daySleep <= 60 ? 5 : -5);

    return { total: Object.values(sc).reduce((a, b) => a + b, 0), breakdown: sc };
};

// --- FIREBASE SUBMISSION ---
const submitDailyReport = async (event) => {
    event.preventDefault();
    if (!currentUserMeta) return alert("Profile save karo pehle!");

    const data = {
        date: document.getElementById('s-date').value,
        sleep: document.getElementById('s-sleep').value,
        wakeup: document.getElementById('s-wakeup').value,
        chanting: document.getElementById('s-chanting').value,
        read: parseInt(document.getElementById('s-read').value) || 0,
        hear: parseInt(document.getElementById('s-hear').value) || 0,
        service: parseInt(document.getElementById('s-service').value) || 0,
        notes: parseInt(document.getElementById('s-notes').value) || 0,
        daySleep: parseInt(document.getElementById('s-daysleep').value) || 0
    };

    const result = calculateUnifiedScore(data, currentUserMeta.pos);

    try {
        await db.collection('sadhana_logs').add({
            uName: currentUserMeta.name,
            uLevel: currentUserMeta.level, // Sirf reporting ke liye
            uPos: currentUserMeta.pos,
            ...data,
            totalScore: result.total,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`Jai Ho! Total Score: ${result.total}/160`);
    } catch (e) { alert("Error! Check Console."); }
};

// --- ADMIN REPORTS (Efficiency Calculation) ---
const loadAdminReports = async () => {
    const reportDiv = document.getElementById('report-output');
    try {
        const snap = await db.collection('sadhana_logs').get();
        let userStats = {};

        snap.forEach(doc => {
            const log = doc.data();
            if (!userStats[log.uName]) userStats[log.uName] = { score: 0, level: log.uLevel };
            userStats[log.uName].score += log.totalScore;
        });

        let table = `<table class="report-table"><tr><th>Devotee</th><th>Level</th><th>Efficiency %</th></tr>`;
        for (let name in userStats) {
            // Everyone is measured against the 160-mark standard
            const weeklyMax = 1120; 
            const efficiency = ((userStats[name].score / weeklyMax) * 100).toFixed(1);
            table += `<tr><td>${name}</td><td>${userStats[name].level}</td><td><b>${efficiency}%</b></td></tr>`;
        }
        reportDiv.innerHTML = table + `</table>`;
    } catch (e) { reportDiv.innerHTML = "Error loading stats."; }
};

// Initialization remains the same
window.onload = () => {
    if (currentUserMeta) {
        document.getElementById('p-name').value = currentUserMeta.name || '';
        document.getElementById('p-pos').value = currentUserMeta.pos || 'Senior Batch';
        document.getElementById('p-level').value = currentUserMeta.level || 'Level 1';
        handlePositionUI(); 
        if (currentUserMeta.isAdmin) {
            document.getElementById('admin-panel').style.display = 'block';
            loadAdminReports();
        }
    }
    document.getElementById('sadhana-form').addEventListener('submit', submitDailyReport);
};
