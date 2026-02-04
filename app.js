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

// --- 2. TIME & DATE HELPERS ---
const t2m = (t) => {
    if (!t || t === "NR") return 9999;
    const [h, m] = t.split(':').map(Number);
    let total = h * 60 + m;
    // Normalize Sleep (10 PM to 3 AM next day logic)
    if (h >= 0 && h <= 4) total += 1440; 
    return total;
};

function getWeekInfo(dateStr) {
    const d = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const fmt = (date) => `${String(date.getDate()).padStart(2, '0')} ${date.toLocaleString('en-GB', { month: 'short' })}`;
    return { 
        sunStr: sun.toISOString().split('T')[0], 
        label: `${fmt(sun)} to ${fmt(sat)}_${sun.getFullYear()}` 
    };
}

// --- 3. SCORING ENGINE ---
function calculateDayScore(data, level) {
    const sc = { sleep: 0, wakeup: 0, chanting: 0, reading: 0, hearing: 0, service: 0, daySleep: 0, notes: 0 };
    
    // A. TIME BASED SCORING (Sleep, Wake, Chanting)
    const scoreTime = (time, targets, marks) => {
        const m = t2m(time);
        for(let i=0; i<targets.length; i++) {
            if (m <= t2m(targets[i])) return marks[i];
        }
        return -5;
    };

    const t_sleep = ["22:30", "22:35", "22:40", "22:45", "22:50", "22:55", "23:00"];
    const t_wake = ["05:05", "05:10", "05:15", "05:20", "05:25", "05:30", "05:35"];
    const t_chant = ["09:00", "09:30", "11:00", "14:30", "17:00", "19:00", "21:00"];
    const marks = [25, 20, 15, 10, 5, 0, -5];

    sc.sleep = scoreTime(data.sleepTime, t_sleep, marks);
    sc.wakeup = scoreTime(data.wakeupTime, t_wake, marks);
    sc.chanting = scoreTime(data.chantingTime, t_chant, marks);

    // B. MINUTE BASED SCORING
    const getMinScore = (mins, isIYF = false) => {
        const step = 5;
        const threshold = isIYF ? 40 : 30; // IYF needs 40m for max marks
        if (mins >= threshold) return 25;
        if (mins <= 0) return -5;
        // Logic: 25 for max, reducing by 5 for every 5 mins less
        let score = 25 - (Math.ceil((threshold - mins) / step) * 5);
        return Math.max(-5, score);
    };

    const isIYF = level === "IYF Overall Coordinator";
    sc.reading = getMinScore(data.readingMinutes, isIYF);
    sc.hearing = getMinScore(data.hearingMinutes, isIYF);
    sc.service = getMinScore(data.serviceMinutes, false); // Service usually 30m threshold
    sc.notes = getMinScore(data.notesMinutes || 0, false);
    sc.daySleep = data.daySleepMinutes > 60 ? 0 : 10;

    // C. TOTAL CALCULATION BASED ON LEVEL
    let total = sc.sleep + sc.wakeup + sc.chanting + sc.daySleep;
    let maxM = 160;

    if (level === "Senior Batch") {
        total += Math.max(sc.reading, sc.hearing, sc.notes);
        maxM = 110;
    } else {
        total += (sc.reading + sc.hearing + sc.service);
        maxM = 160;
    }

    return { total, scores: sc, percent: Math.round((total/maxM)*100) };
}

// --- 4. UI LOGIC ---
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            document.getElementById('user-display-name').textContent = `${userProfile.name} | ${userProfile.level}`;
            if (userProfile.role === 'admin') document.getElementById('admin-tab-btn').classList.remove('hidden');
            
            // Show Notes Revision only for Senior Batch
            document.getElementById('notes-revision-group').classList.toggle('hidden', userProfile.level !== "Senior Batch");
            
            showSection('dashboard');
            setupDateSelect();
            switchTab('sadhana');
        } else showSection('profile');
    } else showSection('auth');
});

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;

    const data = {
        sleepTime: document.getElementById('sleep-time').value,
        wakeupTime: document.getElementById('wakeup-time').value,
        chantingTime: document.getElementById('chanting-time').value,
        readingMinutes: parseInt(document.getElementById('reading-mins').value) || 0,
        hearingMinutes: parseInt(document.getElementById('hearing-mins').value) || 0,
        serviceMinutes: parseInt(document.getElementById('service-mins').value) || 0,
        daySleepMinutes: parseInt(document.getElementById('daysleep-mins').value) || 0,
        notesMinutes: parseInt(document.getElementById('notes-mins').value) || 0,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const result = calculateDayScore(data, userProfile.level);
    const dateId = document.getElementById('sadhana-date').value;

    try {
        await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(dateId).set({
            ...data,
            totalScore: result.total,
            dayPercent: result.percent,
            scores: result.scores
        });
        alert("Sadhana Submitted Successfully!");
        switchTab('reports');
    } catch (err) { alert("Error: " + err.message); }
    btn.disabled = false;
};

// Profile Setup
document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('profile-name').value,
        level: document.getElementById('profile-level').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        role: userProfile?.role || 'user'
    };
    await db.collection('users').doc(currentUser.uid).set(data, { merge: true });
    location.reload();
};

function setupDateSelect() {
    const select = document.getElementById('sadhana-date');
    select.innerHTML = '';
    for(let i=0; i<2; i++) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const opt = document.createElement('option');
        opt.value = ds; opt.textContent = ds;
        select.appendChild(opt);
    }
}

// Admin & Excel Logic (Standardised)
window.downloadMasterReport = async () => {
    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - (i*7));
        weeks.push(getWeekInfo(d.toISOString().split('T')[0]));
    }
    weeks.reverse();
    
    const usersSnap = await db.collection('users').get();
    const rows = [["Name", "Level", "Category", ...weeks.map(w => w.label + " (%)")]];

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const sEntries = sSnap.docs.map(d => ({ date: d.id, score: d.data().totalScore || 0 }));
        const userRow = [u.name, u.level, u.chantingCategory];
        
        const maxDaily = u.level === "Senior Batch" ? 110 : 160;

        weeks.forEach(w => {
            let weekTotal = 0; let curr = new Date(w.sunStr);
            for (let i = 0; i < 7; i++) {
                const ds = curr.toISOString().split('T')[0];
                const entry = sEntries.find(e => e.date === ds);
                weekTotal += entry ? entry.score : -30; // -5 for each of 6 activities if missed
                curr.setDate(curr.getDate() + 1);
            }
            userRow.push(Math.round((weekTotal / (maxDaily * 7)) * 100) + "%");
        });
        rows.push(userRow);
    }
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master_Report");
    XLSX.writeFile(wb, "Sadhana_Master_Audit.xlsx");
};

// --- AUTH UI ---
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value;
    const pass = document.getElementById('login-password').value;
    auth.signInWithEmailAndPassword(email, pass).catch(async (err) => {
        if(err.code === 'auth/user-not-found') return auth.createUserWithEmailAndPassword(email, pass);
        alert(err.message);
    });
};
document.getElementById('logout-btn').onclick = () => auth.signOut();
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    document.getElementById(id + '-section').classList.remove('hidden');
}
window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if (btn) btn.classList.add('active');
};
window.openProfileEdit = () => {
    document.getElementById('profile-name').value = userProfile.name;
    document.getElementById('profile-level').value = userProfile.level;
    showSection('profile');
};
