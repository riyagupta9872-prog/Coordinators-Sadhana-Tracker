// --- 1. FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const auth = firebase.auth();
const db = firebase.firestore();

let currentUser = null;
let userProfile = null;

// --- 2. TIME HELPERS ---
const t2m = (t) => {
    if (!t) return 9999;
    let parts = t.split(':');
    let h = parseInt(parts[0]);
    let m = parseInt(parts[1]);
    if (h >= 0 && h <= 4) h += 24; 
    return h * 60 + m;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    const fmt = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleString('en-GB', { month: 'short' });
        return day + " " + month;
    };
    return { 
        sunStr: sun.toISOString().split('T')[0], 
        label: fmt(sun) + " to " + fmt(sat) + "_" + sun.getFullYear() 
    };
}

// --- 3. SCORING ENGINE (Fixed Discrepancies) ---
function calculateFinalScore(data, userLevel) {
    const slpM = t2m(data.sleepTime);
    const wakM = t2m(data.wakeupTime);
    const chnM = t2m(data.chantingTime);

    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    // Sleep Scoring
    if (slpM <= 1350) sc.sleep = 25;
    else if (slpM <= 1355) sc.sleep = 20;
    else if (slpM <= 1360) sc.sleep = 15;
    else if (slpM <= 1365) sc.sleep = 10;
    else if (slpM <= 1370) sc.sleep = 5;
    else if (slpM <= 1375) sc.sleep = 0;
    else sc.sleep = -5;

    // Wakeup Scoring
    if (wakM <= 305) sc.wakeup = 25;
    else if (wakM <= 310) sc.wakeup = 20;
    else if (wakM <= 315) sc.wakeup = 15;
    else if (wakM <= 320) sc.wakeup = 10;
    else if (wakM <= 325) sc.wakeup = 5;
    else if (wakM <= 330) sc.wakeup = 0;
    else sc.wakeup = -5;

    // Chanting Scoring
    if (chnM <= 540) sc.chanting = 25;
    else if (chnM <= 570) sc.chanting = 20;
    else if (chnM <= 660) sc.chanting = 15;
    else if (chnM <= 870) sc.chanting = 10;
    else if (chnM <= 1020) sc.chanting = 5;
    else if (chnM <= 1140) sc.chanting = 0;
    else sc.chanting = -5;

    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25;
        if (m >= threshold - 10) return 20;
        if (m >= 20) return 15;
        if (m >= 15) return 10;
        if (m >= 10) return 5;
        if (m >= 5) return 0;
        return -5;
    };

    const thresh = (userLevel === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, thresh);
    sc.hearing = getActScore(data.hearingMinutes, thresh);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    if (userLevel === "Senior Batch") {
        const s = data.serviceMinutes;
        if (s >= 15) sc.service = 10; 
        else if (s >= 10) sc.service = 5; 
        else if (s >= 5) sc.service = 0; 
        else sc.service = -5;
        
        const n = data.notesMinutes;
        if (n >= 20) sc.notes = 15; 
        else if (n >= 15) sc.notes = 10; 
        else if (n >= 10) sc.notes = 5; 
        else if (n >= 5) sc.notes = 0; 
        else sc.notes = -5;
        
        total += (sc.service + sc.notes);
    } else {
        sc.service = getActScore(data.serviceMinutes, 30);
        total += sc.service;
    }
    return { total: total, percent: Math.round((total / 160) * 100) };
}

// --- 4. AUTH & PROFILE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        try {
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                userProfile = doc.data();
                document.getElementById('user-display-name').textContent = userProfile.name + " | " + userProfile.level;
                
                const notesField = document.getElementById('notes-revision-field');
                if(notesField) notesField.classList.toggle('hidden', userProfile.level !== "Senior Batch");
                
                if (userProfile.role === 'admin') {
                    document.getElementById('admin-tab-btn').classList.remove('hidden');
                }
                showSection('dashboard');
                setupDateSelect();
                loadMyReports();
            } else {
                showSection('profile');
            }
        } catch (e) { console.error("Error fetching profile:", e); }
    } else {
        showSection('auth');
    }
});

