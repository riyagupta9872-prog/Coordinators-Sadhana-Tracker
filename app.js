// --- 1. CONFIG & INIT ---
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
const formatToDDMM = (iso) => iso ? iso.split('-').reverse().join('/') : "";

// --- 3. SCORING ENGINE (Using 'level' from Firebase) ---
function calculateFinalScore(data, userLevel) {
    const slpM = t2m(data.sleepTime), wakM = t2m(data.wakeupTime), chnM = t2m(data.chantingTime);
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    if (slpM <= 1350) sc.sleep = 25; else if (slpM <= 1355) sc.sleep = 20; else if (slpM <= 1360) sc.sleep = 15; else if (slpM <= 1365) sc.sleep = 10; else if (slpM <= 1370) sc.sleep = 5; else if (slpM <= 1375) sc.sleep = 0;
    if (wakM <= 305) sc.wakeup = 25; else if (wakM <= 310) sc.wakeup = 20; else if (wakM <= 315) sc.wakeup = 15; else if (wakM <= 320) sc.wakeup = 10; else if (wakM <= 325) sc.wakeup = 5; else if (wakM <= 330) sc.wakeup = 0;
    if (chnM <= 540) sc.chanting = 25; else if (chnM <= 570) sc.chanting = 20; else if (chnM <= 660) sc.chanting = 15; else if (chnM <= 870) sc.chanting = 10; else if (chnM <= 1020) sc.chanting = 5; else if (chnM <= 1140) sc.chanting = 0;

    const getActScore = (m, thresh) => (m >= thresh ? 25 : m >= 25 ? 20 : m >= 20 ? 15 : m >= 15 ? 10 : m >= 10 ? 5 : m >= 5 ? 0 : -5);
    const baseT = (userLevel === "Senior Batch") ? 40 : 30;
    
    sc.reading = getActScore(data.readingMinutes, baseT);
    sc.hearing = getActScore(data.hearingMinutes, baseT);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    if (userLevel === "Senior Batch") {
        sc.service = (data.serviceMinutes >= 15 ? 10 : data.serviceMinutes >= 10 ? 5 : 0);
        sc.notes = (data.notesMinutes >= 20 ? 15 : data.notesMinutes >= 10 ? 5 : 0);
        total += (sc.service + sc.notes);
    } else {
        sc.service = getActScore(data.serviceMinutes, 30);
        total += sc.service;
    }
    return { total, percent: Math.round((total / 160) * 100) };
}

// --- 4. CORE AUTH & REDIRECT ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists && doc.data().level) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.name;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn')?.classList.remove('hidden');
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field')?.classList.remove('hidden');
            showSection('dashboard');
            setupDateSelect();
            window.switchTab('form');
        } else {
            showSection('profile'); // Level missing hai toh profile setup pe bhejo
        }
    } else {
        showSection('auth');
    }
});

// --- 5. PROFILE EDIT & SAVE (FIXED) ---
window.openProfileEdit = () => {
    // Edit kholte waqt purana data bhar do (Pre-fill)
    if (userProfile) {
        document.getElementById('profile-name').value = userProfile.name || "";
        document.getElementById('profile-level').value = userProfile.level || "";
    }
    showSection('profile');
    document.getElementById('profile-cancel-btn')?.classList.remove('hidden'); // Cancel dikhao
};

window.cancelProfileEdit = () => {
    if (userProfile && userProfile.level) {
        showSection('dashboard'); // Agar pehle se profile hai toh wapis jao
    } else {
        alert("Please complete profile first.");
    }
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const nameVal = document.getElementById('profile-name').value;
    const levelVal = document.getElementById('profile-level').value;

    await db.collection('users').doc(currentUser.uid).set({
        name: nameVal,
        level: levelVal,
        role: userProfile?.role || 'user'
    }, { merge: true });

    alert("Profile Saved!");
    location.reload(); // Hard refresh taaki naya level apply ho jaye
};

// --- 6. NAVIGATION ---
window.switchTab = (id) => {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
    document.getElementById(id + '-tab')?.classList.remove('hidden');
    if (id === 'reports') loadMyReports();
    if (id === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section')?.classList.remove('hidden');
}

// --- 7. DATABASE FETCH (Using 'level') ---
async function loadMyReports() {
    const box = document.getElementById('weekly-reports-container');
    if(!box) return;
    box.innerHTML = "Fetching...";
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    let html = "";
    snap.forEach(doc => {
        const d = doc.data();
        html += `<div class="card" style="margin-bottom:10px; padding:10px;"><b>${formatToDDMM(doc.id)}</b>: ${d.dayPercent}% (${d.totalScore}/160)</div>`;
    });
    box.innerHTML = html || "No data.";
}

async function loadAdminPanel() {
    const body = document.getElementById('admin-table-body');
    if(!body) return;
    const users = await db.collection('users').get();
    const today = new Date().toISOString().split('T')[0];
    let rows = "";
    for (const uDoc of users.docs) {
        const u = uDoc.data();
        const sDoc = await db.collection('users').doc(uDoc.id).collection('sadhana').doc(today).get();
        // ADMIN PICKING 'level' CATEGORY
        rows += `<tr><td>${u.name}</td><td>${u.level || '---'}</td><td>${sDoc.exists ? sDoc.data().dayPercent + '%' : '---'}</td><td>${sDoc.exists ? '✅' : '⏳'}</td></tr>`;
    }
    body.innerHTML = rows;
}

// --- 8. EVENTS ---
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
    // DATA PICKED FROM 'userProfile.level'
    const res = calculateFinalScore(data, userProfile.level);
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
        ...data, totalScore: res.total, dayPercent: res.percent
    });
    alert("Submitted!");
    window.switchTab('reports');
};

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

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message));
};

document.getElementById('logout-btn').onclick = () => auth.signOut();
