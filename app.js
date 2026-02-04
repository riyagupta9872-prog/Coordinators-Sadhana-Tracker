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

// --- 2. FORMATTERS ---
const t2m = (t) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (h >= 0 && h <= 4) h += 24; 
    return h * 60 + m;
};

const formatToDDMM = (iso) => {
    if(!iso) return "";
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
};

// --- 3. SCORING ENGINE ---

function calculateFinalScore(data, userLevel) {
    // 1. Convert Time to Minutes (t2m helper)
    const slpM = t2m(data.sleepTime);
    const wakM = t2m(data.wakeupTime);
    const chnM = t2m(data.chantingTime);

    // 2. Initialize scores with default penalty (-5)
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    // --- TIME BASED SCORING ---
    // Sleep (Target 10:30 PM / 1350 mins)
    if (slpM <= 1350) sc.sleep = 25; 
    else if (slpM <= 1355) sc.sleep = 20; 
    else if (slpM <= 1360) sc.sleep = 15; 
    else if (slpM <= 1365) sc.sleep = 10; 
    else if (slpM <= 1370) sc.sleep = 5; 
    else if (slpM <= 1375) sc.sleep = 0;
    else if (slpM > 1375) sc.sleep = -5;

    // Wakeup (Target 5.05 AM / 305 mins)
        if (wakM <= 305) sc.wakeup = 25; 
    else if (wakM <= 310) sc.wakeup = 20; 
    else if (wakM <= 315) sc.wakeup = 15; 
    else if (wakM <= 320) sc.wakeup = 10; 
    else if (wakM <= 325) sc.wakeup = 5; 
    else if (wakM <= 330) sc.wakeup = 0;
    else if (wakM > 330) sc.wakeup = -5;

    // Chanting (Fixed slots)
    if (chnM <= 540) sc.chanting = 25; 
    else if (chnM <= 570) sc.chanting = 20; 
    else if (chnM <= 660) sc.chanting = 15; 
    else if (chnM <= 870) sc.chanting = 10; 
    else if (chnM <= 1020) sc.chanting = 5; 
    else if (chnM <= 1140) sc.chanting = 0;
    else if (chnM > 1140) sc.chanting = -5;

    // Reading & Hearing Patterns
    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25;
        if (m >= threshold - 10) return 20;
        if (m >= 20) return 15;
        if (m >= 15) return 10;
        if (m >= 10) return 5;
        if (m >= 5) return 0;
        return -5;
    };

    const thresh = (userlevel === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, thresh);
    sc.hearing = getActScore(data.hearingMinutes, thresh);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    // Level Specific Service & Notes
    if (userlevel === "Senior Batch") {
        // Service (Max 10)
        const s = data.serviceMinutes;
        if (s >= 15) sc.service = 10; else if (s >= 10) sc.service = 5; else if (s >= 5) sc.service = 0; else sc.service = -5;
        // Notes (Max 15)
        const n = data.notesMinutes;
        if (n >= 20) sc.notes = 15; else if (n >= 15) sc.notes = 10; else if (n >= 10) sc.notes = 5; else if (n >= 5) sc.notes = 0; else sc.notes = -5;
        total += (sc.service + sc.notes);
    } else {
        // Coordinator Service (Max 25)
        sc.service = getActScore(data.serviceMinutes, 30);
        total += sc.service;
    }

    return { total, percent: Math.round((total / 160) * 100) };
}

// --- 4. NAVIGATION & AUTH ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = `${userProfile.name} | ${userProfile.level}`;
            if (userProfile.role === 'admin') {
                const adminBtn = document.getElementById('admin-tab-btn');
                if(adminBtn) adminBtn.classList.remove('hidden');
            }
            if (userProfile.level === "Senior Batch") {
                const notesField = document.getElementById('notes-revision-field');
                if(notesField) notesField.classList.remove('hidden');
            }
            showSection('dashboard');
            setupDateSelect();
            window.switchTab('form');
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

window.switchTab = (tabName) => {
    // 1. Hide tabs
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    
    // 2. Remove active class from buttons safely
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // 3. Show target tab
    const target = document.getElementById(tabName + '-tab');
    if (target) target.classList.remove('hidden');
    
    // 4. Highlight button SAFELY (Fixed the Null error here)
    const btn = document.querySelector(`button[onclick*="switchTab('${tabName}')"]`) || 
                document.querySelector(`button[onclick*='switchTab("${tabName}")']`);
    if (btn) btn.classList.add('active');

    // 5. Load Data
    if (tabName === 'reports') loadMyReports();
    if (tabName === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id + '-section');
    if (target) target.classList.remove('hidden');
}

// --- 5. DATA LOADING ---
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    if (!container) return;
    container.innerHTML = "Fetching...";
    
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    if (snap.empty) { container.innerHTML = "No data."; return; }

    let html = "";
    snap.forEach(doc => {
        const d = doc.data();
        html += `<div class="card" style="margin-bottom:10px; padding:10px; border:1px solid #ddd; border-radius:8px;">
                    <b>Date: ${formatToDDMM(doc.id)}</b><br>
                    Score: ${d.totalScore} | Percent: ${d.dayPercent}%
                 </div>`;
    });
    container.innerHTML = html;
}

async function loadAdminPanel() {
    const body = document.getElementById('admin-table-body');
    if (!body) return;
    
    body.innerHTML = "<tr><td colspan='4'>Loading...</td></tr>";
    try {
        const users = await db.collection('users').get();
        const today = new Date().toISOString().split('T')[0];
        let rows = "";
        for (const uDoc of users.docs) {
            const u = uDoc.data();
            const sDoc = await db.collection('users').doc(uDoc.id).collection('sadhana').doc(today).get();
            const score = sDoc.exists ? sDoc.data().dayPercent + '%' : '---';
            rows += `<tr><td>${u.name}</td><td>${u.level}</td><td>${score}</td><td>${sDoc.exists ? '✅' : '⏳'}</td></tr>`;
        }
        body.innerHTML = rows;
    } catch (e) { body.innerHTML = "<tr><td colspan='4'>Error: Rules or Connection.</td></tr>"; }
}

function setupDateSelect() {
    const sel = document.getElementById('sadhana-date');
    if(!sel) return;
    sel.innerHTML = "";
    [0, 1].forEach(i => {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        sel.innerHTML += `<option value="${iso}">${formatToDDMM(iso)}</option>`;
    });
}

// --- 6. ACTIONS ---
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
    };
    const res = calculateFinalScore(data, userProfile.level);
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
        ...data, totalScore: res.total, dayPercent: res.percent, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Saved!");
    window.switchTab('reports');
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e => alert(e.message));
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

window.openProfileEdit = () => showSection('profile');
document.getElementById('logout-btn').onclick = () => auth.signOut();
