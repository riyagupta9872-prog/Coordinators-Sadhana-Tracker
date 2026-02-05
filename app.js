// ==========================================
// 1. CONFIG & INIT
// ==========================================
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

// ==========================================
// 2. IDENTITY & STATE
// ==========================================
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            userProfile.isAdmin = (userProfile.devoteeId === "Admin01");

            document.getElementById('user-display-name').innerText = userProfile.displayName;
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field')?.classList.remove('hidden');
            if (userProfile.isAdmin) document.getElementById('admin-tab-btn')?.classList.remove('hidden');

            populateDateDropdown();
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

// LOGIN / REGISTER
document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            await auth.createUserWithEmailAndPassword(email, password);
            alert("Account Created! Please set up your profile.");
        } else { alert(err.message); }
    }
};

// ==========================================
// 3. PROFILE MANAGEMENT (IDs Matched)
// ==========================================
window.openProfileEdit = () => {
    if(userProfile) {
        document.getElementById('displayName').value = userProfile.displayName || "";
        document.getElementById('devoteeId').value = userProfile.devoteeId || "";
        document.getElementById('level').value = userProfile.level || "Others";
        document.getElementById('chantingCategory').value = userProfile.chantingCategory || "";
        document.getElementById('exactRounds').value = userProfile.exactRounds || "0";
    }
    showSection('profile-section');
    document.getElementById('profile-cancel-btn')?.classList.remove('hidden');
};

window.cancelProfileEdit = () => showSection('dashboard-section');

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        displayName: document.getElementById('displayName').value,
        devoteeId: document.getElementById('devoteeId').value,
        level: document.getElementById('level').value,
        chantingCategory: document.getElementById('chantingCategory').value,
        exactRounds: document.getElementById('exactRounds').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(currentUser.uid).set(data, {merge: true});
    alert("Profile Saved!");
    location.reload();
};

// ==========================================
// 4. SCORING ENGINE (The 160 Points Logic)
// ==========================================
const t2m = (t, isS = false) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isS && h >= 0 && h <= 4) h += 24;
    return h * 60 + m;
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const dateId = document.getElementById('sadhana-date').value;
    
    const d = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value) || 0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0
    };

    // Calculate Scores
    const slpM = t2m(d.sleepTime, true), wakM = t2m(d.wakeupTime, false), chnM = t2m(d.chantingTime, false);
    let s = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    if (slpM <= 1350) s.sleep = 25; else if (slpM <= 1375) s.sleep = Math.max(0, 25 - (slpM - 1350));
    if (wakM <= 305) s.wakeup = 25; else if (wakM <= 330) s.wakeup = Math.max(0, 25 - (wakM - 305));
    if (chnM <= 540) s.chanting = 25; else if (chnM <= 1140) s.chanting = Math.max(0, 25 - Math.floor((chnM - 540)/30)*5);

    const thr = (userProfile.level === "Senior Batch") ? 40 : 30;
    const getActSc = (m, t) => m >= t ? 25 : (m >= 5 ? Math.max(0, Math.floor(m/5)*5) : -5);
    
    s.reading = getActSc(d.readingMinutes, thr);
    s.hearing = getActSc(d.hearingMinutes, thr);
    s.daySleep = d.daySleepMinutes <= 60 ? 10 : -5;
    
    if (userProfile.level === "Senior Batch") {
        s.service = d.serviceMinutes >= 15 ? 10 : -5;
        s.notes = d.notesMinutes >= 20 ? 15 : -5;
    } else { s.service = getActSc(d.serviceMinutes, 30); }

    const total = Object.values(s).reduce((a, b) => a + b, 0);
    
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
        ...d, totalScore: total, dayPercent: Math.round((total/160)*100)
    }, {merge: true});
    
    alert("Sadhana Submitted!");
    switchTab('reports');
};

// ==========================================
// 5. UTILS & NAVIGATION
// ==========================================
function populateDateDropdown() {
    const sel = document.getElementById('sadhana-date');
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    
    const dates = [today.toISOString().split('T')[0], yesterday.toISOString().split('T')[0]];
    sel.innerHTML = dates.map(d => `<option value="${d}">${d}</option>`).join('');
}

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

window.logout = () => auth.signOut().then(() => location.reload());

// Reports logic (Collapsible Weeks)
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').orderBy(firebase.firestore.FieldPath.documentId(), "desc").get();
    let html = `<h3>My History</h3>`;
    snap.forEach(doc => {
        const d = doc.data();
        html += `<div class="card" style="margin-bottom:10px; padding:10px;">${doc.id}: <b>${d.totalScore}/160</b> (${d.dayPercent}%)</div>`;
    });
    container.innerHTML = html;
}

// Admin Logic
async function loadAdminPanel() {
    const tableHeader = document.getElementById('admin-table-header');
    const tableBody = document.getElementById('admin-table-body');
    tableHeader.innerHTML = `<th>Name</th><th>Position</th><th>Rounds</th><th>Total Score</th>`;
    
    const users = await db.collection('users').get();
    let rows = "";
    for(const uDoc of users.docs) {
        const u = uDoc.data();
        rows += `<tr><td>${u.displayName}</td><td>${u.level}</td><td>${u.exactRounds}</td><td>-</td></tr>`;
    }
    tableBody.innerHTML = rows;
}
