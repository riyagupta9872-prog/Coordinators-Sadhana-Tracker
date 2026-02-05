// ==========================================
// 1. CORE CONFIGURATION & INITIALIZATION
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
// 2. AUTHENTICATION (LOGIN/REGISTER)
// ==========================================
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;
        try {
            try {
                await auth.signInWithEmailAndPassword(email, password);
            } catch (err) {
                if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                    await auth.createUserWithEmailAndPassword(email, password);
                    alert("Account Sync Successful!");
                } else { throw err; }
            }
        } catch (error) { alert("Auth Error: " + error.message); }
    };
}

// ==========================================
// 3. PROFILE MANAGEMENT (EDIT/SAVE)
// ==========================================
const profileForm = document.getElementById('profile-form');
if (profileForm) {
    profileForm.onsubmit = async (e) => {
        e.preventDefault();
        const profileData = {
            displayName: document.getElementById('display-name').value,
            devoteeId: document.getElementById('devotee-id').value,
            level: document.getElementById('user-level').value,
            chantingCategory: document.getElementById('chanting-category').value,
            exactRounds: document.getElementById('exact-rounds').value,
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        try {
            await db.collection('users').doc(currentUser.uid).set(profileData, { merge: true });
            alert("Profile Updated!");
            location.reload();
        } catch (error) { alert("Save Error: " + error.message); }
    };
}

// ==========================================
// 4. THE MASTER SCORING ENGINE (LOCKED)
// ==========================================
const t2m = (t, isS = false) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isS && h >= 0 && h <= 4) h += 24;
    return h * 60 + m;
};

function calculateFinalScore(data, level) {
    const slpM = t2m(data.sleepTime, true), wakM = t2m(data.wakeupTime, false), chnM = t2m(data.chantingTime, false);
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    if (slpM <= 1350) sc.sleep = 25; else if (slpM <= 1355) sc.sleep = 20; else if (slpM <= 1360) sc.sleep = 15; else if (slpM <= 1365) sc.sleep = 10; else if (slpM <= 1370) sc.sleep = 5; else if (slpM <= 1375) sc.sleep = 0;
    if (wakM <= 305) sc.wakeup = 25; else if (wakM <= 310) sc.wakeup = 20; else if (wakM <= 315) sc.wakeup = 15; else if (wakM <= 320) sc.wakeup = 10; else if (wakM <= 325) sc.wakeup = 5; else if (wakM <= 330) sc.wakeup = 0;
    if (chnM <= 540) sc.chanting = 25; else if (chnM <= 570) sc.chanting = 20; else if (chnM <= 660) sc.chanting = 15; else if (chnM <= 870) sc.chanting = 10; else if (chnM <= 1020) sc.chanting = 5; else if (chnM <= 1140) sc.chanting = 0;

    const getActScore = (m, th) => {
        if (m >= th) return 25; if (m >= 25) return 20; if (m >= 20) return 15; if (m >= 15) return 10; if (m >= 10) return 5; if (m >= 5) return 0; return -5;
    };
    const thr = (level === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, thr);
    sc.hearing = getActScore(data.hearingMinutes, thr);
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    if (level === "Senior Batch") {
        const s = data.serviceMinutes, n = data.notesMinutes;
        sc.service = s >= 15 ? 10 : (s >= 10 ? 5 : (s >= 5 ? 0 : -5));
        sc.notes = n >= 20 ? 15 : (n >= 15 ? 10 : (n >= 10 ? 5 : (n >= 5 ? 0 : -5)));
    } else { sc.service = getActScore(data.serviceMinutes, 30); sc.notes = 0; }

    const total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.service + sc.notes + sc.daySleep;
    return { total, percent: Math.round((total / 160) * 100), sc };
}

// ==========================================
// 5. SADHANA SUBMISSION logic
// ==========================================
const sadhanaForm = document.getElementById('sadhana-form');
if (sadhanaForm) {
    sadhanaForm.onsubmit = async (e) => {
        e.preventDefault();
        const dateId = document.getElementById('sadhana-date').value;
        if(!dateId) { alert("Please select a date"); return; }
        
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
                ...formData, ...res.sc, totalScore: res.total, dayPercent: res.percent
            }, { merge: true });
            alert("Sadhana Saved!");
            switchTab('reports');
        } catch (error) { alert("Error: " + error.message); }
    };
}

