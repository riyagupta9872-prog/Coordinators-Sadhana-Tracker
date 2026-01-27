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
const APP_ID = "App1_SeniorYouth_2026"; 
let currentUser = null, userProfile = null;

// --- TIME CALCULATOR (Late Night Fix) ---
const t2m = (t, isS = false) => { 
    if(!t) return 9999; 
    let [h,m] = t.split(':').map(Number); 
    if(isS && h<=3) h+=24; // 1 AM becomes 25:00
    return h*60+m; 
};

// --- SCORING (Locked Rules) ---
function calculateScore(d, pos) {
    let sc = { sleep:-5, wakeup:-5, chanting:-5, reading:-5, hearing:-5, service:-5, notes:0, daySleep:0 };
    const s = t2m(d.sleepTime, true);
    if(s<=1350) sc.sleep=25; else if(s<=1375) sc.sleep=Math.max(0, 25-(s-1350)); else sc.sleep=-5;
    
    const w = t2m(d.wakeupTime);
    if(w<=305) sc.wakeup=25; else if(w<=330) sc.wakeup=Math.max(0, 25-(w-305)); else sc.wakeup=-5;
    
    const c = t2m(d.chantingTime);
    if(c<=540) sc.chanting=25; else if(c<=1140) sc.chanting=Math.max(0, 25-Math.floor((c-540)/30)*5); else sc.chanting=-5;
    
    sc.daySleep = d.daySleepMins <= 60 ? 10 : -5;

    if(pos === "Senior Batch") {
        const g25 = (m) => m>=30?25:m>=20?15:m>=15?10:m>=10?5:m>=5?0:-5;
        sc.reading=g25(d.readM); sc.hearing=g25(d.hearM);
        sc.service=d.servM>=15?10:d.servM>=10?5:d.servM>=5?0:-5;
        sc.notes=d.noteM>=20?15:d.noteM>=15?10:d.noteM>=10?5:d.noteM>=5?0:-5;
    } else {
        const g30 = (m) => m>=40?30:m>=30?25:m>=20?15:m>=10?5:-5;
        sc.reading=g30(d.readM); sc.hearing=g30(d.hearM);
        sc.service=d.servM>=15?15:d.servM>=5?5:-5;
    }
    return { total: Object.values(sc).reduce((a,b)=>a+b,0), breakdown: sc };
}

// --- AUTH STATE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.name;
            
            // ADMIN TAB VISIBILITY FIX
            if(userProfile.role === 'admin') {
                document.getElementById('admin-tab-btn').classList.remove('hidden');
            }
            
            if(userProfile.position === 'Senior Batch') {
                document.getElementById('notes-group').classList.remove('hidden');
            }
            setupDashboard();
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

// --- NAVIGATION & TABS ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId + '-tab').classList.remove('hidden');
    document.getElementById('tab-' + tabId).classList.add('active');
    if(tabId === 'reports') loadReports();
    if(tabId === 'admin') loadAdmin();
}

// --- BUTTONS ---
document.getElementById('login-btn').addEventListener('click', () => {
    const e = document.getElementById('login-email').value;
    const p = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(e, p).catch(err => alert("Login Failed: " + err.message));
});

document.getElementById('logout-btn').addEventListener('click', () => auth.signOut().then(() => location.reload()));

document.getElementById('edit-profile-link').addEventListener('click', (e) => {
    e.preventDefault();
    showSection('profile');
    document.getElementById('profile-name').value = userProfile.name || "";
    document.getElementById('profile-position').value = userProfile.position || "Senior Batch";
    document.getElementById('profile-rounds').value = userProfile.rounds || 0;
    document.getElementById('cancel-profile-btn').classList.remove('hidden');
});

document.getElementById('save-profile-btn').addEventListener('click', async () => {
    const newPass = document.getElementById('new-password').value;
    if(newPass) await auth.currentUser.updatePassword(newPass).catch(e => alert("Password error: " + e.message));
    
    await db.collection('users').doc(currentUser.uid).set({
        name: document.getElementById('profile-name').value,
        position: document.getElementById('profile-position').value,
        rounds: document.getElementById('profile-rounds').value,
        app_id: APP_ID // Yahan update hoga taaki naya logic chale
    }, {merge: true});
    alert("Profile Updated!");
    location.reload();
});

document.getElementById('cancel-profile-btn').addEventListener('click', () => showSection('dashboard'));

// Tab Event Listeners
document.getElementById('tab-entry').addEventListener('click', () => switchTab('entry'));
document.getElementById('tab-reports').addEventListener('click', () => switchTab('reports'));
document.getElementById('tab-admin').addEventListener('click', () => switchTab('admin'));

// --- DATA LOADING ---
async function loadReports() {
    // Ye purana data bhi dikhayega (kyuki UID same hai)
    const snap = await db.collection('sadhana_logs')
                   .where('uid','==',currentUser.uid)
                   .orderBy('date','desc').limit(15).get();
    let html = '';
    snap.forEach(doc => {
        const d = doc.data();
        html += `<div style="border-bottom:1px solid #eee; padding:10px; display:flex; justify-content:space-between;">
                    <span>${d.date}</span>
                    <strong style="color:#2c3e50;">Score: ${d.totalScore}</strong>
                 </div>`;
    });
    document.getElementById('user-history-list').innerHTML = html || "No records found.";
}

async function loadAdmin() {
    // Admin pure project ka data dekhega
    const snap = await db.collection('sadhana_logs')
                   .orderBy('date','desc').limit(50).get();
    let html = '<table style="width:100%; font-size:13px; border-collapse:collapse;"><tr style="background:#eee;"><th>Name</th><th>Score</th><th>Date</th></tr>';
    snap.forEach(doc => {
        const d = doc.data();
        html += `<tr style="border-bottom:1px solid #ddd;">
                    <td style="padding:8px;">${d.userName || 'Unknown'}</td>
                    <td style="padding:8px;">${d.totalScore}</td>
                    <td style="padding:8px;">${d.date}</td>
                 </tr>`;
    });
    document.getElementById('admin-logs-list').innerHTML = html + '</table>';
}

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readM: parseInt(document.getElementById('reading-mins').value) || 0,
        hearM: parseInt(document.getElementById('hearing-mins').value) || 0,
        servM: parseInt(document.getElementById('service-mins').value) || 0,
        noteM: parseInt(document.getElementById('notes-mins')?.value) || 0,
        daySleepMins: parseInt(document.getElementById('day-sleep-mins').value) || 0
    };
    const res = calculateScore(data, userProfile.position);
    const date = document.getElementById('sadhana-date').value;
    
    await db.collection('sadhana_logs').doc(currentUser.uid + "_" + date).set({
        ...data, 
        totalScore: res.total, 
        uid: currentUser.uid, 
        userName: userProfile.name, 
        position: userProfile.position, 
        date, 
        app_id: APP_ID
    });
    alert("Hare Krishna! Saved. Score: " + res.total);
};

function setupDashboard() {
    showSection('dashboard');
    const s = document.getElementById('sadhana-date');
    s.innerHTML = "";
    for(let i=0; i<3; i++) {
        let d = new Date(); d.setDate(d.getDate()-i);
        let iso = d.toISOString().split('T')[0];
        s.innerHTML += `<option value="${iso}">${iso}</option>`;
    }
}
