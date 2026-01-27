// --- CONFIG ---
const APP_ID = "App1_SeniorYouth_2026";
const firebaseConfig = { /* PASTE NEW PROJECT CONFIG HERE */ };
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();

let currentUser = null, userProfile = null;

// --- SCORE ENGINE ---
const t2m = (t, isSleep = false) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24; 
    return h * 60 + m;
};

function calculateScore(data, position) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };

    // Common Base
    const slp = t2m(data.sleepTime, true);
    if (slp <= 1350) sc.sleep = 25; else if (slp <= 1355) sc.sleep = 20; else if (slp <= 1360) sc.sleep = 15; else if (slp <= 1365) sc.sleep = 10; else if (slp <= 1370) sc.sleep = 5; else if (slp <= 1375) sc.sleep = 0;

    const wak = t2m(data.wakeupTime);
    if (wak <= 305) sc.wakeup = 25; else if (wak <= 310) sc.wakeup = 20; else if (wak <= 315) sc.wakeup = 15; else if (wak <= 320) sc.wakeup = 10; else if (wak <= 325) sc.wakeup = 5; else if (wak <= 330) sc.wakeup = 0;

    const chn = t2m(data.chantingTime);
    if (chn <= 540) sc.chanting = 25; else if (chn <= 570) sc.chanting = 20; else if (chn <= 660) sc.chanting = 15; else if (chn <= 870) sc.chanting = 10; else if (chn <= 1020) sc.chanting = 5; else if (chn <= 1140) sc.chanting = 0;

    sc.daySleep = (data.daySleepMins <= 60) ? 10 : -5;

    // Position Specific logic
    if (position === "Senior Batch") {
        const get25 = (m) => (m >= 30 ? 25 : (m >= 20 ? 15 : (m >= 15 ? 10 : (m >= 10 ? 5 : (m >= 5 ? 0 : -5)))));
        sc.reading = get25(data.readM);
        sc.hearing = get25(data.hearM);
        sc.service = data.servM >= 15 ? 10 : (data.servM >= 10 ? 5 : (data.servM >= 5 ? 0 : -5));
        sc.notes = data.noteM >= 20 ? 15 : (data.noteM >= 15 ? 10 : (data.noteM >= 10 ? 5 : (data.noteM >= 5 ? 0 : -5)));
    } else {
        const get30 = (m) => (m >= 40 ? 30 : (m >= 30 ? 25 : (m >= 20 ? 15 : (m >= 10 ? 5 : -5))));
        sc.reading = get30(data.readM);
        sc.hearing = get30(data.hearM);
        sc.service = data.servM >= 15 ? 15 : (data.servM >= 5 ? 5 : -5);
        sc.notes = 0; // Not applicable for coords
    }

    const total = Object.values(sc).reduce((a, b) => a + b, 0);
    return { total, details: sc };
}

// --- AUTH & UI ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.position}`;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').style.display = 'block';
            if (userProfile.position === 'Senior Batch') document.getElementById('notes-group').classList.remove('hidden');
            setupApp();
        } else showSection('profile');
    } else showSection('auth');
});

// Event Listeners for Login, Profile, etc.
document.getElementById('login-btn').onclick = () => {
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(err => alert(err.message));
};

document.getElementById('save-profile-btn').onclick = async () => {
    const name = document.getElementById('profile-name').value;
    const pos = document.getElementById('profile-position').value;
    if (!name || !pos) return alert("Fill all details");
    await db.collection('users').doc(currentUser.uid).set({
        name, position: pos, role: 'user', app_id: APP_ID
    });
    location.reload();
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const payload = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readM: parseInt(document.getElementById('reading-mins').value) || 0,
        hearM: parseInt(document.getElementById('hearing-mins').value) || 0,
        servM: parseInt(document.getElementById('service-mins').value) || 0,
        noteM: parseInt(document.getElementById('notes-mins')?.value) || 0,
        daySleepMins: parseInt(document.getElementById('day-sleep-mins').value) || 0
    };
    const date = document.getElementById('sadhana-date').value;
    const result = calculateScore(payload, userProfile.position);

    await db.collection('sadhana_logs').doc(`${currentUser.uid}_${date}`).set({
        ...payload, ...result, uid: currentUser.uid, position: userProfile.position, date, app_id: APP_ID
    });
    alert(`Entry Saved! Score: ${result.total}`);
};

function setupApp() {
    showSection('dashboard');
    const s = document.getElementById('sadhana-date');
    for (let i = 0; i < 2; i++) {
        let d = new Date(); d.setDate(d.getDate() - i);
        let iso = d.toISOString().split('T')[0];
        s.innerHTML += `<option value="${iso}">${iso}</option>`;
    }
}

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

// Tab Switching logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll('.tab-btn, .tab-content').forEach(el => el.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab + '-tab').classList.add('active');
    };
});
