// --- 1. FIREBASE CONFIG ---
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

// --- 2. SCORING ENGINE ---
const t2m = (t, isS = false) => {
    if (!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isS && h <= 3) h += 24; 
    return h * 60 + m;
};

function calculateSadhana(d, cat) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };

    // Sleep (10:30 PM = 1350m) & Wakeup (5:05 AM = 305m)
    sc.sleep = (t2m(d.sleep, true) <= 1350) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.sleep, true) - 1350) / 5) * 5));
    sc.wakeup = (t2m(d.wakeup) <= 305) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.wakeup) - 305) / 5) * 5));

    // Chanting (Jan 27 Rule)
    const ch = t2m(d.chanting);
    if(ch <= 540) sc.chanting = 25; 
    else if(ch <= 570) sc.chanting = 20; 
    else if(ch <= 660) sc.chanting = 15;
    else if(ch <= 870) sc.chanting = 10; 
    else if(ch <= 1020) sc.chanting = 5; 
    else if(ch <= 1140) sc.chanting = 0; 
    else sc.chanting = -5;

    const slab = (v, t, m) => v <= 0 ? -5 : (v >= t ? m : Math.max(-5, m - (Math.ceil((t - v) / 5) * 5)));

    sc.reading = slab(d.reading, 30, 25);
    sc.hearing = slab(d.hearing, 30, 25);

    // SERVICE & NOTES (Senior Batch Specific)
    if (cat === "Senior Batch") {
        // Strict Penalty: -5 marks for every 1 minute OVER 15 mins
        if (d.service > 15) {
            sc.service = 10 - ((d.service - 15) * 5); 
        } else {
            sc.service = slab(d.service, 15, 10);
        }
        sc.notes = slab(d.notes, 20, 15);
    } else {
        sc.service = slab(d.service, 30, 25);
    }

    // DAY SLEEP (Strict Jump Logic)
    if (d.daySleep === 0) sc.daySleep = 10;
    else if (d.daySleep <= 60) sc.daySleep = 5;
    else sc.daySleep = -5;

    const total = Object.values(sc).reduce((a, b) => a + b, 0);
    return { sc, total };
}

// --- 3. AUTH & CORE FLOW ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.name + " (" + userProfile.category + ")";
            if(userProfile.category === "Senior Batch") document.getElementById('notes-area')?.classList.remove('hidden');
            showSection('dashboard'); setupDates();
        } else showSection('profile');
    } else showSection('auth');
});

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value)
        .catch(err => alert(err.message));
};

document.getElementById('logout-btn').onclick = () => auth.signOut().then(() => location.reload());

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        category: document.getElementById('profile-category').value,
        level: document.getElementById('profile-level').value,
        exactRounds: document.getElementById('profile-exact-rounds').value
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    location.reload();
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        date: document.getElementById('sadhana-date').value,
        sleep: document.getElementById('sleep-time').value,
        wakeup: document.getElementById('wakeup-time').value,
        chanting: document.getElementById('chanting-time').value,
        reading: parseInt(document.getElementById('reading-mins').value || 0),
        hearing: parseInt(document.getElementById('hearing-mins').value || 0),
        service: parseInt(document.getElementById('service-mins').value || 0),
        notes: parseInt(document.getElementById('notes-mins')?.value || 0),
        daySleep: parseInt(document.getElementById('day-sleep-minutes').value || 0)
    };
    const res = calculateSadhana(d, userProfile.category);
    // Matched to Firebase Rules "sadhana_logs"
    await db.collection('sadhana_logs').doc(currentUser.uid + "_" + d.date).set({
        uid: currentUser.uid, ...d, scores: res.sc, totalScore: res.total, dayPercent: Math.round((res.total/160)*100),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Jai Ho! Score: " + res.total);
    location.reload();
};

// --- 4. UI & REPORTS ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if(btn) btn.classList.add('active');
    if(t === 'reports') loadHistory();
};

async function loadHistory() {
    const snap = await db.collection('sadhana_logs').where('uid', '==', currentUser.uid).orderBy('date', 'desc').limit(15).get();
    let h = '<h3>History</h3><button onclick="downloadExcel()" style="margin-bottom:10px; background:green;">Download Excel</button><table class="admin-table"><tr><th>Date</th><th>Score</th><th>%</th></tr>';
    snap.forEach(doc => { 
        const item = doc.data();
        h += `<tr><td>${item.date}</td><td>${item.totalScore}</td><td>${item.dayPercent}%</td></tr>`; 
    });
    document.getElementById('weekly-reports-container').innerHTML = h + '</table>';
}

window.downloadExcel = async () => {
    const snap = await db.collection('sadhana_logs').where('uid', '==', currentUser.uid).get();
    const data = snap.docs.map(doc => ({ Date: doc.data().date, ...doc.data().scores, Total: doc.data().totalScore }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sadhana");
    XLSX.writeFile(wb, "MySadhanaReport.xlsx");
};

function setupDates() {
    const s = document.getElementById('sadhana-date');
    const d = new Date(), y = new Date(); y.setDate(d.getDate()-1);
    const f = (dt) => dt.toISOString().split('T')[0];
    s.innerHTML = `<option value="${f(d)}">${f(d)} (Today)</option><option value="${f(y)}">${f(y)} (Yesterday)</option>`;
}
