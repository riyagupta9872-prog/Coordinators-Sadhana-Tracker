// ==========================================
// SECTION 1 & 2: PEHCHAAN AUR PROFILE UPDATE
// ==========================================

// 1. Initial Connection
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

let currentUser = null;
let userProfile = null;

// 2. Login aur Pehchaan Logic (Handle New/Old Users)
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        
        if (doc.exists) {
            const data = doc.data();
            userProfile = {
                displayName: data.displayName || "",
                level: (data.level || "").trim(),
                chantingCategory: data.chantingCategory || "",
                exactRounds: data.exactRounds || "",
                isAdmin: data.devoteeId === "Admin01"
            };

            // Header mein naam dikhana
            if(document.getElementById('user-display-name')) {
                document.getElementById('user-display-name').innerText = userProfile.displayName;
            }
            
            // PRD: Senior Batch check for "Notes Revision" field
            const notesField = document.getElementById('notes-revision-field');
            if (userProfile.level === "Senior Batch" && notesField) {
                notesField.classList.remove('hidden');
            }

            // PRD: Admin Tab check
            const adminTab = document.getElementById('admin-tab-btn');
            if (userProfile.isAdmin && adminTab) {
                adminTab.classList.remove('hidden');
            }

            showSection('dashboard-section'); 
            if(window.switchTab) window.switchTab('form'); 
        } else {
            // Naya User: Seedha Profile setup par bhejo
            showSection('profile-section');
            document.getElementById('profile-cancel-btn')?.classList.add('hidden'); // New user cancel nahi kar sakta
        }
    } else {
        showSection('auth-section');
    }
});

// 3. Profile Save aur Update Button
document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    
    const updatedData = {
        displayName: document.getElementById('profile-name').value,
        level: document.getElementById('profile-level').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds: document.getElementById('profile-exact-rounds').value,
        email: currentUser.email,
        lastUpdated: new Date()
    };

    try {
        // Firebase mein data update karna (Same email/UID ke liye)
        await db.collection('users').doc(currentUser.uid).set(updatedData, { merge: true });
        alert("Profile Updated Successfully!");
        location.reload(); // Refresh to apply changes
    } catch (error) {
        alert("Error updating profile: " + error.message);
    }
};

// 4. Cancel Button Logic
window.cancelProfileEdit = () => {
    showSection('dashboard-section');
};

// Helper to switch screens
function showSection(id) {
    document.querySelectorAll('section').forEach(s => s.classList.add('hidden'));
    const target = document.getElementById(id);
    if(target) target.classList.remove('hidden');
}
// ==========================================
// SECTION 3: THE LOCKED SCORING ENGINE
// ==========================================

// Helper: Time ko minutes mein badalna (Fixed for your thresholds)
const t2m = (timeStr, isSleepTime = false) => {
    if (!timeStr) return 9999; 
    let [hrs, mins] = timeStr.split(':').map(Number);
    // Agar raat ke 12 se 4 ke beech soya hai toh use 24+ ghante maanna
    if (isSleepTime && hrs >= 0 && hrs <= 4) hrs += 24; 
    return (hrs * 60) + mins;
};

