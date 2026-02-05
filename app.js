// ==========================================
// 1. INITIALIZATION & GLOBAL SCOPE
// ==========================================
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

// ==========================================
// 2. AUTHENTICATION & PROFILE LOGIC
// ==========================================

// Login/Register Handler
document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        try {
            await auth.signInWithEmailAndPassword(email, password);
        } catch (err) {
            if (err.code === 'auth/user-not-found') {
                await auth.createUserWithEmailAndPassword(email, password);
                alert("Account Created!");
            } else { throw err; }
        }
    } catch (error) { alert("Error: " + error.message); }
};

// State Observer
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            const data = doc.data();
            userProfile = {
                displayName: data.displayName || "Devotee",
                level: (data.level || "").trim(),
                chantingCategory: data.chantingCategory || "",
                exactRounds: data.exactRounds || "",
                isAdmin: data.devoteeId === "Admin01"
            };
            document.getElementById('user-display-name').innerText = userProfile.displayName;
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field')?.classList.remove('hidden');
            if (userProfile.isAdmin) document.getElementById('admin-tab-btn')?.classList.remove('hidden');
            showSection('dashboard-section');
            switchTab('sadhana');
        } else {
            showSection('profile-section');
            document.getElementById('profile-cancel-btn')?.classList.add('hidden');
        }
    } else {
        showSection('auth-section');
    }
});

// Profile Save Logic
document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const profileData = {
        displayName: document.getElementById('display-name').value,
        devoteeId: document.getElementById('devotee-id').value,
        level: document.getElementById('user-level').value,
        chantingCategory: document.getElementById('chanting-category').value,
        exactRounds: document.getElementById('exact-rounds').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    try {
        await db.collection('users').doc(currentUser.uid).set(profileData, { merge: true });
        alert("Profile Saved!");
        location.reload();
    } catch (error) { alert("Error: " + error.message); }
};

// ==========================================
// 3. SCORING ENGINE
// ==========================================
const t2m = (timeStr, isSleepTime = false) => {
    if (!timeStr) return 9999; 
    let [hrs, mins] = timeStr.split(':').map(Number);
    if (isSleepTime && hrs >= 0 && hrs <= 4) hrs += 24; 
    return (hrs * 60) + mins;
};

function calculateFinalScore(data, userLevel) {
    const slpM = t2m(data.sleepTime, true);
    const wakM = t2m(data.wakeupTime, false);
    const chnM = t2m(data.chantingTime, false);
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    if (slpM <= 1350) sc.sleep = 25; else if (slpM <= 1355) sc.sleep = 20; else if (slpM <= 1360) sc.sleep = 15; else if (slpM <= 1365) sc.sleep = 10; else if (slpM <= 1370) sc.sleep = 5; else if (slpM <= 1375) sc.sleep = 0;
    if (wakM <= 305) sc.wakeup = 25; else if (wakM <= 310) sc.wakeup = 20; else if (wakM <= 315) sc.wakeup = 15; else if (wakM <= 320) sc.wakeup = 10; else if (wakM <= 325) sc.wakeup = 5; else if (wakM <= 330) sc.wakeup = 0;
    if (chnM <= 540) sc.chanting = 25; else if (chnM <= 570) sc.chanting = 20; else if (chnM <= 660) sc.chanting = 15; else if (chnM <= 870) sc.chanting = 10; else if (chnM <= 1020) sc.chanting = 5; else if (chnM <= 1140) sc.chanting = 0;

    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25; if (m >= threshold - 10) return 20; if (m >= 20) return 15; if (m >= 15) return 10; if (m >= 10) return 5; if (m >= 5) return 0; return -5;
    };

    const currentThresh = (userLevel === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, currentThresh);
    sc.hearing = getActScore(data.hearingMinutes, currentThresh);
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
    return { totalScore: total, dayPercent: Math.round((total / 160) * 100), sc };
}

// ==========================================
// 4. SADHANA SUBMISSION
// ==========================================
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const dateId = document.getElementById('sadhana-date').value;
    const formData = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value) || 0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0
    };
    const res = calculateFinalScore(formData, userProfile.level);
    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
            ...formData,
            scSleep: res.sc.sleep, scWakeup: res.sc.wakeup, scChanting: res.sc.chanting,
            scReading: res.sc.reading, scHearing: res.sc.hearing, scService: res.sc.service,
            scNotes: res.sc.notes, scDaySleep: res.sc.daySleep,
            totalScore: res.totalScore, dayPercent: res.dayPercent
        }, { merge: true });
        alert("Sadhana Submitted!");
        switchTab('reports');
    } catch (error) { alert("Error: " + error.message); }
};

// ==========================================
// 5. REPORTS & ADMIN PANEL
// ==========================================
function getWeekRange(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay();
    const sun = new Date(d); sun.setDate(d.getDate() - day);
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const options = { month: 'short', day: 'numeric' };
    return {
        key: sun.toISOString().split('T')[0],
        end: sat.toISOString().split('T')[0],
        label: `Week: ${sun.toLocaleDateString(undefined, options)} - ${sat.toLocaleDateString(undefined, options)}`
    };
}

async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    let groups = {};
    snap.forEach(doc => {
        const info = getWeekRange(doc.id);
        if (!groups[info.key]) groups[info.key] = { label: info.label, days: [], total: 0 };
        const d = doc.data();
        groups[info.key].days.push({ id: doc.id, ...d });
        groups[info.key].total += (d.totalScore || 0);
    });
    const sortedWeeks = Object.keys(groups).sort().reverse().slice(0, 4);
    let html = `<h3>My Reports</h3>`;
    sortedWeeks.forEach(key => {
        const w = groups[key];
        const avg = Math.round((w.total / 1120) * 100);
        html += `<details class="card"><summary><strong>${w.label}</strong> (Avg: ${avg}%)</summary>
        <table style="width:100%; font-size:12px;">
            ${w.days.map(day => `<tr><td>${day.id}</td><td>${day.totalScore}</td><td>${day.dayPercent}%</td></tr>`).join('')}
        </table></details>`;
    });
    container.innerHTML = html;
}

async function loadAdminPanel() {
    const tableBody = document.getElementById('admin-table-body');
    const tableHeader = document.getElementById('admin-table-header');
    tableHeader.innerHTML = `<th>Devotee</th><th>Position</th><th>Chanting</th><th>Weekly Avg %</th>`;
    const usersSnap = await db.collection('users').get();
    const week = getWeekRange(new Date());
    let rows = "";
    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sSnap = await db.collection('users').doc(uDoc.id).collection('sadhana')
            .where(firebase.firestore.FieldPath.documentId(), ">=", week.key).get();
        let weekTotal = 0;
        sSnap.forEach(s => { if(s.id <= week.end) weekTotal += (s.data().totalScore || 0); });
        const avg = Math.round((weekTotal / 1120) * 100);
        rows += `<tr><td>${u.displayName}</td><td>${u.level}</td><td>${u.exactRounds}</td><td>${avg}%</td></tr>`;
    }
    tableBody.innerHTML = rows;
}

// ==========================================
// UTILITIES
// ==========================================
window.switchTab = (id) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${id}')"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(id + '-tab')?.classList.remove('hidden');
    if (id === 'reports') loadMyReports();
    if (id === 'admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

window.logout = () => { auth.signOut().then(() => location.reload()); };
