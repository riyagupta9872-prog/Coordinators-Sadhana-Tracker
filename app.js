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

// --- 3. SCORING ENGINE (Directly from your Doc) ---
function calculateFinalScore(data, userLevel) {
    const slpM = t2m(data.sleepTime); [cite: 4]
    const wakM = t2m(data.wakeupTime); [cite: 5]
    const chnM = t2m(data.chantingTime); [cite: 6]

    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 }; [cite: 8]

    // Sleep (10:30 PM Target)
    if (slpM <= 1350) sc.sleep = 25; [cite: 11]
    else if (slpM <= 1355) sc.sleep = 20; [cite: 12]
    else if (slpM <= 1360) sc.sleep = 15; [cite: 13]
    else if (slpM <= 1365) sc.sleep = 10; [cite: 14]
    else if (slpM <= 1370) sc.sleep = 5; [cite: 15]
    else if (slpM <= 1375) sc.sleep = 0; [cite: 16]
    else sc.sleep = -5; [cite: 17]

    // Wakeup (5:05 AM Target)
    if (wakM <= 305) sc.wakeup = 25; [cite: 19]
    else if (wakM <= 310) sc.wakeup = 20; [cite: 20]
    else if (wakM <= 315) sc.wakeup = 15; [cite: 21]
    else if (wakM <= 320) sc.wakeup = 10; [cite: 22]
    else if (wakM <= 325) sc.wakeup = 5; [cite: 23]
    else if (wakM <= 330) sc.wakeup = 0; [cite: 24]
    else sc.wakeup = -5; [cite: 25]

    // Chanting
    if (chnM <= 540) sc.chanting = 25; [cite: 27]
    else if (chnM <= 570) sc.chanting = 20; [cite: 28]
    else if (chnM <= 660) sc.chanting = 15; [cite: 29]
    else if (chnM <= 870) sc.chanting = 10; [cite: 30]
    else if (chnM <= 1020) sc.chanting = 5; [cite: 31]
    else if (chnM <= 1140) sc.chanting = 0; [cite: 32]
    else sc.chanting = -5; [cite: 33]

    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25; [cite: 36]
        if (m >= threshold - 10) return 20; [cite: 37]
        if (m >= 20) return 15; [cite: 38]
        if (m >= 15) return 10; [cite: 39]
        if (m >= 10) return 5; [cite: 40]
        if (m >= 5) return 0; [cite: 41]
        return -5; [cite: 42]
    };

    const thresh = (userLevel === "Senior Batch") ? 40 : 30; [cite: 44]
    sc.reading = getActScore(data.readingMinutes, thresh); [cite: 45]
    sc.hearing = getActScore(data.hearingMinutes, thresh); [cite: 46]
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5; [cite: 47]

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep; [cite: 48]

    if (userLevel === "Senior Batch") { [cite: 50]
        const s = data.serviceMinutes; [cite: 52]
        if (s >= 15) sc.service = 10; else if (s >= 10) sc.service = 5; else if (s >= 5) sc.service = 0; else sc.service = -5; [cite: 53-54]
        const n = data.notesMinutes; [cite: 56]
        if (n >= 20) sc.notes = 15; else if (n >= 15) sc.notes = 10; else if (n >= 10) sc.notes = 5; else if (n >= 5) sc.notes = 0; else sc.notes = -5; [cite: 57-58]
        total += (sc.service + sc.notes); [cite: 59]
    } else {
        sc.service = getActScore(data.serviceMinutes, 30); [cite: 62]
        total += sc.service; [cite: 63]
    }
    return { total, percent: Math.round((total / 160) * 100) }; [cite: 65]
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
            loadMyReports();
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

// --- 5. REPORT FETCHING (Collapsible) ---
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    if (!container) return;
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    
    if (snap.empty) {
        container.innerHTML = "<p>No entries found yet.</p>";
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
        html += `
        <details class="card" style="margin-bottom:10px;">
            <summary style="font-weight:bold; cursor:pointer;">Week: ${week.split('_')[0]}</summary>
            <table style="width:100%; border-collapse:collapse; margin-top:10px;">
                <tr><th>Date</th><th>Score</th><th>%</th></tr>
                ${weeklyGroups[week].sort((a,b) => b.id.localeCompare(a.id)).map(e => `
                <tr>
                    <td>${e.id}</td><td>${e.totalScore}</td><td>${e.dayPercent}%</td>
                </tr>`).join('')}
            </table>
        </details>`;
    });
    container.innerHTML = html;
}

// --- 6. CORE ACTIONS ---
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    event.currentTarget.classList.add('active');
    if (t === 'admin') loadAdminPanel();
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
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({ ...data, totalScore: total, dayPercent: percent });
    alert("Success!");
    loadMyReports();
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        level: document.getElementById('profile-level').value,
        role: userProfile?.role || 'user'
    };
    await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
    location.reload();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

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

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
        .catch(err => alert(err.message));
};
document.getElementById('logout-btn').onclick = () => auth.signOut();
