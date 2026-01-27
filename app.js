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
let userData = null;

// SCORING
const t2m = (t, isS = false) => { if(!t) return 9999; let [h,m] = t.split(':').map(Number); if(isS && h<=3) h+=24; return h*60+m; };
function getScore(d, pos) {
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
    return { total: Object.values(sc).reduce((a,b)=>a+b,0), details: sc };
}

// AUTH
auth.onAuthStateChanged(async (user) => {
    if (user) {
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists && doc.data().position) {
            userData = doc.data();
            document.getElementById('user-display-name').innerText = userData.name;
            document.getElementById('user-meta').innerText = `${userData.position} | ${userData.level}`;
            if(userData.role === 'admin') document.getElementById('tab-btn-admin').classList.remove('hidden');
            if(userData.position === 'Senior Batch') document.getElementById('notes-group').classList.remove('hidden');
            initDash();
        } else showSec('profile');
    } else showSec('auth');
});

// UI NAVIGATION
const showSec = (id) => { document.querySelectorAll('section').forEach(s=>s.classList.add('hidden')); document.getElementById(id+'-section').classList.remove('hidden'); };
const switchTab = (id) => { 
    document.querySelectorAll('.tab-content').forEach(c=>c.classList.add('hidden')); 
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.remove('active'));
    document.getElementById(id+'-tab').classList.remove('hidden');
    document.getElementById('tab-btn-'+id).classList.add('active');
    if(id === 'reports') loadHistory();
    if(id === 'admin') loadAdmin();
};

document.getElementById('tab-btn-entry').onclick = () => switchTab('entry');
document.getElementById('tab-btn-reports').onclick = () => switchTab('reports');
document.getElementById('tab-btn-admin').onclick = () => switchTab('admin');
document.getElementById('edit-profile-btn').onclick = () => {
    showSec('profile');
    document.getElementById('profile-name').value = userData.name;
    document.getElementById('profile-position').value = userData.position;
    document.getElementById('profile-level').value = userData.level;
    document.getElementById('profile-rounds').value = userData.rounds;
};

// HANDLERS
document.getElementById('login-btn').onclick = () => auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value).catch(e => alert(e.message));
document.getElementById('logout-btn').onclick = () => auth.signOut().then(()=>location.reload());

document.getElementById('save-profile-btn').onclick = async () => {
    const np = document.getElementById('new-password').value;
    if(np && np.length >= 6) await auth.currentUser.updatePassword(np);
    await db.collection('users').doc(auth.currentUser.uid).set({
        name: document.getElementById('profile-name').value,
        position: document.getElementById('profile-position').value,
        level: document.getElementById('profile-level').value,
        rounds: document.getElementById('profile-rounds').value,
        app_id: APP_ID
    }, {merge:true});
    location.reload();
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readM: parseInt(document.getElementById('read-mins').value)||0,
        hearM: parseInt(document.getElementById('hear-mins').value)||0,
        servM: parseInt(document.getElementById('serv-mins').value)||0,
        noteM: parseInt(document.getElementById('notes-mins')?.value)||0,
        daySleepMins: parseInt(document.getElementById('day-sleep').value)||0
    };
    const res = getScore(d, userData.position);
    const date = document.getElementById('sadhana-date').value;
    await db.collection('sadhana_logs').doc(auth.currentUser.uid+"_"+date).set({
        ...d, totalScore: res.total, uid: auth.currentUser.uid, userName: userData.name, position: userData.position, date, app_id: APP_ID
    });
    alert("Saved! Score: " + res.total);
};

const initDash = () => {
    showSec('dashboard');
    const s = document.getElementById('sadhana-date'); s.innerHTML = "";
    for(let i=0; i<3; i++) {
        let d = new Date(); d.setDate(d.getDate()-i);
        let iso = d.toISOString().split('T')[0];
        s.innerHTML += `<option value="${iso}">${iso}</option>`;
    }
};

async function loadHistory() {
    const snap = await db.collection('sadhana_logs').where('uid','==',auth.currentUser.uid).orderBy('date','desc').limit(10).get();
    let h = ''; snap.forEach(doc => { h += `<div class="report-item"><span>${doc.data().date}</span><strong>${doc.data().totalScore}</strong></div>`; });
    document.getElementById('reports-list').innerHTML = h || "No data yet.";
}

async function loadAdmin() {
    const snap = await db.collection('sadhana_logs').where('app_id','==',APP_ID).orderBy('date','desc').limit(30).get();
    let h = '<table style="width:100%; border-collapse:collapse;"><tr><th>User</th><th>Score</th><th>Date</th></tr>';
    snap.forEach(doc => { h += `<tr style="border-bottom:1px solid #eee;"><td>${doc.data().userName}</td><td>${doc.data().totalScore}</td><td>${doc.data().date}</td></tr>`; });
    document.getElementById('admin-list').innerHTML = h + '</table>';
}
