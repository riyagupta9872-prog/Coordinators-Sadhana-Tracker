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

const t2m = (t, isS = false) => { if(!t) return 9999; let [h,m] = t.split(':').map(Number); if(isS && h<=3) h+=24; return h*60+m; };

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

// --- AUTH & INITIALIZATION ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists && doc.data().position) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.name;
            document.getElementById('user-level-badge').innerText = `${userProfile.position} | ${userProfile.level}`;
            if(userProfile.role === 'admin') document.getElementById('tab-admin').classList.remove('hidden');
            if(userProfile.position === 'Senior Batch') document.getElementById('notes-group').classList.remove('hidden');
            setupDashboard();
        } else { showSection('profile'); }
    } else { showSection('auth'); }
});

// --- ACTIONS ---
document.getElementById('login-btn').onclick = () => {
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e => alert(e.message));
};

document.getElementById('save-profile-btn').onclick = async () => {
    const data = {
        name: document.getElementById('profile-name').value,
        position: document.getElementById('profile-position').value,
        level: document.getElementById('profile-level').value,
        rounds: document.getElementById('profile-rounds').value,
        app_id: APP_ID
    };
    await db.collection('users').doc(currentUser.uid).set(data, {merge: true});
    location.reload();
};

document.getElementById('update-pass-btn').onclick = async () => {
    const p = document.getElementById('new-password').value;
    if(!p) return alert("Enter new password");
    await auth.currentUser.updatePassword(p).then(() => alert("Password Updated!")).catch(e => alert(e.message));
};

document.getElementById('logout-btn').onclick = () => auth.signOut().then(() => location.reload());

document.getElementById('edit-profile-link').onclick = () => {
    showSection('profile');
    document.getElementById('profile-name').value = userProfile.name;
    document.getElementById('profile-position').value = userProfile.position;
    document.getElementById('profile-level').value = userProfile.level || "Level 1";
    document.getElementById('profile-rounds').value = userProfile.rounds || 0;
    document.getElementById('cancel-profile-btn').classList.remove('hidden');
};

// --- TABS & DATA ---
function switchTab(t) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    document.getElementById('tab-' + t).classList.add('active');
    if(t === 'reports') loadUserReports();
    if(t === 'admin') { loadAdminComparative(); loadUserManagement(); }
}

document.getElementById('tab-entry').onclick = () => switchTab('entry');
document.getElementById('tab-reports').onclick = () => switchTab('reports');
document.getElementById('tab-admin').onclick = () => switchTab('admin');

async function loadUserReports() {
    const snap = await db.collection('sadhana_logs').where('uid','==',currentUser.uid).orderBy('date','desc').limit(15).get();
    let html = '<h3>Your Scores</h3>';
    snap.forEach(doc => {
        const d = doc.data();
        html += `<div class="card report-item" style="margin-bottom:10px;"><b>${d.date}</b>: Score ${d.totalScore}</div>`;
    });
    document.getElementById('user-history-list').innerHTML = html;
}

async function loadAdminComparative() {
    const snap = await db.collection('sadhana_logs').where('app_id','==',APP_ID).orderBy('date','desc').limit(50).get();
    let html = '<table style="width:100%; border-collapse:collapse;"><tr><th>Date</th><th>Name</th><th>Pos</th><th>Score</th></tr>';
    snap.forEach(doc => {
        const d = doc.data();
        html += `<tr><td>${d.date}</td><td>${d.userName}</td><td>${d.position}</td><td>${d.totalScore}</td></tr>`;
    });
    document.getElementById('admin-logs-list').innerHTML = html + '</table>';
}

async function loadUserManagement() {
    const snap = await db.collection('users').where('app_id','==',APP_ID).get();
    let html = '<table style="width:100%; border-collapse:collapse;"><tr><th>Name</th><th>Role</th><th>Level</th></tr>';
    snap.forEach(doc => {
        const d = doc.data();
        html += `<tr><td>${d.name}</td><td>${d.role || 'user'}</td><td>${d.level}</td></tr>`;
    });
    document.getElementById('admin-user-list').innerHTML = html + '</table>';
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
        ...data, totalScore: res.total, uid: currentUser.uid, userName: userProfile.name, position: userProfile.position, date, app_id: APP_ID
    });
    alert("Saved Score: " + res.total);
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

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}