// ==========================================
// 6. REPORTS & ADMIN PANEL (SUNDAY-SATURDAY)
// ==========================================
function getWeekRange(dateStr) {
    const d = new Date(dateStr), sun = new Date(d);
    sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return { key: sun.toISOString().split('T')[0], end: sat.toISOString().split('T')[0], label: `${sun.toLocaleDateString()} - ${sat.toLocaleDateString()}` };
}

async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').orderBy(firebase.firestore.FieldPath.documentId(), "desc").get();
    let groups = {};
    snap.forEach(doc => {
        const info = getWeekRange(doc.id);
        if (!groups[info.key]) groups[info.key] = { label: info.label, days: [], total: 0 };
        const d = doc.data();
        groups[info.key].days.push({ id: doc.id, ...d });
        groups[info.key].total += (d.totalScore || 0);
    });
    let html = `<h3>My Weekly Reports (Last 4 Weeks)</h3>`;
    Object.keys(groups).sort().reverse().slice(0, 4).forEach(k => {
        const w = groups[k], pct = Math.round((w.total / 1120) * 100);
        html += `<details class="card" style="margin-bottom:10px;"><summary style="cursor:pointer; padding:5px;"><strong>${w.label}</strong> — ${pct}%</summary>
        <table style="width:100%; font-size:12px; margin-top:10px; border-top:1px solid #eee;">
            ${w.days.map(d => `<tr><td>${d.id}</td><td>${d.totalScore}/160</td><td>${d.dayPercent}%</td></tr>`).join('')}
        </table></details>`;
    });
    container.innerHTML = html || "No records found.";
}

async function loadAdminPanel() {
    const body = document.getElementById('admin-table-body'), head = document.getElementById('admin-table-header');
    head.innerHTML = `<th>Devotee</th><th>Position</th><th>Rounds</th><th>Weekly Avg %</th>`;
    const users = await db.collection('users').get(), week = getWeekRange(new Date());
    let rows = "";
    for (const uDoc of users.docs) {
        const u = uDoc.data();
        const sSnap = await db.collection('users').doc(uDoc.id).collection('sadhana').where(firebase.firestore.FieldPath.documentId(), ">=", week.key).get();
        let weekT = 0; sSnap.forEach(s => { if(s.id <= week.end) weekT += (s.data().totalScore || 0); });
        const avg = Math.round((weekT / 1120) * 100);
        rows += `<tr><td>${u.displayName}</td><td>${u.level}</td><td>${u.exactRounds}</td><td>${avg}%</td></tr>`;
    }
    body.innerHTML = rows;
}

// ==========================================
// 7. APP STATE & NAVIGATION
// ==========================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            userProfile.isAdmin = userProfile.devoteeId === "Admin01";
            document.getElementById('user-display-name').innerText = userProfile.displayName;
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field')?.classList.remove('hidden');
            if (userProfile.isAdmin) document.getElementById('admin-tab-btn')?.classList.remove('hidden');
            showSection('dashboard-section');
            switchTab('sadhana');
        } else { showSection('profile-section'); document.getElementById('profile-cancel-btn')?.classList.add('hidden'); }
    } else { showSection('auth-section'); }
});

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
window.editProfile = () => { 
    if(userProfile) {
        document.getElementById('display-name').value = userProfile.displayName || "";
        document.getElementById('devotee-id').value = userProfile.devoteeId || "";
        document.getElementById('user-level').value = userProfile.level || "Others";
        document.getElementById('chanting-category').value = userProfile.chantingCategory || "0-4 Rounds";
        document.getElementById('exact-rounds').value = userProfile.exactRounds || "0";
    }
    showSection('profile-section'); 
    document.getElementById('profile-cancel-btn')?.classList.remove('hidden');
};