function calculateFinalScore(data, userLevel) {
    // 1. Time conversion (As per your Doc logic)
    const slpM = t2m(data.sleepTime, true);  // Sleep (Target 10:30 PM)
    const wakM = t2m(data.wakeupTime, false); // Wakeup (Target 5:05 AM)
    const chnM = t2m(data.chantingTime, false); // Chanting Finish Time

    // 2. Initialize scores with penalty
    const sc = { sleep: -5, wakeup: -5, chanting: -5, reading: -5, hearing: -5, service: -5, notes: -5, daySleep: 0 };

    // --- LOCKED SCALES (Strictly from your Doc) ---
    
    // Sleep Scoring
    if (slpM <= 1350) sc.sleep = 25; 
    else if (slpM <= 1355) sc.sleep = 20; 
    else if (slpM <= 1360) sc.sleep = 15; 
    else if (slpM <= 1365) sc.sleep = 10; 
    else if (slpM <= 1370) sc.sleep = 5; 
    else if (slpM <= 1375) sc.sleep = 0;

    // Wakeup Scoring
    if (wakM <= 305) sc.wakeup = 25; 
    else if (wakM <= 310) sc.wakeup = 20; 
    else if (wakM <= 315) sc.wakeup = 15; 
    else if (wakM <= 320) sc.wakeup = 10; 
    else if (wakM <= 325) sc.wakeup = 5; 
    else if (wakM <= 330) sc.wakeup = 0;

    // Chanting Finish Time Scoring
    if (chnM <= 540) sc.chanting = 25; 
    else if (chnM <= 570) sc.chanting = 20; 
    else if (chnM <= 660) sc.chanting = 15; 
    else if (chnM <= 870) sc.chanting = 10; 
    else if (chnM <= 1020) sc.chanting = 5; 
    else if (chnM <= 1140) sc.chanting = 0;

    // Reading & Hearing (Threshold depends on Level)
    const getActScore = (m, threshold) => {
        if (m >= threshold) return 25;
        if (m >= threshold - 10) return 20;
        if (m >= 20) return 15;
        if (m >= 15) return 10;
        if (m >= 10) return 5;
        if (m >= 5) return 0;
        return -5;
    };

    const currentThresh = (userLevel === "Senior Batch") ? 40 : 30;
    sc.reading = getActScore(data.readingMinutes, currentThresh);
    sc.hearing = getActScore(data.hearingMinutes, currentThresh);
    
    // Day Sleep Penalty
    sc.daySleep = (data.daySleepMinutes <= 60) ? 10 : -5;

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    // --- LEVEL SPECIFIC SCORING (Notes Revision logic) ---
    if (userLevel === "Senior Batch") {
        // Service (Max 10 for Seniors)
        const s = data.serviceMinutes;
        if (s >= 15) sc.service = 10; else if (s >= 10) sc.service = 5; else if (s >= 5) sc.service = 0; else sc.service = -5;

        // Notes Revision (Max 15 for Seniors)
        const n = data.notesMinutes;
        if (n >= 20) sc.notes = 15; else if (n >= 15) sc.notes = 10; else if (n >= 10) sc.notes = 5; else if (n >= 5) sc.notes = 0; else sc.notes = -5;
        
        total += (sc.service + sc.notes);
    } else {
        // Others get full 25 for Service
        sc.service = getActScore(data.serviceMinutes, 30);
        total += sc.service;
    }

    return { 
        totalScore: total, 
        dayPercent: Math.round((total / 160) * 100) 
    };
}
// ==========================================
// SECTION 4 & 5: CALENDAR REPORTS & ADMIN (LOCKED)
// ==========================================

// 1. Helper: PRD Sunday-to-Saturday Logic
function getWeekRange(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDay(); // 0 (Sun) to 6 (Sat)
    const sun = new Date(d);
    sun.setDate(d.getDate() - day);
    const sat = new Date(sun);
    sat.setDate(sun.getDate() + 6);
    
    const options = { month: 'short', day: 'numeric' };
    return {
        key: sun.toISOString().split('T')[0],
        label: `Week: ${sun.toLocaleDateString(undefined, options)} - ${sat.toLocaleDateString(undefined, options)}`
    };
}

