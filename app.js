// SECTION 1: FIREBASE & AUTH
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

// Identity & State
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = userProfile.displayName;
            if (userProfile.level === "Senior Batch") document.getElementById('notes-revision-field')?.classList.remove('hidden');
            if (userProfile.devoteeId === "Admin01") document.getElementById('admin-tab-btn')?.classList.remove('hidden');
            
            const sel = document.getElementById('sadhana-date');
            const d1 = new Date().toISOString().split('T')[0];
            const d2 = new Date(Date.now() - 864e5).toISOString().split('T')[0];
            sel.innerHTML = `<option value="${d1}">${d1}</option><option value="${d2}">${d2}</option>`;
            
            showSection('dashboard-section');
            switchTab('sadhana');
        } else { showSection('profile-section'); }
    } else { showSection('auth-section'); }
});

// FIX: Edit Profile Function (Jo error aa raha tha)
window.openProfileEdit = () => {
    if(!userProfile) return;
    document.getElementById('display-name').value = userProfile.displayName || "";
    document.getElementById('devotee-id').value = userProfile.devoteeId || "";
    document.getElementById('user-level').value = userProfile.level || "Senior Batch";
    document.getElementById('chanting-category').value = userProfile.chantingCategory || "16 Rounds Before 9 AM";
    document.getElementById('exact-rounds').value = userProfile.exactRounds || "16";
    showSection('profile-section');
};

// SECTION 2: FORMS
document.getElementById('login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    try {
        await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) {
        if (err.code === 'auth/user-not-found') {
            await auth.createUserWithEmailAndPassword(email, pass);
            alert("Account Created!");
        } else alert(err.message);
    }
};

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        displayName: document.getElementById('display-name').value,
        devoteeId: document.getElementById('devotee-id').value,
        level: document.getElementById('user-level').value,
        chantingCategory: document.getElementById('chanting-category').value,
        exactRounds: document.getElementById('exact-rounds').value,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('users').doc(currentUser.uid).set(data, {merge: true});
    location.reload();
};

// SECTION 3: SCORING & REPORTS
const t2m = (t, s=false) => { if(!t) return 9999; let [h,m]=t.split(':').map(Number); if(s && h<=4) h+=24; return h*60+m; };

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const dateId = document.getElementById('sadhana-date').value;
    const d = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value)||0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value)||0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value)||0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value)||0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value)||0
    };

    let sc = {s:-5,w:-5,c:-5,r:-5,h:-5,sv:-5,n:-5,ds:0};
    const slp=t2m(d.sleepTime,true), wak=t2m(d.wakeupTime), chn=t2m(d.chantingTime);
    if(slp<=1350) sc.s=25; else if(slp<=1375) sc.s=25-(slp-1350);
    if(wak<=305) sc.w=25; else if(wak<=330) sc.w=25-(wak-305);
    if(chn<=540) sc.c=25; else if(chn<=1140) sc.c=Math.max(0,25-Math.floor((chn-540)/30)*5);

    const thr = (userProfile.level==="Senior Batch")?40:30;
    const getSc = (m,t) => m>=t?25 : (m>=5?Math.floor(m/5)*5:-5);
    sc.r=getSc(d.readingMinutes,thr); sc.h=getSc(d.hearingMinutes,thr);
    sc.ds=d.daySleepMinutes<=60?10:-5;
    if(userProfile.level==="Senior Batch"){ sc.sv=d.serviceMinutes>=15?10:-5; sc.n=d.notesMinutes>=20?15:-5; }
    else { sc.sv=getSc(d.serviceMinutes,30); }

    const total = Object.values(sc).reduce((a,b)=>a+b,0);
    const result = {...d, totalScore:total, dayPercent:Math.round((total/160)*100)};
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set(result);
    alert("Sadhana Saved!"); switchTab('reports');
};

async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    container.innerHTML = "Fetching...";
    const snap = await db.collection('users').doc(currentUser.uid).collection('sadhana').get();
    const docs = snap.docs.sort((a,b) => b.id.localeCompare(a.id));
    let html = `<h3>My History</h3>`;
    docs.forEach(doc => {
        const d = doc.data();
        html += `<div class="card" style="margin-bottom:10px; border-left:5px solid var(--primary); padding:10px;">
            <strong>${doc.id}</strong>: ${d.totalScore}/160 (${d.dayPercent}%)
        </div>`;
    });
    container.innerHTML = html || "No records.";
}

// SECTION 4: ADMIN & UTILS
async function loadAdminPanel() {
    const tableBody = document.getElementById('admin-table-body');
    document.getElementById('admin-table-header').innerHTML = `<th>Devotee</th><th>Position</th><th>Chanting</th><th>Weekly %</th>`;
    tableBody.innerHTML = "Loading...";
    const usersSnap = await db.collection('users').get();
    let rows = "";
    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sSnap = await db.collection('users').doc(uDoc.id).collection('sadhana').get();
        let weekTotal = 0;
        sSnap.forEach(s => { weekTotal += (s.data().totalScore || 0); });
        rows += `<tr><td>${u.displayName}</td><td>${u.level}</td><td>${u.chantingCategory}</td><td>${Math.round((weekTotal/1120)*100)}%</td></tr>`;
    }
    tableBody.innerHTML = rows;
}

window.switchTab = (id) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${id}')"]`)?.classList.add('active');
    document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
    document.getElementById(id + '-tab')?.classList.remove('hidden');
    if(id==='reports') loadMyReports(); if(id==='admin') loadAdminPanel();
};

function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id)?.classList.remove('hidden');
}

window.logout = () => auth.signOut().then(() => location.reload());
