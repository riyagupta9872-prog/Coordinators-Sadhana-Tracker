// ─────────────────────────────────────────────────────────────
// 1. FIREBASE SETUP
// ─────────────────────────────────────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyDbRy8ZMJAWeTyZVnTphwRIei6jAckagjA",
    authDomain: "sadhana-tracker-b65ff.firebaseapp.com",
    projectId: "sadhana-tracker-b65ff",
    storageBucket: "sadhana-tracker-b65ff.firebasestorage.app",
    messagingSenderId: "926961218888",
    appId: "1:926961218888:web:db8f12ef8256d13f036f7d"
};
if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();
// Fixes WebChannel transport error on mobile / restricted networks
db.settings({ experimentalForceLongPolling: true, merge: true });

let currentUser = null, userProfile = null, activeListener = null;

// ─────────────────────────────────────────────────────────────
// 2. ROLE HELPERS
// ─────────────────────────────────────────────────────────────
const isSuperAdmin    = () => userProfile?.role === 'superAdmin';
const isCategoryAdmin = () => userProfile?.role === 'admin';
const isAnyAdmin      = () => isSuperAdmin() || isCategoryAdmin();
const visibleCategories = () => {
    if (isSuperAdmin()) return ['Senior Batch', 'IGF & IYF Coordinator', 'ICF Coordinator'];
    if (isCategoryAdmin()) return [userProfile.adminCategory];
    return [];
};

// ─────────────────────────────────────────────────────────────
// 3. GENERAL HELPERS
// ─────────────────────────────────────────────────────────────
const t2m = (t, isSleep = false) => {
    if (!t || t === 'NR') return 9999;
    let [h, m] = t.split(':').map(Number);
    if (isSleep && h >= 0 && h <= 3) h += 24;
    return h * 60 + m;
};

function getWeekInfo(dateStr) {
    const d   = new Date(dateStr);
    const sun = new Date(d); sun.setDate(d.getDate() - d.getDay());
    const sat = new Date(sun); sat.setDate(sun.getDate() + 6);
    const fmt = dt => `${String(dt.getDate()).padStart(2,'0')} ${dt.toLocaleString('en-GB',{month:'short'})}`;
    return { sunStr: sun.toISOString().split('T')[0], label: `${fmt(sun)} to ${fmt(sat)}_${sun.getFullYear()}` };
}

function getNRData(date) {
    return {
        id: date, totalScore: -35, dayPercent: -22,
        sleepTime:'NR', wakeupTime:'NR', chantingTime:'NR',
        readingMinutes:0, hearingMinutes:0, serviceMinutes:0, notesMinutes:0, daySleepMinutes:0,
        scores:{ sleep:-5, wakeup:-5, chanting:-5, reading:-5, hearing:-5, service:-5, notes:-5, daySleep:0 }
    };
}

// ─────────────────────────────────────────────────────────────
// 4. EXCEL DOWNLOAD
//    Uses XLSX.writeFile exactly like the original working code.
//    No wrappers, no polling, no blob tricks — just direct call.
// ─────────────────────────────────────────────────────────────