// 2. My Reports: 4-Week Collapsible (PRD Style)
async function loadMyReports() {
    const container = document.getElementById('weekly-reports-container');
    if (!container) return;
    container.innerHTML = "Syncing with records...";

    const snap = await db.collection('users').doc(currentUser.uid)
                         .collection('sadhana').orderBy(firebase.firestore.FieldPath.documentId(), "desc").get();
    
    let weeklyGroups = {};
    snap.forEach(doc => {
        const info = getWeekRange(doc.id);
        if (!weeklyGroups[info.key]) weeklyGroups[info.key] = { label: info.label, days: [], totalWeekScore: 0 };
        const d = doc.data();
        weeklyGroups[info.key].days.push({ id: doc.id, ...d });
        weeklyGroups[info.key].totalWeekScore += (d.totalScore || 0);
    });

    const sortedWeeks = Object.keys(weeklyGroups).sort().reverse().slice(0, 4);
    let html = `<h3>My Reports (Last 4 Weeks) <button onclick="downloadMyExcel()" style="width:auto; font-size:11px;">Export Excel</button></h3>`;

    sortedWeeks.forEach(key => {
        const week = weeklyGroups[key];
        const weekAvg = Math.round((week.totalWeekScore / 1120) * 100); // 160 * 7 = 1120 
        const weekClass = weekAvg < 40 ? 'score-negative' : ''; //

        html += `
        <details class="card" style="margin-bottom:12px; border:1px solid var(--primary);">
            <summary style="padding:12px; cursor:pointer; list-style:none; display:flex; justify-content:space-between; align-items:center; background:#f8f9fa;">
                <strong>${week.label}</strong>
                <span class="badge ${weekClass}" style="padding:4px 12px; border-radius:12px; border:1px solid #ddd;">Avg: ${weekAvg}%</span>
            </summary>
            <div style="padding:10px; overflow-x:auto;">
                <table style="width:100%; border-collapse:collapse; font-size:12px; text-align:left;">
                    <thead style="background:#eee;">
                        <tr><th>Date</th><th>Sleep</th><th>Wakeup</th><th>Chanting</th><th>R/H</th><th>Score</th><th>%</th></tr>
                    </thead>
                    <tbody>
                        ${week.days.map(day => `
                            <tr style="border-bottom:1px solid #f1f1f1;">
                                <td>${day.id}</td>
                                <td>${day.sleepTime} (${day.scSleep || 0})</td>
                                <td>${day.wakeupTime} (${day.scWakeup || 0})</td>
                                <td>${day.chantingTime} (${day.scChanting || 0})</td>
                                <td>${day.readingMinutes}/${day.hearingMinutes}</td>
                                <td>${day.totalScore}</td>
                                <td class="${day.dayPercent < 40 ? 'score-negative' : ''}">${day.dayPercent}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </details>`;
    });
    container.innerHTML = html || "<p>No entries yet.</p>";
}

// 3. Admin Panel: Master Comparative Table [cite: 1, 2]
async function loadAdminPanel() {
    const tableBody = document.getElementById('admin-table-body');
    const tableHeader = document.getElementById('admin-table-header');
    if (!tableBody) return;

    tableHeader.innerHTML = `<th>Devotee</th><th>Position</th><th>Chanting (Exact)</th><th>Weekly Avg %</th>`;
    tableBody.innerHTML = "<tr><td colspan='4'>Crunching Numbers...</td></tr>";

    const usersSnap = await db.collection('users').get();
    const weekInfo = getWeekRange(new Date()); // Current Week Sunday-Saturday
    let rows = "";

    for (const uDoc of usersSnap.docs) {
        const u = uDoc.data();
        const sadhanaSnap = await db.collection('users').doc(uDoc.id).collection('sadhana')
            .where(firebase.firestore.FieldPath.documentId(), ">=", weekInfo.key)
            .get();
        
        let weekTotal = 0;
        sadhanaSnap.forEach(s => {
            // Only count if within the Saturday limit of the current week
            if(s.id <= getWeekRange(new Date()).end) weekTotal += (s.data().totalScore || 0);
        });

        const weeklyPercent = Math.round((weekTotal / 1120) * 100); // 
        const scoreClass = weeklyPercent < 40 ? 'score-negative' : '';

        rows += `
            <tr>
                <td>${u.displayName || 'Devotee'}</td>
                <td style="font-size:0.85em;">${u.level || '---'}</td>
                <td>${u.chantingCategory || '---'} (${u.exactRounds || 0})</td>
                <td class="${scoreClass}">${weeklyPercent}%</td>
            </tr>
        `;
    }
    tableBody.innerHTML = rows;
}
