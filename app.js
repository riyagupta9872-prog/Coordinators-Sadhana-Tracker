// --- 1. FIREBASE SETUP (Your Provided Config) ---
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

// --- 2. CORE HELPERS ---
const t2m = (t, isSleep = false) => {
    if (!t || t === "NR") return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24; 
    return h * 60 + m;
};

// Strict Penalty Logic: 5 mins gap = -5 marks. 0 mins = -5 marks.
const getSlabScore = (val, target, max) => {
    if (val <= 0) return -5;
    if (val >= target) return max;
    let penalty = Math.ceil((target - val) / 5) * 5;
    return Math.max(-5, max - penalty);
};

// --- 3. POSITION-BASED SCORING ENGINE ---
function calculateSadhana(d, cat) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };

    // Sleep (10:30 PM = 1350m)
    const slp = t2m(d.sleep, true);
    sc.sleep = (slp <= 1350) ? 25 : Math.max(-5, 25 - (Math.ceil((slp - 1350) / 5) * 5));

    // Wakeup (5:05 AM = 305m)
    const wak = t2m(d.wakeup);
    sc.wakeup = (wak <= 305) ? 25 : Math.max(-5, 25 - (Math.ceil((wak - 305) / 5) * 5));

    // Chanting Finish (Buckets as per PRD)
    const ch = t2m(d.chanting);
    if(ch <= 540) sc.chanting = 25;       // 9:00 AM
    else if(ch <= 570) sc.chanting = 20;  // 9:30 AM
    else if(ch <= 660) sc.chanting = 15;  // 11:00 AM
    else if(ch <= 870) sc.chanting = 10;  // 2:30 PM
    else if(ch <= 1020) sc.chanting = 5;  // 5:00 PM
    else if(ch <= 1140) sc.chanting = 0;  // 7:00 PM
    else sc.chanting = -5;

    // Reading & Hearing (Target 30m for ALL)
    sc.reading = getSlabScore(d.reading, 30, 25);
    sc.hearing = getSlabScore(d.hearing, 30, 25);

    // Position Specific Logic
    if (cat === "Senior Batch") {
        sc.service = getSlabScore(d.service, 15, 10); // Senior Target 15m
        sc.notes = getSlabScore(d.notes, 20, 15);      // Senior Target 20m
    } else {
        sc.service = getSlabScore(d.service, 30, 25); // Others Target 30m
        sc.notes = 0;
    }

    // Day Sleep
    sc.daySleep = (d.daySleep === 0) ? 10 : (d.daySleep <= 60 ? 5 : -5);

    const total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.service + sc.notes + sc.daySleep;
    return { sc, total };
}

// --- 4. DATA SUBMISSION (Synced with Rules) ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        uid: currentUser.uid,
        date: document.getElementById('sadhana-date').value,
        sleep: document.getElementById('sleep-time').value,
        wakeup: document.getElementById('wakeup-time').value,
        chanting: document.getElementById('chanting-time').value,
        reading: parseInt(document.getElementById('reading-mins').value) || 0,
        hearing: parseInt(document.getElementById('hearing-mins').value) || 0,
        service: parseInt(document.getElementById('service-mins').value) || 0,
        notes: parseInt(document.getElementById('notes-mins')?.value) || 0,
        daySleep: parseInt(document.getElementById('day-sleep-minutes').value) || 0
    };

    const result = calculateSadhana(d, userProfile.category);
    
    // Note: match/sadhana_logs rules ke hisaab se collection name change kiya
    await db.collection('sadhana_logs').doc(`${currentUser.uid}_${d.date}`).set({
        ...d,
        scores: result.sc,
        totalScore: result.total,
        dayPercent: Math.round((result.total / 160) * 100),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert("Jai Ho! Score: " + result.total);
    location.reload();
};

// --- 5. AUTH & UI HANDLERS ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = `${userProfile.name} [${userProfile.category}]`;
            if (userProfile.category === "Senior Batch") document.getElementById('notes-area').classList.remove('hidden');
            showSection('dashboard');
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

// Profile Save Logic
document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const profileData = {
        name: document.getElementById('profile-name').value,
        category: document.getElementById('profile-category').value,
        level: document.getElementById('profile-level').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        isAdmin: false
    };
    await db.collection('users').doc(currentUser.uid).set(profileData);
    location.reload();
};

// Toggle Sections
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

// Tab Switching
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if(btn) btn.classList.add('active');
};
