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

// --- 2. TIME HELPERS ---
const t2m = (t) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (h >= 0 && h <= 4) h += 24; 
    return h * 60 + m;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const fmt = (date) => {
        const day = String(date.getDate()).padStart(2, '0');
        const month = date.toLocaleString('en-GB', { month: 'short' });
        return `${day} ${month}`;
    };
    return { sunStr: sun.toISOString().split('T')[0], label: `${fmt(sun)} to ${fmt(sat)}_${sun.getFullYear()}` };
}

function getNRData(date) {
    return {
        id: date, totalScore: -30, dayPercent: -27,
        sleepTime: "NR", wakeupTime: "NR", chantingTime: "NR",
        readingMinutes: 0, hearingMinutes: 0, serviceMinutes: 0, daySleepMinutes: 0,
        scores: { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, daySleep: 0 }
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

    const thresh = (level === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, thresh);
    sc.hearing = getActScore(data.hearingMinutes, thresh);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    // Level Specific Service & Notes
    if (level === "Senior Batch") {
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
    
// --- 4. AUTH & PROFILE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.level}`;
            document.getElementById('notes-revision-field').classList.toggle('hidden', userProfile.level !== "Senior Batch");
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard');
            setupDateSelect();
            loadMyReports(); // Load history on login
        } else showSection('profile');
    } else showSection('auth');
});

// --- 5. REPORT LOADING (Fixes "Missing" Reports) ---
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').orderBy('timestamp', 'desc').limit(7).get();
    
    if (snap.empty) { container.innerHTML = "<p>No entries yet.</p>"; return; }
    
    let html = `<h3>Recent Activity</h3><table style="width:100%"><tr><th>Date</th><th>Score</th><th>%</th></tr>`;
    snap.forEach(doc => {
        const d = doc.data();
        html += `<tr><td>${doc.id}</td><td>${d.totalScore}</td><td>${d.dayPercent}%</td></tr>`;
    });
    container.innerHTML = html + "</table>";
}

// Admin Loader (Simplified View)
async function loadAdminPanel() {
    const tableBody = document.getElementById('admin-table-body');
    const tableHeader = document.getElementById('admin-table-header');
    tableHeader.innerHTML = "<th>Name</th><th>Level</th><th>Today %</th>";
    tableBody.innerHTML = "Loading...";

    const usersSnap = await db.collection('users').get();
    let bodyHtml = "";
    const today = new Date().toISOString().split('T')[0];

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sDoc = await uDoc.ref.collection('sadhana').doc(today).get();
        const score = sDoc.exists ? sDoc.data().dayPercent + "%" : "No Entry";
        bodyHtml += `<tr><td>${u.name}</td><td>${u.level}</td><td>${score}</td></tr>`;
    }
    tableBody.innerHTML = bodyHtml;
}

// --- 6. CORE ACTIONS ---
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    event.currentTarget.classList.add('active');
    if (t === 'admin') loadAdminPanel();
    if (t === 'reports') loadMyReports();
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
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };
    const { total, percent } = calculateFinalScore(data, userProfile.level);
    const dateId = document.getElementById('sadhana-date').value;
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
        ...data, totalScore: total, dayPercent: percent
    });
    alert("Success!"); loadMyReports();
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        level: document.getElementById('profile-level').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: userProfile?.role || 'user'
    };
    await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
    location.reload();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.openProfileEdit = () => {
    document.getElementById('profile-name').value = userProfile.name;
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
};

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
        .catch(err => {
            if(err.code === 'auth/user-not-found') auth.createUserWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value);
            else alert(err.message);
        });
};
document.getElementById('logout-btn').onclick = () => auth.signOut();