// --- 5. DATA LOADING ---
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    if (!container || !currentUser) return;
    
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    
    if (snap.empty) {
        container.innerHTML = "<div class='card'><p>No reports found.</p></div>";
        return;
    }

    const weeklyGroups = {};
    snap.forEach(doc => {
        const d = doc.data();
        const week = getWeekInfo(doc.id).label;
        if (!weeklyGroups[week]) weeklyGroups[week] = [];
        weeklyGroups[week].push({ id: doc.id, ...d });
    });

    let html = "";
    Object.keys(weeklyGroups).sort().reverse().forEach(week => {
        html += `<details class="card" style="margin-bottom:15px; cursor:pointer;">
                    <summary style="font-weight:bold; padding:10px;">Week: ${week.split('_')[0]}</summary>
                    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                        <tr style="text-align:left; border-bottom:2px solid #eee;">
                            <th>Date</th><th>Score</th><th>%</th>
                        </tr>`;
        
        let sorted = weeklyGroups[week].sort((a,b) => b.id.localeCompare(a.id));
        sorted.forEach(e => {
            html += `<tr style="border-bottom:1px solid #f0f0f0;">
                        <td style="padding:10px;">${e.id}</td>
                        <td>${e.totalScore}</td>
                        <td><strong>${e.dayPercent}%</strong></td>
                    </tr>`;
        });
        html += `</table></details>`;
    });
    container.innerHTML = html;
}

async function loadAdminPanel() {
    const body = document.getElementById('admin-table-body');
    const header = document.getElementById('admin-table-header');
    if (!body || !header) return;

    header.innerHTML = "<th>Devotee Name</th><th>Level</th><th>Today %</th><th>Status</th>";
    body.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";

    const usersSnap = await db.collection('users').get();
    const today = new Date().toISOString().split('T')[0];
    let bodyHtml = "";

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sDoc = await db.collection('users').doc(uDoc.id).collection('sadhana').doc(today).get();
        let score = "N/A";
        let status = "Pending";
        if (sDoc.exists) {
            score = sDoc.data().dayPercent + "%";
            status = "Submitted";
        }
        bodyHtml += `<tr><td>${u.name}</td><td>${u.level}</td><td>${score}</td><td>${status}</td></tr>`;
    }
    body.innerHTML = bodyHtml;
}

// --- 6. CORE ACTIONS ---
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.add('active');
    if(event && event.currentTarget) event.currentTarget.classList.add('active');
    if (t === 'admin') loadAdminPanel();
    if (t === 'reports') loadMyReports();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.openProfileEdit = () => {
    if (userProfile) {
        document.getElementById('profile-name').value = userProfile.name;
        document.getElementById('profile-level').value = userProfile.level;
        document.getElementById('cancel-edit').classList.remove('hidden');
        showSection('profile');
    }
};

window.downloadMasterReport = async () => {
    const usersSnap = await db.collection('users').get();
    let rows = [["Name", "Level", "Date", "Score", "Percent"]];
    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sSnap = await db.collection('users').doc(uDoc.id).collection('sadhana').get();
        sSnap.forEach(s => rows.push([u.name, u.level, s.id, s.data().totalScore, s.data().dayPercent]));
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SadhanaData");
    XLSX.writeFile(wb, "Master_Report.xlsx");
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value) || 0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0
    };
    const result = calculateFinalScore(data, userProfile.level);
    const dateId = document.getElementById('sadhana-date').value;
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
        ...data,
        totalScore: result.total,
        dayPercent: result.percent,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Saved!");
    loadMyReports();
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
        .catch(err => alert(err.message));
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

function setupDateSelect() {
    const sel = document.getElementById('sadhana-date');
    if (!sel) return;
    sel.innerHTML = "";
    for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        sel.innerHTML += `<option value="${iso}">${i === 0 ? 'Today' : i === 1 ? 'Yesterday' : iso}</option>`;
    }
}

document.getElementById('logout-btn').onclick = () => auth.signOut();
