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
let currentUser = null, userProfile = null, activeListener = null;

// --- 2. HELPERS ---
const t2m = (t, isSleep = false) => {
    if (!t || t === "NR") return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24; 
    return h * 60 + m;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    return { 
        id: `${sun.toISOString().split('T')[0]}_${sat.toISOString().split('T')[0]}`,
        display: `${sun.toLocaleDateString()} - ${sat.toLocaleDateString()}`
    };
}

// --- 3. SCORING ENGINE (Strictly Same Logic) ---
function calculateSadhana(d, cat) {
    let sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: 0, daySleep: 0 };
    
    sc.sleep = (t2m(d.sleep, true) <= 1350) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.sleep, true) - 1350) / 5) * 5));
    sc.wakeup = (t2m(d.wakeup) <= 305) ? 25 : Math.max(-5, 25 - (Math.ceil((t2m(d.wakeup) - 305) / 5) * 5));

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

    // SERVICE & NOTES (For Senior Batch / Level 1)
    if (userProfile.category === "Senior Batch") {
        sc.service = (d.service > 15) ? (10 - (d.service - 15) * 5) : slab(d.service, 15, 10);
        sc.notes = slab(d.notes, 20, 15);
    } else {
        sc.service = slab(d.service, 30, 25);
    }

    sc.daySleep = (d.daySleep === 0) ? 10 : (d.daySleep <= 60 ? 5 : -5);

    const total = Object.values(sc).reduce((a, b) => a + b, 0);
    return { sc, total };
}

// --- 4. CORE FLOW ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} [${userProfile.category}]`;
            
            // Notes area visibility logic
            const sArea = document.getElementById('senior-area');
            if(userProfile.category === "Senior Batch") sArea.classList.remove('hidden');
            else sArea.classList.add('hidden');

            if (userProfile.isAdmin) {
                document.getElementById('admin-nav-btn').classList.remove('hidden');
                loadAdminDashboard();
            }
            showSection('dashboard');
            setupDateSelect();
        } else showSection('profile');
    } else showSection('auth');
});

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = { 
        name: document.getElementById('profile-name').value, 
        category: document.getElementById('profile-level').value, // Level 1, 2, 3
        chantingCategory: document.getElementById('profile-chanting').value, 
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: userProfile?.role || 'user'
    };
    // Note: Update logic limited by your rules (Category Lock)
    await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
    alert("Profile Saved!"); location.reload();
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        uid: currentUser.uid,
        name: userProfile.name,
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
    const res = calculateSadhana(d);
    await db.collection('sadhana_logs').doc(`${currentUser.uid}_${d.date}`).set({
        ...d, scores: res.sc, totalScore: res.total, dayPercent: Math.round((res.total/160)*100),
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert(`Jai Ho! Score: ${res.total}`); location.reload();
};

// --- RESTORED FUNCTIONS ---
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    document.querySelector(`button[onclick*="switchTab('${t}')"]`).classList.add('active');
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    const d = new Date(), y = new Date(); y.setDate(d.getDate()-1);
    const f = (dt) => dt.toISOString().split('T')[0];
    s.innerHTML = `<option value="${f(d)}">${f(d)} (Today)</option><option value="${f(y)}">${f(y)} (Yesterday)</option>`;
}

async function loadReports(uid, containerId) {
    const snap = await db.collection('sadhana_logs').where('uid', '==', uid).orderBy('date', 'desc').limit(15).get();
    let html = '';
    snap.forEach(doc => {
        const item = doc.data();
        html += `<div class="card" style="margin-top:10px; border-left: 5px solid ${item.totalScore > 100 ? 'var(--success)' : 'var(--danger)'}">
            <div style="display:flex; justify-content:space-between">
                <strong>${item.date}</strong>
                <span>Score: ${item.totalScore} (${item.dayPercent}%)</span>
            </div>
        </div>`;
    });
    document.getElementById(containerId).innerHTML = html || 'No data found.';
}

// RESTORED ADMIN & EXCEL
window.downloadUserExcel = async (uid, name) => {
    const snap = await db.collection('sadhana_logs').where('uid', '==', uid).get();
    const data = snap.docs.map(doc => ({ Date: doc.data().date, ...doc.data().scores, Total: doc.data().totalScore }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sadhana");
    XLSX.writeFile(wb, `${name}_Sadhana.xlsx`);
};

document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(err => alert(err.message)); };
document.getElementById('logout-btn').onclick = () => auth.signOut().then(() => location.reload());
window.openProfileEdit = () => { document.getElementById('profile-name').value = userProfile.name; document.getElementById('cancel-edit').classList.remove('hidden'); showSection('profile'); };
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');
