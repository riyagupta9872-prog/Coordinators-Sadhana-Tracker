// --- 1. FIREBASE & CONFIG ---
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

// --- 2. SCORING ENGINE (PRD STRICT LOGIC) ---
const t2m = (t) => {
    if(!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    return h * 60 + m;
};

const calculateDetailedScore = (data) => {
    let scores = { sleep: 0, wakeup: 0, chanting: 0, study: 0, daySleep: 0 };

    // Sleep (Thresholds: 10:00, 10:15, 10:30, 10:45, 11:00, 11:15, 11:30)
    const sMin = t2m(data.sleepTime);
    const adjustedSleep = (sMin <= 240) ? sMin + 1440 : sMin; // Handle midnight
    if (adjustedSleep <= 1320) scores.sleep = 25; // 10:00 PM
    else if (adjustedSleep <= 1335) scores.sleep = 20; // 10:15
    else if (adjustedSleep <= 1350) scores.sleep = 15; // 10:30
    else if (adjustedSleep <= 1365) scores.sleep = 10; // 10:45
    else if (adjustedSleep <= 1380) scores.sleep = 5;  // 11:00
    else if (adjustedSleep <= 1395) scores.sleep = 0;  // 11:15
    else scores.sleep = -5;

    // Wakeup (Thresholds: 5:05, 5:10, 5:15, 5:20, 5:25, 5:30, 5:35)
    const wMin = t2m(data.wakeupTime);
    if (wMin <= 305) scores.wakeup = 25;
    else if (wMin <= 310) scores.wakeup = 20;
    else if (wMin <= 315) scores.wakeup = 15;
    else if (wMin <= 320) scores.wakeup = 10;
    else if (wMin <= 325) scores.wakeup = 5;
    else if (wMin <= 330) scores.wakeup = 0;
    else scores.wakeup = -5;

    // Chanting (Thresholds: 9:00, 9:30, 11:00, 2:30, 5:00, 7:00, 9:00)
    const cMin = t2m(data.chantingTime);
    if (cMin <= 540) scores.chanting = 25;
    else if (cMin <= 570) scores.chanting = 20;
    else if (cMin <= 660) scores.chanting = 15;
    else if (cMin <= 870) scores.chanting = 10;
    else if (cMin <= 1020) scores.chanting = 5;
    else if (cMin <= 1140) scores.chanting = 0;
    else scores.chanting = -5;

    // Pathan & Shravan (Best of either, Max 25)
    const maxStudyMins = Math.max(data.readingMinutes, data.hearingMinutes);
    if (maxStudyMins >= 30) scores.study = 25;
    else if (maxStudyMins >= 25) scores.study = 20;
    else if (maxStudyMins >= 20) scores.study = 15;
    else if (maxStudyMins >= 15) scores.study = 10;
    else if (maxStudyMins >= 10) scores.study = 5;
    else if (maxStudyMins >= 5) scores.study = 0;
    else scores.study = -5;

    // Day Sleep (Max 10 Marks if <= 60 mins)
    scores.daySleep = (data.daySleepMinutes <= 60) ? 10 : 0;

    const total = scores.sleep + scores.wakeup + scores.chanting + scores.study + scores.daySleep;
    return { total, scores };
};

// --- 3. UI LOGIC ---
function toggleSpecialFields() {
    const level = document.getElementById('profile-level').value;
    const box = document.getElementById('senior-activity-box');
    if (userProfile?.serviceLevel === "Senior Batch" || level === "Senior Batch") {
        box.classList.remove('hidden');
    } else {
        box.classList.add('hidden');
    }
}

function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick="switchTab('${t}')"]`);
    if(btn) btn.classList.add('active');
    if(t === 'reports') loadUserReports();
}

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

// --- 4. CORE AUTH & SUBMISSION ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.serviceLevel}`;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard');
            setupDateSelect();
            toggleSpecialFields();
        } else showSection('profile');
    } else showSection('auth');
});

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('day-sleep-minutes').value) || 0,
        notesRevision: parseInt(document.getElementById('notes-revision').value) || 0
    };

    const result = calculateDetailedScore(data);
    const date = document.getElementById('sadhana-date').value;

    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set({
        ...data,
        totalScore: result.total,
        breakdown: result.scores,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert(`Sadhana Submitted! Score: ${result.total}/110`);
    switchTab('reports');
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const pData = {
        name: document.getElementById('profile-name').value,
        chantingCategory: document.getElementById('profile-category').value,
        serviceLevel: document.getElementById('profile-level').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: 'user'
    };
    await db.collection('users').doc(currentUser.uid).set(pData);
    location.reload();
};

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    s.innerHTML = '';
    for (let i = 0; i < 2; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const iso = d.toISOString().split('T')[0];
        const opt = document.createElement('option'); opt.value = iso; opt.textContent = iso;
        s.appendChild(opt);
    }
}

// Auth Forms
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(a => alert(a.message));
};
document.getElementById('logout-btn').onclick = () => auth.signOut();
