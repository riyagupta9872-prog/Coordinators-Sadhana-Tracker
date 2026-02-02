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

const t2m = (t, isS = false) => {
    if(!t) return 9999;
    let [h, m] = t.split(':').map(Number);
    if(isS && h <= 3) h += 24;
    return h * 60 + m;
};

// --- AUTH & PROFILE ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').innerText = `${userProfile.name} (${userProfile.category})`;
            
            // Show Notes Revision if Level 1 (Senior Batch)
            if(userProfile.category === "Senior Batch") {
                document.getElementById('notes-revision-area').classList.remove('hidden');
            }
            
            showSection('dashboard');
            setupDateSelect();
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        category: document.getElementById('profile-level').value, // Level 1, 2, 3
        chantingLevel: document.getElementById('profile-chanting-cat').value, // Rounds
        exactRounds: document.getElementById('profile-exact-rounds').value,
        isAdmin: false
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    location.reload();
};

// --- SUBMISSION ---
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        uid: currentUser.uid,
        date: document.getElementById('sadhana-date').value,
        sleep: document.getElementById('sleep-time').value,
        wakeup: document.getElementById('wakeup-time').value,
        chanting: document.getElementById('chanting-time').value,
        reading: parseInt(document.getElementById('reading-mins').value || 0),
        hearing: parseInt(document.getElementById('hearing-mins').value || 0),
        service: parseInt(document.getElementById('service-mins').value || 0),
        notes: parseInt(document.getElementById('notes-mins')?.value || 0),
        daySleep: parseInt(document.getElementById('day-sleep-minutes').value || 0),
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
    };

    // Note: Scoring logic will be inserted in next step as per your request to go slow
    await db.collection('sadhana_logs').doc(currentUser.uid + "_" + d.date).set(d);
    alert("Data Submitted to Logs!");
    switchTab('reports');
};

// --- UI HELPERS ---
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    if(t === 'reports') loadReports();
};

function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    const d = new Date(), y = new Date(); y.setDate(d.getDate()-1);
    const f = (dt) => dt.toISOString().split('T')[0];
    s.innerHTML = `<option value="${f(d)}">${f(d)}</option><option value="${f(y)}">${f(y)}</option>`;
}

async function loadReports() {
    const snap = await db.collection('sadhana_logs').where('uid', '==', currentUser.uid).get();
    let h = '<table class="admin-table"><tr><th>Date</th><th>Status</th></tr>';
    snap.forEach(doc => { h += `<tr><td>${doc.data().date}</td><td>Submitted</td></tr>`; });
    document.getElementById('weekly-reports-container').innerHTML = h + '</table>';
}

document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(document.getElementById('login-email').value, document.getElementById('login-password').value);
};
document.getElementById('logout-btn').onclick = () => auth.signOut().then(() => location.reload());
