// --- FIREBASE CONFIG (SAME) ---
const firebaseConfig = { ... }; 
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();
let currentUser = null, userProfile = null;

// --- HELPERS ---
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

// --- SCORING ENGINE ---
function calculateSadhana(d, cat) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };

    // 1. Sleep (10:30 PM = 1350m)
    const slp = t2m(d.sleep, true);
    sc.sleep = (slp <= 1350) ? 25 : Math.max(-5, 25 - (Math.ceil((slp - 1350) / 5) * 5));

    // 2. Wakeup (5:05 AM = 305m)
    const wak = t2m(d.wakeup);
    sc.wakeup = (wak <= 305) ? 25 : Math.max(-5, 25 - (Math.ceil((wak - 305) / 5) * 5));

    // 3. Chanting Finish Buckets
    const ch = t2m(d.chanting);
    if(ch <= 540) sc.chanting = 25; 
    else if(ch <= 570) sc.chanting = 20; 
    else if(ch <= 660) sc.chanting = 15;
    else if(ch <= 870) sc.chanting = 10; 
    else if(ch <= 1020) sc.chanting = 5; 
    else if(ch <= 1140) sc.chanting = 0; 
    else sc.chanting = -5;

    // 4. Reading & Hearing (Target 30m for ALL)
    sc.reading = getSlabScore(d.reading, 30, 25);
    sc.hearing = getSlabScore(d.hearing, 30, 25);

    // 5. Position Specifics (Service & Notes)
    if (cat === "Senior Batch") {
        sc.service = getSlabScore(d.service, 15, 10);
        sc.notes = getSlabScore(d.notes, 20, 15);
    } else {
        sc.service = getSlabScore(d.service, 30, 25);
        sc.notes = 0;
    }

    // 6. Day Sleep
    sc.daySleep = (d.daySleep === 0) ? 10 : (d.daySleep <= 60 ? 5 : -5);

    const total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.service + sc.notes + sc.daySleep;
    return { sc, total };
}

// --- FORM SUBMISSION ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
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
    
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(document.getElementById('sadhana-date').value).set({
        ...d,
        scores: result.sc,
        totalScore: result.total,
        dayPercent: Math.round((result.total / 160) * 100),
        category: userProfile.category,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(`Saved! Score: ${result.total} (${Math.round((result.total / 160) * 100)}%)`);
    switchTab('reports');
};

// --- AUTH & PROFILE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.category}`;
            if (userProfile.category === "Senior Batch") document.getElementById('notes-area').classList.remove('hidden');
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard'); switchTab('sadhana'); setupDateSelect();
        } else showSection('profile');
    } else showSection('auth');
});

// Use fixed 1120 for Weekly Calculations in Admin Panel and Master Excel
const weeklyMax = 1120; 
