// --- FIREBASE CONFIG ---
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.firestore();
let currentUser = null, userProfile = null;

// --- STRICT SCORING ENGINE ---
const t2m = (t, isSleep = false) => {
    if (!t || t === "NR") return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24; 
    return h * 60 + m;
};

function calculateSadhana(d, cat) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };
    
    // Sleep & Wakeup
    sc.sleep = (t2m(d.sleep, true) <= 1350) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.sleep, true) - 1350) / 5) * 5));
    sc.wakeup = (t2m(d.wakeup) <= 305) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.wakeup) - 305) / 5) * 5));

    // Chanting Finish (PRD Jan 27)
    const ch = t2m(d.chanting);
    if(ch <= 540) sc.chanting = 25; 
    else if(ch <= 570) sc.chanting = 20; 
    else if(ch <= 660) sc.chanting = 15;
    else if(ch <= 870) sc.chanting = 10; 
    else if(ch <= 1020) sc.chanting = 5; 
    else if(ch <= 1140) sc.chanting = 0; 
    else sc.chanting = -5;

    // Reading & Hearing (Target 30m)
    const getSlab = (v, t, m) => v <= 0 ? -5 : (v >= t ? m : Math.max(-5, m - (Math.ceil((t - v) / 5) * 5)));
    sc.reading = getSlab(d.reading, 30, 25);
    sc.hearing = getSlab(d.hearing, 30, 25);

    // SERVICE LOGIC (Strict Penalty)
    if (cat === "Senior Batch") {
        if (d.service > 15) {
            sc.service = 10 - ((d.service - 15) * 5); // -5 per extra minute
        } else {
            sc.service = getSlab(d.service, 15, 10);
        }
        sc.notes = getSlab(d.notes, 20, 15);
    } else {
        sc.service = getSlab(d.service, 30, 25);
    }

    // DAY SLEEP (Strict Jump)
    if (d.daySleep === 0) sc.daySleep = 10;
    else if (d.daySleep <= 60) sc.daySleep = 5;
    else sc.daySleep = -5; // Sidha -5 if > 60

    const total = Object.values(sc).reduce((a, b) => a + b, 0);
    return { sc, total };
}

// --- CORE HANDLERS ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = `${userProfile.name} (${userProfile.category})`;
            showSection('dashboard'); setupDateSelect();
        } else showSection('profile');
    } else showSection('auth');
});

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        uid: currentUser.uid,
        name: userProfile.name,
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

    const res = calculateSadhana(d, userProfile.category);
    await db.collection('sadhana_logs').doc(`${currentUser.uid}_${d.date}`).set({
        ...d, scores: res.sc, totalScore: res.total,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert(`Sadhana Submitted successfully! Score: ${res.total}`);
    location.reload();
};

// Excel Export function (Requires SheetJS script in HTML)
window.exportToExcel = async () => {
    const snap = await db.collection('sadhana_logs').where('uid', '==', currentUser.uid).get();
    const data = snap.docs.map(doc => ({ Date: doc.data().date, Total: doc.data().totalScore, ...doc.data().scores }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MySadhana");
    XLSX.writeFile(wb, "Sadhana_Report.xlsx");
};

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    const d = new Date(), y = new Date(); y.setDate(d.getDate()-1);
    const f = (dt) => dt.toISOString().split('T')[0];
    s.innerHTML = `<option value="${f(d)}">${f(d)}</option><option value="${f(y)}">${f(y)}</option>`;
}

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}
