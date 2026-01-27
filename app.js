// --- Global Data ---
let userData = JSON.parse(localStorage.getItem('devotee_meta')) || {};

// --- Tab System (Purana & Simple) ---
function openTab(evt, tabName) {
    let i, tabcontent, tablinks;
    tabcontent = document.getElementsByClassName("tab-content");
    for (i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }
    tablinks = document.getElementsByClassName("tablinks");
    for (i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }
    document.getElementById(tabName).style.display = "block";
    if (evt) evt.currentTarget.className += " active";
}

// --- Logic Update (Position & Chanting Buckets) ---
function calculateSadhanaScore(d) {
    let sc = { sleep: 0, wakeup: 0, chanting: 0, read: 0, hear: 0, service: 0, notes: 0, daySleep: 0 };
    const t2m = (t, night = false) => {
        if (!t) return 0;
        let [h, m] = t.split(':').map(Number);
        let total = h * 60 + m;
        if (night && h < 12) total += 1440;
        return total;
    };

    // 1. Sleep: 10:30 PM (1350m)
    const sTime = t2m(d.sleep, true);
    if (sTime <= 1350) sc.sleep = 25;
    else if (sTime > 1380) sc.sleep = -5;
    else sc.sleep = 25 - (Math.ceil((sTime - 1350) / 5) * 5);

    // 2. Wakeup: 5:05 AM (305m)
    const wTime = t2m(d.wakeup);
    if (wTime <= 305) sc.wakeup = 25;
    else if (wTime > 335) sc.wakeup = -5;
    else sc.wakeup = 25 - (Math.ceil((wTime - 305) / 5) * 5);

    // 3. Chanting: Buckets (Locked Jan-2026)
    const cTime = t2m(d.chanting);
    if (cTime <= 540) sc.chanting = 25;       // 9:00 AM
    else if (cTime <= 570) sc.chanting = 20;  // 9:30 AM
    else if (cTime <= 660) sc.chanting = 15;  // 11:00 AM
    else if (cTime <= 870) sc.chanting = 10;  // 2:30 PM
    else if (cTime <= 1020) sc.chanting = 5;   // 5:00 PM
    else if (cTime <= 1140) sc.chanting = 0;   // 7:00 PM
    else sc.chanting = -5;

    // 4. Study: Reading & Hearing (Both Compulsory for everyone)
    const getStudyPts = (m) => (m >= 30 ? 25 : (m >= 15 ? 15 : (m >= 10 ? 5 : 0)));
    sc.read = getStudyPts(d.read);
    sc.hear = getStudyPts(d.hear);

    // 5. Position Logic (Locked Senior Batch Addition)
    if (userData.pos === "Senior Batch") {
        sc.service = d.service >= 15 ? 10 : 0; // 15m = 10pt
        sc.notes = d.notes >= 20 ? 15 : 0;     // 20m = 15pt
    } else {
        sc.service = d.service >= 30 ? 25 : (d.service >= 15 ? 15 : (d.service >= 5 ? 5 : 0));
        sc.notes = 0;
    }

    sc.daySleep = d.daySleep === 0 ? 10 : (d.daySleep <= 60 ? 5 : -5);
    return Object.values(sc).reduce((a, b) => a + b, 0);
}

// --- Submit & Profile ---
function saveProfile() {
    userData = {
        name: document.getElementById('p-name').value,
        pos: document.getElementById('p-pos').value,
        level: document.getElementById('p-level').value
    };
    localStorage.setItem('devotee_meta', JSON.stringify(userData));
    alert("Profile Saved!");
    location.reload();
}

async function handleSubmit(e) {
    e.preventDefault();
    if (!userData.name) return alert("Pehle Profile save karein!");

    const d = {
        sleep: document.getElementById('s-sleep').value,
        wakeup: document.getElementById('s-wakeup').value,
        chanting: document.getElementById('s-chanting').value,
        read: parseInt(document.getElementById('s-read').value) || 0,
        hear: parseInt(document.getElementById('s-hear').value) || 0,
        service: parseInt(document.getElementById('s-service').value) || 0,
        notes: parseInt(document.getElementById('s-notes').value) || 0,
        daySleep: parseInt(document.getElementById('s-daysleep').value) || 0,
        date: document.getElementById('s-date').value
    };

    const total = calculateSadhanaScore(d);

    try {
        await db.collection('sadhana_logs').add({
            ...d,
            uName: userData.name,
            uLevel: userData.level,
            uPos: userData.pos,
            totalScore: total,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        alert(`Submitted! Total: ${total}/160`);
    } catch (err) { console.error(err); }
}

// --- Reports (Always Visible to Admin) ---
async function loadReports() {
    const reportDiv = document.getElementById('report-output');
    try {
        const snap = await db.collection('sadhana_logs').orderBy('createdAt', 'desc').get();
        let stats = {};
        snap.forEach(doc => {
            let log = doc.data();
            if (!stats[log.uName]) stats[log.uName] = { score: 0, level: log.uLevel };
            stats[log.uName].score += log.totalScore;
        });

        let html = `<table border="1" style="width:100%; border-collapse:collapse;">
                    <tr><th>Name</th><th>Level</th><th>Weekly Eff. %</th></tr>`;
        for (let name in stats) {
            let eff = ((stats[name].score / 1120) * 100).toFixed(1);
            html += `<tr><td>${name}</td><td>${stats[name].level}</td><td>${eff}%</td></tr>`;
        }
        reportDiv.innerHTML = html + "</table>";
    } catch (e) { console.error(e); }
}

window.onload = () => {
    if (userData.name) {
        document.getElementById('p-name').value = userData.name;
        document.getElementById('p-pos').value = userData.pos;
        document.getElementById('p-level').value = userData.level;
        
        // Hide/Show Notes Wrapper based on Senior Batch
        if(document.getElementById('notes-wrapper')) {
            document.getElementById('notes-wrapper').style.display = (userData.pos === "Senior Batch") ? "block" : "none";
        }
        loadReports();
    }
    document.getElementById('sadhana-form').addEventListener('submit', handleSubmit);
    openTab(null, 'DailyEntry'); 
};
