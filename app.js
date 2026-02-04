// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();
let currentUser = null, userProfile = null;

// --- 2. HELPERS ---
const t2m = (t) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (h >= 0 && h <= 4) h += 24; 
    return h * 60 + m;
};

// Formats date to DD/MM/YYYY
const formatDate = (dateStr) => {
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const f = (dt) => dt.toLocaleDateString('en-GB'); // Gives DD/MM/YYYY
    return { label: f(sun) + " to " + f(sat) + "_" + sun.getFullYear() };
}

// --- 3. SCORING ENGINE ---
function calculateFinalScore(data, userLevel) {
    const slpM = t2m(data.sleepTime), wakM = t2m(data.wakeupTime), chnM = t2m(data.chantingTime);
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    if (slpM <= 1350) sc.sleep = 25; else if (slpM <= 1355) sc.sleep = 20; else if (slpM <= 1360) sc.sleep = 15; else if (slpM <= 1365) sc.sleep = 10; else if (slpM <= 1370) sc.sleep = 5; else if (slpM <= 1375) sc.sleep = 0;
    if (wakM <= 305) sc.wakeup = 25; else if (wakM <= 310) sc.wakeup = 20; else if (wakM <= 315) sc.wakeup = 15; else if (wakM <= 320) sc.wakeup = 10; else if (wakM <= 325) sc.wakeup = 5; else if (wakM <= 330) sc.wakeup = 0;
    if (chnM <= 540) sc.chanting = 25; else if (chnM <= 570) sc.chanting = 20; else if (chnM <= 660) sc.chanting = 15; else if (chnM <= 870) sc.chanting = 10; else if (chnM <= 1020) sc.chanting = 5; else if (chnM <= 1140) sc.chanting = 0;

    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25; if (m >= threshold - 10) return 20; if (m >= 20) return 15; if (m >= 15) return 10; if (m >= 10) return 5; if (m >= 5) return 0; return -5;
    };

    const thresh = (userLevel === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, thresh);
    sc.hearing = getActScore(data.hearingMinutes, thresh);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;
    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    if (userLevel === "Senior Batch") {
        const s = data.serviceMinutes;
        if (s >= 15) sc.service = 10; else if (s >= 10) sc.service = 5; else if (s >= 5) sc.service = 0; else sc.service = -5;
        const n = data.notesMinutes;
        if (n >= 20) sc.notes = 15; else if (n >= 15) sc.notes = 10; else if (n >= 10) sc.notes = 5; else if (n >= 5) sc.notes = 0; else sc.notes = -5;
        total += (sc.service + sc.notes);
    } else {
        sc.service = getActScore(data.serviceMinutes, 30);
        total += sc.service;
    }
    return { total, percent: Math.round((total / 160) * 100) };
}

// --- 4. AUTH & NAVIGATION ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.name + " | " + userProfile.level;
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field').classList.remove('hidden');
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard');
            setupDateSelect();
            loadMyReports();
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    if (t === 'admin') loadAdminPanel();
    if (t === 'reports') loadMyReports();
};

// --- 5. CORE FUNCTIONS ---
function setupDateSelect() {
    const sel = document.getElementById('sadhana-date');
    if (!sel) return;
    sel.innerHTML = "";
    for (let i = 0; i < 2; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        sel.innerHTML += `<option value="${iso}">${formatDate(iso)}</option>`;
    }
}

async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    if (!container || !currentUser) return;
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    
    if (snap.empty) { container.innerHTML = "<p class='card'>No data recorded.</p>"; return; }

    const groups = {};
    snap.forEach(doc => {
        const week = getWeekInfo(doc.id).label;
        if (!groups[week]) groups[week] = [];
        groups[week].push({ id: doc.id, ...doc.data() });
    });

    let html = "";
    Object.keys(groups).sort().reverse().forEach(w => {
        html += `<details class="card" open style="margin-bottom:10px;">
                    <summary style="cursor:pointer; font-weight:bold; padding:5px;">Week: ${w.split('_')[0]}</summary>
                    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                        <tr style="border-bottom:1px solid #ddd; text-align:left;"><th>Date</th><th>Score</th><th>%</th></tr>`;
        groups[w].sort((a,b) => b.id.localeCompare(a.id)).forEach(e => {
            html += `<tr style="border-bottom:1px solid #eee">
                        <td style="padding:8px;">${formatDate(e.id)}</td>
                        <td>${e.totalScore}</td>
                        <td style="font-weight:bold;">${e.dayPercent}%</td>
                     </tr>`;
        });
        html += "</table></details>";
    });
    container.innerHTML = html;
}

async function loadAdminPanel() {
    const body = document.getElementById('admin-table-body');
    const head = document.getElementById('admin-table-header');
    if (!body) return;
    head.innerHTML = "<th>Devotee</th><th>Level</th><th>Today %</th><th>Status</th>";
    body.innerHTML = "<tr><td colspan='4'>Updating list...</td></tr>";

    const users = await db.collection('users').get();
    const today = new Date().toISOString().split('T')[0];
    let rows = "";
    for (const uDoc of users.docs) {
        const u = uDoc.data();
        const sDoc = await db.collection('users').doc(uDoc.id).collection('sadhana').doc(today).get();
        let score = sDoc.exists ? sDoc.data().dayPercent + "%" : "Pending";
        rows += `<tr style="border-bottom:1px solid #eee">
                    <td style="padding:10px;">${u.name}</td>
                    <td>${u.level}</td>
                    <td>${score}</td>
                    <td>${sDoc.exists ? '✅' : '⏳'}</td>
                 </tr>`;
    }
    body.innerHTML = rows;
}

// --- 6. ACTIONS ---
window.openProfileEdit = () => showSection('profile');

window.downloadMasterReport = async () => {
    const users = await db.collection('users').get();
    let rows = [["Name", "Level", "Date", "Score", "Percent"]];
    for (const uDoc of users.docs) {
        const u = uDoc.data();
        const sadhana = await db.collection('users').doc(uDoc.id).collection('sadhana').get();
        sadhana.forEach(s => rows.push([u.name, u.level, formatDate(s.id), s.data().totalScore, s.data().dayPercent]));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows), wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master");
    XLSX.writeFile(wb, "Sadhana_Export.xlsx");
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const dateId = document.getElementById('sadhana-date').value;
    const data = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value) || 0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    const res = calculateFinalScore(data, userProfile.level);
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({...data, totalScore: res.total, dayPercent: res.percent});
    alert("Sadhana Submitted!");
    switchTab('reports');
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    await db.collection('users').doc(currentUser.uid).set({
        name: document.getElementById('profile-name').value,
        level: document.getElementById('profile-level').value,
        role: userProfile?.role || 'user'
    }, { merge: true });
    location.reload();
};

document.getElementById('logout-btn').onclick = () => auth.signOut();