window.downloadUserExcel = async (userId, userName) => {
    try {
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded. Please wait a moment and try again.');
            return;
        }

        const snap = await db.collection('users').doc(userId).collection('sadhana').get();
        if (snap.empty) {
            alert('No sadhana data found for this user.');
            return;
        }

        // Organise by week
        const weeksData = {};
        snap.forEach(doc => {
            const wi = getWeekInfo(doc.id);
            if (!weeksData[wi.sunStr]) {
                weeksData[wi.sunStr] = { label: wi.label, sunStr: wi.sunStr, days: {} };
            }
            weeksData[wi.sunStr].days[doc.id] = doc.data();
        });

        // Sort latest week first
        const sortedWeeks = Object.keys(weeksData).sort((a, b) => b.localeCompare(a));
        const dataArray   = [];
        const DAY         = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

        sortedWeeks.forEach((sunStr, weekIndex) => {
            const week = weeksData[sunStr];

            // Week header row
            dataArray.push([`WEEK: ${week.label}`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            // Column headers
            dataArray.push(['Date','Bed','M','Wake','M','Chant','M','Read(m)','M','Hear(m)','M','Seva(m)','M','Notes(m)','M','Day Sleep(m)','M','Total','%']);

            let weekTotals = {
                sleepM:0, wakeupM:0, chantingM:0,
                readingM:0, hearingM:0, serviceM:0, notesM:0, daySleepM:0,
                readingMins:0, hearingMins:0, serviceMins:0, notesMins:0, daySleepMins:0,
                total:0
            };

            const weekStart = new Date(week.sunStr);
            for (let i = 0; i < 7; i++) {
                const currentDate = new Date(weekStart);
                currentDate.setDate(currentDate.getDate() + i);
                const dateStr  = currentDate.toISOString().split('T')[0];
                const dayLabel = `${DAY[i]} ${String(currentDate.getDate()).padStart(2,'0')}`;
                const entry    = week.days[dateStr] || getNRData(dateStr);

                weekTotals.sleepM      += entry.scores?.sleep    ?? 0;
                weekTotals.wakeupM     += entry.scores?.wakeup   ?? 0;
                weekTotals.chantingM   += entry.scores?.chanting ?? 0;
                weekTotals.readingM    += entry.scores?.reading  ?? 0;
                weekTotals.hearingM    += entry.scores?.hearing  ?? 0;
                weekTotals.serviceM    += entry.scores?.service  ?? 0;
                weekTotals.notesM      += entry.scores?.notes    ?? 0;
                weekTotals.daySleepM   += entry.scores?.daySleep ?? 0;
                weekTotals.readingMins += entry.readingMinutes   || 0;
                weekTotals.hearingMins += entry.hearingMinutes   || 0;
                weekTotals.serviceMins += entry.serviceMinutes   || 0;
                weekTotals.notesMins   += entry.notesMinutes     || 0;
                weekTotals.daySleepMins+= entry.daySleepMinutes  || 0;
                weekTotals.total       += entry.totalScore       ?? 0;

                dataArray.push([
                    dayLabel,
                    entry.sleepTime    || 'NR',  entry.scores?.sleep    ?? 0,
                    entry.wakeupTime   || 'NR',  entry.scores?.wakeup   ?? 0,
                    entry.chantingTime || 'NR',  entry.scores?.chanting ?? 0,
                    entry.readingMinutes  || 0,  entry.scores?.reading  ?? 0,
                    entry.hearingMinutes  || 0,  entry.scores?.hearing  ?? 0,
                    entry.serviceMinutes  || 0,  entry.scores?.service  ?? 0,
                    entry.notesMinutes    || 0,  entry.scores?.notes    ?? 0,
                    entry.daySleepMinutes || 0,  entry.scores?.daySleep ?? 0,
                    entry.totalScore ?? 0,
                    (entry.dayPercent ?? 0) + '%'
                ]);
            }

            const weekPercent = Math.round((weekTotals.total / 1120) * 100);

            // Weekly total row
            dataArray.push([
                'WEEKLY TOTAL', '',
                weekTotals.sleepM, '', weekTotals.wakeupM, '', weekTotals.chantingM,
                weekTotals.readingMins,  weekTotals.readingM,
                weekTotals.hearingMins,  weekTotals.hearingM,
                weekTotals.serviceMins,  weekTotals.serviceM,
                weekTotals.notesMins,    weekTotals.notesM,
                weekTotals.daySleepMins, weekTotals.daySleepM,
                weekTotals.total, weekPercent + '%'
            ]);

            // Weekly percentage summary row
            dataArray.push([
                `WEEKLY PERCENTAGE: ${weekTotals.total} / 1120 = ${weekPercent}%`,
                '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''
            ]);

            // Blank separator rows between weeks
            if (weekIndex < sortedWeeks.length - 1) {
                dataArray.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
                dataArray.push(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
            }
        });

        const worksheet = XLSX.utils.aoa_to_sheet(dataArray);

        // Merges — week header row and percentage summary row span all 19 columns
        const merges = [];
        let row = 0;
        sortedWeeks.forEach(() => {
            merges.push({ s:{r:row,   c:0}, e:{r:row,   c:18} }); // week header
            merges.push({ s:{r:row+9, c:0}, e:{r:row+9, c:18} }); // summary
            row += 12; // 1 header + 1 col-header + 7 days + 1 total + 1 summary + 2 blank
        });
        worksheet['!merges'] = merges;

        // Column widths (same as original)
        worksheet['!cols'] = [
            {wch:10},{wch:8},{wch:4},{wch:8},{wch:4},{wch:8},{wch:4},
            {wch:10},{wch:4},{wch:10},{wch:4},{wch:10},{wch:4},
            {wch:10},{wch:4},{wch:12},{wch:4},{wch:8},{wch:6}
        ];

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Sadhana_Weekly');

        // ── EXACTLY what the original used ──
        XLSX.writeFile(workbook, `${userName.replace(/\s+/g, '_')}_Sadhana_Weekly.xlsx`);

    } catch (error) {
        console.error('Download Error:', error);
        alert('Download Failed: ' + error.message);
    }
};

window.downloadMasterReport = async () => {
    try {
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded. Please wait a moment and try again.');
            return;
        }

        const usersSnap = await db.collection('users').get();
        const cats      = visibleCategories();
        const allWeeksSet = new Set();
        const userData    = [];

        for (const uDoc of usersSnap.docs) {
            const u = uDoc.data();
            if (!cats.includes(u.level || 'Senior Batch')) continue;
            const sSnap   = await uDoc.ref.collection('sadhana').get();
            const entries = sSnap.docs.map(d => ({ date: d.id, score: d.data().totalScore || 0 }));
            entries.forEach(en => allWeeksSet.add(getWeekInfo(en.date).label));
            userData.push({ user: u, entries });
        }

        // Sort A-Z by name
        userData.sort((a, b) => (a.user.name || '').localeCompare(b.user.name || ''));

        const allWeeks = Array.from(allWeeksSet).sort((a, b) => b.localeCompare(a));
        const MON      = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};

        const rows = [['User Name', 'Position Level', 'Chanting Category', ...allWeeks.map(w => w + ' (%)')]];

        userData.forEach(({ user, entries }) => {
            const userRow = [user.name, user.level || 'Senior Batch', user.chantingCategory || 'Level-1'];
            allWeeks.forEach(wl => {
                const yr   = parseInt(wl.split('_')[1]);
                const pts  = wl.split(' to ')[0].split(' ');
                const wSun = new Date(yr, MON[pts[1]], parseInt(pts[0]));
                let tot = 0;
                for (let i = 0; i < 7; i++) {
                    const c  = new Date(wSun); c.setDate(c.getDate() + i);
                    const ds = c.toISOString().split('T')[0];
                    const en = entries.find(e => e.date === ds);
                    tot += en ? en.score : -35;
                }
                userRow.push(Math.round((tot / 1120) * 100) + '%');
            });
            rows.push(userRow);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Master_Report');

        // ── EXACTLY what the original used ──
        XLSX.writeFile(wb, 'Master_Sadhana_Report.xlsx');

    } catch (err) {
        console.error('Master download error:', err);
        alert('Download Failed: ' + err.message);
    }
};

// ─────────────────────────────────────────────────────────────
// 5. AUTH & NAVIGATION
// ─────────────────────────────────────────────────────────────
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const doc = await db.collection('users').doc(user.uid).get();
        if (doc.exists) {
            userProfile = doc.data();
            const badge = isSuperAdmin() ? '👑 Super Admin' : isCategoryAdmin() ? '🛡️ Admin' : (userProfile.level || 'Senior Batch');
            document.getElementById('user-display-name').textContent = `${userProfile.name} (${badge})`;
            if (isAnyAdmin()) document.getElementById('admin-tab-btn').classList.remove('hidden');
            showSection('dashboard');
            switchTab('sadhana');
            setupDateSelect();
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

window.switchTab = (t) => {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
    document.getElementById(t + '-tab').classList.remove('hidden');
    const btn = document.querySelector(`button[onclick*="switchTab('${t}')"]`);
    if (btn) btn.classList.add('active');
    if (t === 'reports') loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'admin' && isAnyAdmin()) loadAdminPanel();
};

function showSection(sec) {
    ['auth-section','profile-section','dashboard-section'].forEach(s =>
        document.getElementById(s).classList.add('hidden'));
    document.getElementById(sec + '-section').classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────
// 6. REPORTS (personal & modal)
// ─────────────────────────────────────────────────────────────
function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (activeListener) { activeListener(); activeListener = null; }

    activeListener = db.collection('users').doc(userId).collection('sadhana')
        .onSnapshot(snap => {
            const APP_START = '2026-02-12';
            const weeksList = [];
            for (let i = 0; i < 4; i++) {
                const d = new Date(); d.setDate(d.getDate() - i * 7);
                weeksList.push(getWeekInfo(d.toISOString().split('T')[0]));
            }

            const weeks = {};
            weeksList.forEach(w => { weeks[w.label] = { range: w.label, sunStr: w.sunStr, data: [], total: 0 }; });

            snap.forEach(doc => {
                if (doc.id < APP_START) return;
                const data = doc.data();
                const wk   = getWeekInfo(doc.id);
                if (weeks[wk.label]) {
                    weeks[wk.label].data.push({ id: doc.id, ...data });
                    weeks[wk.label].total += data.totalScore || 0;
                }
            });

            weeksList.forEach(wi => {
                const wk = weeks[wi.label];
                let curr = new Date(wi.sunStr);
                for (let i = 0; i < 7; i++) {
                    const ds = curr.toISOString().split('T')[0];
                    if (ds >= APP_START && !wk.data.find(e => e.id === ds)) {
                        const nr = getNRData(ds);
                        wk.data.push(nr);
                        wk.total += nr.totalScore;
                    }
                    curr.setDate(curr.getDate() + 1);
                }
            });

            container.innerHTML = '';
            weeksList.forEach(wi => {
                const wk  = weeks[wi.label];
                const div = document.createElement('div');
                div.className = 'week-card';
                div.innerHTML = `
                    <div class="week-header" onclick="this.nextElementSibling.classList.toggle('hidden')">
                        <span>📅 ${wk.range}</span><strong>Score: ${wk.total} ▼</strong>
                    </div>
                    <div class="week-content hidden" style="overflow-x:auto;">
                        <table class="admin-table">
                        <thead><tr><th>Date</th><th>Bed</th><th>M</th><th>Wake</th><th>M</th><th>Chant</th><th>M</th>
                            <th>Read</th><th>M</th><th>Hear</th><th>M</th><th>Seva</th><th>M</th>
                            <th>Notes</th><th>M</th><th>Day Sleep</th><th>M</th><th>Total</th><th>%</th></tr></thead>
                        <tbody>${
                            wk.data.sort((a,b) => b.id.localeCompare(a.id)).map(e => {
                                const rs = e.sleepTime === 'NR' ? 'style="background:#fff5f5;color:red;"' : '';
                                const cs = v => v < 0 ? 'style="color:red;font-weight:bold;"' : '';
                                return `<tr ${rs}>
                                    <td>${e.id.split('-').slice(1).join('/')}</td>
                                    <td>${e.sleepTime}</td><td ${cs(e.scores?.sleep??0)}>${e.scores?.sleep??0}</td>
                                    <td>${e.wakeupTime}</td><td ${cs(e.scores?.wakeup??0)}>${e.scores?.wakeup??0}</td>
                                    <td>${e.chantingTime}</td><td ${cs(e.scores?.chanting??0)}>${e.scores?.chanting??0}</td>
                                    <td>${e.readingMinutes||0}m</td><td ${cs(e.scores?.reading??0)}>${e.scores?.reading??0}</td>
                                    <td>${e.hearingMinutes||0}m</td><td ${cs(e.scores?.hearing??0)}>${e.scores?.hearing??0}</td>
                                    <td>${e.serviceMinutes||0}m</td><td ${cs(e.scores?.service??0)}>${e.scores?.service??0}</td>
                                    <td>${e.notesMinutes||0}m</td><td ${cs(e.scores?.notes??0)}>${e.scores?.notes??0}</td>
                                    <td>${e.daySleepMinutes||0}m</td><td ${cs(e.scores?.daySleep??0)}>${e.scores?.daySleep??0}</td>
                                    <td ${cs(e.totalScore??0)}>${e.totalScore??0}</td>
                                    <td>${e.dayPercent??0}%</td>
                                </tr>`;
                            }).join('')
                        }</tbody></table>
                    </div>`;
                container.appendChild(div);
            });
        }, err => console.error('Snapshot error:', err));
}

// ─────────────────────────────────────────────────────────────
// 7. SCORING & SADHANA FORM
// ─────────────────────────────────────────────────────────────
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;

    const existing = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (existing.exists) {
        alert(`❌ Sadhana for ${date} already submitted!\n\nEditing is not allowed. Contact admin for corrections.`);
        return;
    }

    const level = userProfile.level || 'Senior Batch';
    const slp   = document.getElementById('sleep-time').value;
    const wak   = document.getElementById('wakeup-time').value;
    const chn   = document.getElementById('chanting-time').value;
    const rMin  = parseInt(document.getElementById('reading-mins').value)       || 0;
    const hMin  = parseInt(document.getElementById('hearing-mins').value)       || 0;
    const sMin  = parseInt(document.getElementById('service-mins')?.value)      || 0;
    const nMin  = parseInt(document.getElementById('notes-mins')?.value)        || 0;
    const dsMin = parseInt(document.getElementById('day-sleep-minutes').value)  || 0;

    const sc = { sleep:-5, wakeup:-5, chanting:-5, reading:-5, hearing:-5, service:-5, notes:-5, daySleep:0 };

    const slpM = t2m(slp, true);
    sc.sleep = slpM<=1350?25:slpM<=1355?20:slpM<=1360?15:slpM<=1365?10:slpM<=1370?5:slpM<=1375?0:-5;

    const wakM = t2m(wak);
    sc.wakeup = wakM<=305?25:wakM<=310?20:wakM<=315?15:wakM<=320?10:wakM<=325?5:wakM<=330?0:-5;

    const chnM = t2m(chn);
    sc.chanting = chnM<=540?25:chnM<=570?20:chnM<=660?15:chnM<=870?10:chnM<=1020?5:chnM<=1140?0:-5;

    sc.daySleep = dsMin <= 60 ? 10 : -5;

    const act = (m, thr) => m>=thr?25:m>=thr-10?20:m>=20?15:m>=15?10:m>=10?5:m>=5?0:-5;
    const isSB = level === 'Senior Batch';
    sc.reading = act(rMin, isSB ? 40 : 30);
    sc.hearing = act(hMin, isSB ? 40 : 30);

    let total = sc.sleep + sc.wakeup + sc.chanting + sc.reading + sc.hearing + sc.daySleep;

    if (isSB) {
        sc.service = sMin>=15?10:sMin>=10?5:sMin>=5?0:-5;
        sc.notes   = nMin>=20?15:nMin>=15?10:nMin>=10?5:nMin>=5?0:-5;
        total += sc.service + sc.notes;
    } else {
        sc.service = act(sMin, 30);
        sc.notes   = 0;
        total += sc.service;
    }

    const dayPercent = Math.round((total / 160) * 100);

    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set({
        sleepTime:slp, wakeupTime:wak, chantingTime:chn,
        readingMinutes:rMin, hearingMinutes:hMin, serviceMinutes:sMin,
        notesMinutes:nMin, daySleepMinutes:dsMin,
        scores:sc, totalScore:total, dayPercent,
        levelAtSubmission:level,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(`✅ Submitted! Score: ${total} (${dayPercent}%)`);
    switchTab('reports');
};

// ─────────────────────────────────────────────────────────────
// 8. ADMIN PANEL
// ─────────────────────────────────────────────────────────────
async function loadAdminPanel() {
    const tableBox  = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    usersList.innerHTML = '<p style="color:#888;text-align:center;padding:20px;">Loading…</p>';
    tableBox.innerHTML  = '<p style="color:#888;text-align:center;padding:20px;">Loading…</p>';

    const weeks = [];
    for (let i = 0; i < 4; i++) {
        const d = new Date(); d.setDate(d.getDate() - i * 7);
        weeks.push(getWeekInfo(d.toISOString().split('T')[0]));
    }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    const cats = visibleCategories();
    const filtered = usersSnap.docs
        .filter(doc => cats.includes(doc.data().level || 'Senior Batch'))
        .sort((a,b) => (a.data().name||'').localeCompare(b.data().name||''));

    let tHtml = `<table class="admin-table"><thead><tr>
        <th style="text-align:left;min-width:90px">User</th>
        <th style="font-size:11px">Position</th>
        <th style="font-size:11px">Chanting</th>
        ${weeks.map(w => `<th style="font-size:11px">${w.label.split('_')[0]}</th>`).join('')}
    </tr></thead><tbody>`;

    usersList.innerHTML = '';

    // Info banner
    const banner = document.createElement('div');
    banner.style = `padding:10px 14px;border-radius:8px;margin-bottom:12px;font-size:13px;
        background:${isSuperAdmin()?"#f3e8ff":"#e8f4fd"};color:${isSuperAdmin()?"#7e22ce":"#1d4ed8"};`;
    banner.innerHTML = isSuperAdmin()
        ? '👑 <strong>Super Admin</strong> — Full access to all categories and role management'
        : `🛡️ <strong>Category Admin</strong> — Managing <strong>${userProfile.adminCategory}</strong>`;
    usersList.appendChild(banner);

    for (const uDoc of filtered) {
        const u     = uDoc.data();
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const ents  = sSnap.docs.map(d => ({ date: d.id, score: d.data().totalScore || 0 }));

        // Table row
        tHtml += `<tr>
            <td style="text-align:left;font-weight:500">${u.name}</td>
            <td style="font-size:11px">${(u.level||'SB').replace(' Coordinator','').replace('Senior Batch','SB')}</td>
            <td style="font-size:11px">${u.chantingCategory||'N/A'}</td>`;
        weeks.forEach(w => {
            let tot = 0, curr = new Date(w.sunStr);
            for (let i=0;i<7;i++) {
                const ds=curr.toISOString().split('T')[0];
                const en=ents.find(e=>e.date===ds);
                tot+=en?en.score:-35;
                curr.setDate(curr.getDate()+1);
            }
            const pct = Math.round((tot/1120)*100);
            tHtml += `<td style="font-weight:bold;color:${pct<0?'#dc2626':pct<50?'#d97706':'#16a34a'}">${pct}%</td>`;
        });
        tHtml += '</tr>';

        // User card
        const card = document.createElement('div');
        card.style = 'background:white;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:8px;';

        let badge = '';
        if (u.role==='superAdmin') badge=`<span style="background:#7e22ce;color:white;padding:1px 8px;border-radius:10px;font-size:11px;margin-left:6px;">👑 Super Admin</span>`;
        else if (u.role==='admin') badge=`<span style="background:#d97706;color:white;padding:1px 8px;border-radius:10px;font-size:11px;margin-left:6px;">🛡️ ${u.adminCategory||''}</span>`;

        const safe = (u.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        let roleDropdown = '';
        if (isSuperAdmin()) {
            let opts = '<option value="" disabled selected>Change Role…</option>';
            if (u.role === 'superAdmin') {
                opts += '<option value="demote">🚫 Revoke Super Admin</option>';
            } else if (u.role === 'admin') {
                opts += `<option value="superAdmin">👑 Make Super Admin</option>
                    <option value="cat:Senior Batch">🛡️ Cat: Senior Batch</option>
                    <option value="cat:IGF & IYF Coordinator">🛡️ Cat: IGF & IYF</option>
                    <option value="cat:ICF Coordinator">🛡️ Cat: ICF</option>
                    <option value="demote">🚫 Revoke Admin</option>`;
            } else {
                opts += `<option value="superAdmin">👑 Make Super Admin</option>
                    <option value="cat:Senior Batch">🛡️ Cat: Senior Batch</option>
                    <option value="cat:IGF & IYF Coordinator">🛡️ Cat: IGF & IYF</option>
                    <option value="cat:ICF Coordinator">🛡️ Cat: ICF</option>`;
            }
            roleDropdown = `<select onchange="handleRoleDropdown('${uDoc.id}',this)"
                style="padding:7px 10px;border-radius:8px;border:1px solid #d1d5db;font-size:12px;
                       margin:0;height:38px;background:white;cursor:pointer;flex:1;min-width:155px;max-width:210px;">
                ${opts}
            </select>`;
        }

        card.innerHTML = `
            <div style="margin-bottom:8px;">
                <span style="font-weight:700;font-size:15px;">${u.name}</span>${badge}<br>
                <span style="font-size:12px;color:#6b7280;">${u.level||'Senior Batch'} · ${u.chantingCategory||'N/A'} · ${u.exactRounds||'?'} rounds</span>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
                <button onclick="openUserModal('${uDoc.id}','${safe}')" title="View History"
                    style="width:38px;height:38px;padding:0;margin:0;border-radius:8px;background:#3b82f6;font-size:18px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">📋</button>
                <button onclick="downloadUserExcel('${uDoc.id}','${safe}')" title="Download Excel"
                    style="width:38px;height:38px;padding:0;margin:0;border-radius:8px;background:#16a34a;font-size:18px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;">📥</button>
                ${roleDropdown}
            </div>`;
        usersList.appendChild(card);
    }

    tableBox.innerHTML = tHtml + '</tbody></table>';
}

window.handleRoleDropdown = async (uid, sel) => {
    const val = sel.value;
    sel.value = '';
    if (!val) return;

    let newRole, cat = null, msg = '';
    if (val === 'superAdmin')      { newRole='superAdmin'; msg='👑 Make this user SUPER ADMIN?\nFull access to all categories.'; }
    else if (val.startsWith('cat:')) { newRole='admin'; cat=val.slice(4); msg=`🛡️ Assign Category Admin for:\n"${cat}"?\nOnly this category will be visible to them.`; }
    else if (val === 'demote')     { newRole='user';  msg='🚫 Revoke all admin access and make regular user?'; }
    else return;

    if (!confirm(msg)) return;
    if (!confirm('✅ Final confirmation — sure?')) return;

    await db.collection('users').doc(uid).update({ role: newRole, adminCategory: cat });
    alert('✅ Role updated!');
    loadAdminPanel();
};

// ─────────────────────────────────────────────────────────────
// 9. DATE SELECT & PROFILE FORM
// ─────────────────────────────────────────────────────────────
function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    if (!s) return;
    s.innerHTML = '';
    for (let i = 0; i < 2; i++) {
        const d  = new Date(); d.setDate(d.getDate() - i);
        const ld = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const opt = document.createElement('option');
        opt.value = ld; opt.textContent = ld;
        s.appendChild(opt);
    }
    const notesArea = document.getElementById('notes-area');
    if (notesArea) notesArea.classList.toggle('hidden', userProfile?.level !== 'Senior Batch');
}

document.getElementById('profile-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        name:             document.getElementById('profile-name').value,
        level:            document.getElementById('profile-level').value,
        chantingCategory: document.getElementById('profile-chanting').value,
        exactRounds:      document.getElementById('profile-exact-rounds').value,
        role:             userProfile?.role || 'user'
    };

    const newPwd  = (document.getElementById('new-password')?.value  || '').trim();
    const confPwd = (document.getElementById('confirm-password')?.value || '').trim();

    if (newPwd) {
        if (newPwd.length < 6)  { alert('❌ Password must be at least 6 characters.'); return; }
        if (newPwd !== confPwd) { alert('❌ Passwords do not match!'); return; }
        if (!confirm('🔑 Confirm password change?\nMake sure you remember the new one.')) return;
    }

    await db.collection('users').doc(currentUser.uid).set(data, { merge: true });

    if (newPwd) {
        try {
            await currentUser.updatePassword(newPwd);
            alert('✅ Profile saved & password changed!');
        } catch (err) {
            if (err.code === 'auth/requires-recent-login') {
                alert('⚠️ Profile saved.\nFor security, logout & log back in before changing password.');
            } else {
                alert('⚠️ Profile saved but password change failed:\n' + err.message);
            }
        }
    } else {
        alert('✅ Profile saved!');
    }
    location.reload();
};

// ─────────────────────────────────────────────────────────────
// 10. MISC BINDINGS
// ─────────────────────────────────────────────────────────────
document.getElementById('login-form').onsubmit = (e) => {
    e.preventDefault();
    auth.signInWithEmailAndPassword(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
    ).catch(err => alert(err.message));
};

document.getElementById('logout-btn').onclick = () => auth.signOut();

window.openUserModal = (id, name) => {
    document.getElementById('user-report-modal').classList.remove('hidden');
    document.getElementById('modal-user-name').textContent = name;
    loadReports(id, 'modal-report-container');
};
window.closeUserModal = () => document.getElementById('user-report-modal').classList.add('hidden');

window.openProfileEdit = () => {
    document.getElementById('profile-name').value         = userProfile.name             || '';
    document.getElementById('profile-level').value        = userProfile.level            || 'Senior Batch';
    document.getElementById('profile-chanting').value     = userProfile.chantingCategory || '';
    document.getElementById('profile-exact-rounds').value = userProfile.exactRounds      || '';
    if (document.getElementById('new-password'))     document.getElementById('new-password').value     = '';
    if (document.getElementById('confirm-password')) document.getElementById('confirm-password').value = '';
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
};
