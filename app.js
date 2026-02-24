// ═══════════════════════════════════════════════════════════
// 1. FIREBASE SETUP
// ═══════════════════════════════════════════════════════════
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
db.settings({ experimentalAutoDetectLongPolling: true, merge: true });

let currentUser   = null;
let userProfile   = null;
let activeListener= null;

// ═══════════════════════════════════════════════════════════
// 2. ROLE HELPERS
// ═══════════════════════════════════════════════════════════
const isSuperAdmin    = () => userProfile?.role === 'superAdmin';
const isCategoryAdmin = () => userProfile?.role === 'admin';
const isAnyAdmin      = () => isSuperAdmin() || isCategoryAdmin();
const visibleCategories = () => {
    if (isSuperAdmin()) return ['Senior Batch','IGF & IYF Coordinator','ICF Coordinator'];
    if (isCategoryAdmin()) return [userProfile.adminCategory];
    return [];
};

// ═══════════════════════════════════════════════════════════
// 3. HELPERS
// ═══════════════════════════════════════════════════════════
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

function localDateStr(offsetDays = 0) {
    const d = new Date(); d.setDate(d.getDate() - offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getNRData(date) {
    return {
        id: date, totalScore: -35, dayPercent: -22,
        sleepTime:'NR', wakeupTime:'NR', chantingTime:'NR',
        readingMinutes:0, hearingMinutes:0, serviceMinutes:0, notesMinutes:0, daySleepMinutes:0,
        scores:{ sleep:-5, wakeup:-5, chanting:-5, reading:-5, hearing:-5, service:-5, notes:-5, daySleep:0 }
    };
}

// ═══════════════════════════════════════════════════════════
// 4. EXCEL DOWNLOAD
// ═══════════════════════════════════════════════════════════
function xlsxSave(wb, filename) {
    // Primary: XLSX.writeFile (works on desktop & https hosted)
    // Fallback: Blob download (works on Android/mobile browsers)
    try {
        XLSX.writeFile(wb, filename);
    } catch (e) {
        const arr  = XLSX.write(wb, { bookType:'xlsx', type:'array' });
        const blob = new Blob([arr], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = filename; a.style.display = 'none';
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 2500);
    }
}

window.downloadUserExcel = async (userId, userName) => {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded. Please refresh.'); return; }
    try {
        const snap = await db.collection('users').doc(userId).collection('sadhana').get();
        if (snap.empty) { alert('No sadhana data found for this user.'); return; }

        const weeksData = {};
        snap.forEach(doc => {
            const wi = getWeekInfo(doc.id);
            if (!weeksData[wi.sunStr]) weeksData[wi.sunStr] = { label:wi.label, sunStr:wi.sunStr, days:{} };
            weeksData[wi.sunStr].days[doc.id] = doc.data();
        });

        const sortedWeeks = Object.keys(weeksData).sort((a,b) => b.localeCompare(a));
        const DAY = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
        const dataArray = [];

        sortedWeeks.forEach((sunStr, wi) => {
            const week = weeksData[sunStr];
            dataArray.push([`WEEK: ${week.label}`,'','','','','','','','','','','','','','','','','','']);
            dataArray.push(['Date','Bed','M','Wake','M','Chant','M','Read(m)','M','Hear(m)','M','Seva(m)','M','Notes(m)','M','Day Sleep(m)','M','Total','%']);

            let T = { sl:0,wu:0,ch:0,rd:0,hr:0,sv:0,nt:0,ds:0, rdm:0,hrm:0,svm:0,ntm:0,dsm:0, tot:0 };
            const wStart = new Date(week.sunStr);

            for (let i = 0; i < 7; i++) {
                const cd  = new Date(wStart); cd.setDate(cd.getDate()+i);
                const ds  = cd.toISOString().split('T')[0];
                const lbl = `${DAY[i]} ${String(cd.getDate()).padStart(2,'0')}`;
                const e   = week.days[ds] || getNRData(ds);

                T.sl+=e.scores?.sleep??0; T.wu+=e.scores?.wakeup??0; T.ch+=e.scores?.chanting??0;
                T.rd+=e.scores?.reading??0; T.hr+=e.scores?.hearing??0; T.sv+=e.scores?.service??0;
                T.nt+=e.scores?.notes??0; T.ds+=e.scores?.daySleep??0;
                T.rdm+=e.readingMinutes||0; T.hrm+=e.hearingMinutes||0;
                T.svm+=e.serviceMinutes||0; T.ntm+=e.notesMinutes||0;
                T.dsm+=e.daySleepMinutes||0; T.tot+=e.totalScore??0;

                dataArray.push([lbl,
                    e.sleepTime||'NR',    e.scores?.sleep??0,
                    e.wakeupTime||'NR',   e.scores?.wakeup??0,
                    e.chantingTime||'NR', e.scores?.chanting??0,
                    e.readingMinutes||0,  e.scores?.reading??0,
                    e.hearingMinutes||0,  e.scores?.hearing??0,
                    e.serviceMinutes||0,  e.scores?.service??0,
                    e.notesMinutes||0,    e.scores?.notes??0,
                    e.daySleepMinutes||0, e.scores?.daySleep??0,
                    e.totalScore??0, (e.dayPercent??0)+'%'
                ]);
            }

            const pct = Math.round((T.tot/1120)*100);
            dataArray.push(['WEEKLY TOTAL','',T.sl,'',T.wu,'',T.ch, T.rdm,T.rd, T.hrm,T.hr, T.svm,T.sv, T.ntm,T.nt, T.dsm,T.ds, T.tot, pct+'%']);
            dataArray.push([`WEEKLY PERCENTAGE: ${T.tot} / 1120 = ${pct}%`,'','','','','','','','','','','','','','','','','','']);
            if (wi < sortedWeeks.length-1) { dataArray.push([]); dataArray.push([]); }
        });

        const ws = XLSX.utils.aoa_to_sheet(dataArray);
        const merges = []; let row = 0;
        sortedWeeks.forEach(() => {
            merges.push({s:{r:row,c:0},e:{r:row,c:18}});
            merges.push({s:{r:row+9,c:0},e:{r:row+9,c:18}});
            row += 12;
        });
        ws['!merges'] = merges;
        ws['!cols'] = [10,8,4,8,4,8,4,10,4,10,4,10,4,10,4,12,4,8,6].map(w=>({wch:w}));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Sadhana_Weekly');
        xlsxSave(wb, `${userName.replace(/\s+/g,'_')}_Sadhana_Weekly.xlsx`);

    } catch (err) { console.error(err); alert('Download Failed: ' + err.message); }
};

window.downloadMasterReport = async () => {
    if (typeof XLSX === 'undefined') { alert('Excel library not loaded. Please refresh.'); return; }
    try {
        const usersSnap = await db.collection('users').get();
        const cats = visibleCategories();
        const userData = []; const weekSet = new Set();

        for (const uDoc of usersSnap.docs) {
            const u = uDoc.data();
            if (!cats.includes(u.level||'Senior Batch')) continue;
            const sSnap = await uDoc.ref.collection('sadhana').get();
            const entries = sSnap.docs.map(d=>({date:d.id, score:d.data().totalScore||0}));
            entries.forEach(en => weekSet.add(getWeekInfo(en.date).label));
            userData.push({ user:u, entries });
        }
        userData.sort((a,b)=>(a.user.name||'').localeCompare(b.user.name||''));

        const allWeeks = Array.from(weekSet).sort((a,b)=>b.localeCompare(a));
        const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
        const rows = [['User Name','Position Level','Chanting Category',...allWeeks.map(w=>w+' (%)')]];

        userData.forEach(({user,entries}) => {
            const row = [user.name, user.level||'Senior Batch', user.chantingCategory||'Level-1'];
            allWeeks.forEach(wl => {
                const yr = parseInt(wl.split('_')[1]);
                const pts = wl.split(' to ')[0].split(' ');
                const wSun = new Date(yr, MON[pts[1]], parseInt(pts[0]));
                let tot = 0;
                for (let i=0;i<7;i++) {
                    const c=new Date(wSun); c.setDate(c.getDate()+i);
                    const ds=c.toISOString().split('T')[0];
                    const en=entries.find(e=>e.date===ds);
                    tot+=en?en.score:-35;
                }
                row.push(Math.round((tot/1120)*100)+'%');
            });
            rows.push(row);
        });

        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Master_Report');
        xlsxSave(wb, 'Master_Sadhana_Report.xlsx');

    } catch (err) { console.error(err); alert('Download Failed: ' + err.message); }
};

// ═══════════════════════════════════════════════════════════
// 5. AUTH
// ═══════════════════════════════════════════════════════════
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const docSnap = await db.collection('users').doc(user.uid).get();
        if (docSnap.exists) {
            userProfile = docSnap.data();
            // If profile incomplete (no level set), send to profile page
            if (!userProfile.level) {
                document.getElementById('profile-title').textContent    = 'Complete Your Profile';
                document.getElementById('profile-subtitle').textContent = 'Please fill in your details to continue';
                document.getElementById('profile-name').value           = userProfile.name || '';
                showSection('profile');
                return;
            }
            initDashboard();
        } else {
            showSection('profile');
        }
    } else {
        showSection('auth');
    }
});

function initDashboard() {
    const roleLabel = isSuperAdmin() ? '👑 Super Admin'
                    : isCategoryAdmin() ? `🛡️ Admin — ${userProfile.adminCategory}`
                    : (userProfile.level || 'Senior Batch');
    document.getElementById('user-display-name').textContent = userProfile.name;
    document.getElementById('user-role-display').textContent = roleLabel;
    if (isAnyAdmin()) document.getElementById('admin-tab-btn').classList.remove('hidden');
    showSection('dashboard');
    switchTab('sadhana');
    setupDateSelect();
}

// ═══════════════════════════════════════════════════════════
// 6. NAVIGATION
// ═══════════════════════════════════════════════════════════
window.switchTab = (t) => {
    document.querySelectorAll('.tab-panel').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b  => b.classList.remove('active'));
    const panel = document.getElementById(t + '-panel');
    if (panel) panel.classList.add('active');
    const btn = document.querySelector(`.tab-btn[onclick*="'${t}'"]`);
    if (btn) btn.classList.add('active');

    if (t === 'reports')  loadReports(currentUser.uid, 'weekly-reports-container');
    if (t === 'progress') { loadMyProgressChart('daily'); }
    if (t === 'admin' && isAnyAdmin()) loadAdminPanel();
};

function showSection(sec) {
    ['auth-section','profile-section','dashboard-section'].forEach(id =>
        document.getElementById(id).classList.add('hidden'));
    document.getElementById(sec+'-section').classList.remove('hidden');
}

// ═══════════════════════════════════════════════════════════
// 7. REPORTS TABLE
// ═══════════════════════════════════════════════════════════
const APP_START = '2026-02-12';

function loadReports(userId, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (activeListener) { activeListener(); activeListener = null; }

    activeListener = db.collection('users').doc(userId).collection('sadhana')
        .onSnapshot(snap => {
            const weeksList = [];
            for (let i=0;i<4;i++) {
                const d = new Date(); d.setDate(d.getDate()-i*7);
                weeksList.push(getWeekInfo(d.toISOString().split('T')[0]));
            }
            const weeks = {};
            weeksList.forEach(w => { weeks[w.label] = {range:w.label, sunStr:w.sunStr, data:[], total:0}; });

            snap.forEach(doc => {
                if (doc.id < APP_START) return;
                const data = doc.data(); const wk = getWeekInfo(doc.id);
                if (weeks[wk.label]) { weeks[wk.label].data.push({id:doc.id,...data}); weeks[wk.label].total+=data.totalScore||0; }
            });

            weeksList.forEach(wi => {
                const wk = weeks[wi.label]; let curr = new Date(wi.sunStr);
                for (let i=0;i<7;i++) {
                    const ds = curr.toISOString().split('T')[0];
                    if (ds>=APP_START && !wk.data.find(e=>e.id===ds)) { const nr=getNRData(ds); wk.data.push(nr); wk.total+=nr.totalScore; }
                    curr.setDate(curr.getDate()+1);
                }
            });

            container.innerHTML = '';
            weeksList.forEach(wi => {
                const wk  = weeks[wi.label];
                const div = document.createElement('div'); div.className='week-card';
                const bodyId = 'wb-'+wi.sunStr;
                div.innerHTML = `
                    <div class="week-header" onclick="document.getElementById('${bodyId}').classList.toggle('open')">
                        <span>📅 ${wk.range}</span>
                        <strong style="color:${wk.total<0?'#dc2626':wk.total<300?'#d97706':'#16a34a'}">Score: ${wk.total} ▼</strong>
                    </div>
                    <div class="week-body" id="${bodyId}">
                        <table class="data-table">
                        <thead><tr><th>Date</th><th>Bed</th><th>M</th><th>Wake</th><th>M</th><th>Chant</th><th>M</th>
                            <th>Read</th><th>M</th><th>Hear</th><th>M</th><th>Seva</th><th>M</th>
                            <th>Notes</th><th>M</th><th>Day Sleep</th><th>M</th><th>Total</th><th>%</th></tr></thead>
                        <tbody>${wk.data.sort((a,b)=>b.id.localeCompare(a.id)).map(e=>{
                            const nr = e.sleepTime==='NR';
                            const rs = nr?'style="background:#fff5f5;color:#dc2626;"':'';
                            const cs = v=>v<0?'style="color:#dc2626;font-weight:700;"':'';
                            return `<tr ${rs}><td>${e.id.split('-').slice(1).join('/')}</td>
                                <td>${e.sleepTime}</td><td ${cs(e.scores?.sleep??0)}>${e.scores?.sleep??0}</td>
                                <td>${e.wakeupTime}</td><td ${cs(e.scores?.wakeup??0)}>${e.scores?.wakeup??0}</td>
                                <td>${e.chantingTime}</td><td ${cs(e.scores?.chanting??0)}>${e.scores?.chanting??0}</td>
                                <td>${e.readingMinutes||0}m</td><td ${cs(e.scores?.reading??0)}>${e.scores?.reading??0}</td>
                                <td>${e.hearingMinutes||0}m</td><td ${cs(e.scores?.hearing??0)}>${e.scores?.hearing??0}</td>
                                <td>${e.serviceMinutes||0}m</td><td ${cs(e.scores?.service??0)}>${e.scores?.service??0}</td>
                                <td>${e.notesMinutes||0}m</td><td ${cs(e.scores?.notes??0)}>${e.scores?.notes??0}</td>
                                <td>${e.daySleepMinutes||0}m</td><td ${cs(e.scores?.daySleep??0)}>${e.scores?.daySleep??0}</td>
                                <td ${cs(e.totalScore??0)}>${e.totalScore??0}</td><td>${e.dayPercent??0}%</td></tr>`;
                        }).join('')}</tbody></table>
                    </div>`;
                container.appendChild(div);
            });
        }, err => console.error('Snapshot error:', err));
}

// ═══════════════════════════════════════════════════════════
// 8. PROGRESS CHARTS
// ═══════════════════════════════════════════════════════════
let myChartInstance = null;
let modalChartInstance = null;
let progressModalUserId = null;
let progressModalUserName = null;

async function fetchChartData(userId, view) {
    const snap = await db.collection('users').doc(userId).collection('sadhana').orderBy(firebase.firestore.FieldPath.documentId()).get();
    const allEntries = [];
    snap.forEach(doc => { if (doc.id >= APP_START) allEntries.push({ date: doc.id, score: doc.data().totalScore || 0 }); });

    if (view === 'daily') {
        // Last 28 days
        const labels = [], data = [];
        for (let i = 27; i >= 0; i--) {
            const ds = localDateStr(i);
            if (ds < APP_START) continue;
            const entry = allEntries.find(e => e.date === ds);
            labels.push(ds.split('-').slice(1).join('/'));
            data.push(entry ? entry.score : -35);
        }
        return { labels, data, label:'Daily Score', max:160, color:'#3498db' };
    }

    if (view === 'weekly') {
        const labels = [], data = [];
        for (let i = 11; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i*7);
            const wi = getWeekInfo(d.toISOString().split('T')[0]);
            if (wi.sunStr < APP_START) continue;
            let tot = 0; let curr = new Date(wi.sunStr);
            for (let j=0;j<7;j++) {
                const ds = curr.toISOString().split('T')[0];
                const en = allEntries.find(e=>e.date===ds);
                tot += en ? en.score : -35;
                curr.setDate(curr.getDate()+1);
            }
            labels.push(wi.label.split('_')[0].split(' to ')[0]);
            data.push(tot);
        }
        return { labels, data, label:'Weekly Score', max:1120, color:'#27ae60' };
    }

    if (view === 'monthly') {
        const monthMap = {};
        allEntries.forEach(en => {
            const ym = en.date.substring(0,7);
            monthMap[ym] = (monthMap[ym]||0) + en.score;
        });
        const sorted = Object.keys(monthMap).sort();
        const labels = sorted.map(ym => { const [y,m]=ym.split('-'); return `${new Date(y,m-1).toLocaleString('en-GB',{month:'short'})} ${y}`; });
        return { labels, data: sorted.map(k=>monthMap[k]), label:'Monthly Score', max:null, color:'#8b5cf6' };
    }
}

function renderChart(canvasId, chartData, existingInstance) {
    const ctx = document.getElementById(canvasId).getContext('2d');
    if (existingInstance) existingInstance.destroy();
    return new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: chartData.label,
                data: chartData.data,
                borderColor: chartData.color,
                backgroundColor: chartData.color + '22',
                borderWidth: 2.5,
                pointRadius: 4,
                pointHoverRadius: 6,
                fill: true,
                tension: 0.35
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ` Score: ${ctx.parsed.y}${chartData.max ? ' / ' + chartData.max : ''}`
                    }
                }
            },
            scales: {
                x: { ticks: { font:{size:10}, maxRotation:45 }, grid:{display:false} },
                y: {
                    ticks: { font:{size:11} },
                    grid:  { color:'#f0f0f0' },
                    suggestedMin: chartData.max ? -chartData.max * 0.15 : undefined,
                    suggestedMax: chartData.max || undefined
                }
            }
        }
    });
}

// Personal progress tab
async function loadMyProgressChart(view) {
    const data = await fetchChartData(currentUser.uid, view);
    myChartInstance = renderChart('my-progress-chart', data, myChartInstance);
}

window.setChartView = async (view, btn) => {
    document.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    await loadMyProgressChart(view);
};

// Admin progress modal
window.openProgressModal = async (userId, userName) => {
    progressModalUserId   = userId;
    progressModalUserName = userName;
    document.getElementById('progress-modal-title').textContent = `📈 ${userName} — Progress`;
    document.getElementById('progress-modal').classList.remove('hidden');
    document.querySelectorAll('#progress-modal-tabs .chart-tab-btn').forEach((b,i) => b.classList.toggle('active', i===0));
    const data = await fetchChartData(userId, 'daily');
    modalChartInstance = renderChart('modal-progress-chart', data, modalChartInstance);
};

window.closeProgressModal = () => {
    document.getElementById('progress-modal').classList.add('hidden');
    if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
};

window.setModalChartView = async (view, btn) => {
    document.querySelectorAll('#progress-modal-tabs .chart-tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const data = await fetchChartData(progressModalUserId, view);
    modalChartInstance = renderChart('modal-progress-chart', data, modalChartInstance);
};

// ═══════════════════════════════════════════════════════════
// 9. SADHANA FORM SCORING
// ═══════════════════════════════════════════════════════════
document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const date = document.getElementById('sadhana-date').value;
    const existing = await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).get();
    if (existing.exists) { alert(`❌ Sadhana for ${date} already submitted! Contact admin for corrections.`); return; }

    const level = userProfile.level || 'Senior Batch';
    const slp   = document.getElementById('sleep-time').value;
    const wak   = document.getElementById('wakeup-time').value;
    const chn   = document.getElementById('chanting-time').value;
    const rMin  = parseInt(document.getElementById('reading-mins').value)||0;
    const hMin  = parseInt(document.getElementById('hearing-mins').value)||0;
    const sMin  = parseInt(document.getElementById('service-mins')?.value)||0;
    const nMin  = parseInt(document.getElementById('notes-mins')?.value)||0;
    const dsMin = parseInt(document.getElementById('day-sleep-minutes').value)||0;

    const sc = {sleep:-5,wakeup:-5,chanting:-5,reading:-5,hearing:-5,service:-5,notes:-5,daySleep:0};
    const slpM = t2m(slp,true);
    sc.sleep = slpM<=1350?25:slpM<=1355?20:slpM<=1360?15:slpM<=1365?10:slpM<=1370?5:slpM<=1375?0:-5;
    const wakM = t2m(wak);
    sc.wakeup = wakM<=305?25:wakM<=310?20:wakM<=315?15:wakM<=320?10:wakM<=325?5:wakM<=330?0:-5;
    const chnM = t2m(chn);
    sc.chanting = chnM<=540?25:chnM<=570?20:chnM<=660?15:chnM<=870?10:chnM<=1020?5:chnM<=1140?0:-5;
    sc.daySleep = dsMin<=60?10:-5;

    const act=(m,thr)=>m>=thr?25:m>=thr-10?20:m>=20?15:m>=15?10:m>=10?5:m>=5?0:-5;
    const isSB = level==='Senior Batch';
    sc.reading=act(rMin,isSB?40:30); sc.hearing=act(hMin,isSB?40:30);
    let total=sc.sleep+sc.wakeup+sc.chanting+sc.reading+sc.hearing+sc.daySleep;

    if (isSB) { sc.service=sMin>=15?10:sMin>=10?5:sMin>=5?0:-5; sc.notes=nMin>=20?15:nMin>=15?10:nMin>=10?5:nMin>=5?0:-5; total+=sc.service+sc.notes; }
    else       { sc.service=act(sMin,30); sc.notes=0; total+=sc.service; }

    const dayPercent=Math.round((total/160)*100);
    await db.collection('users').doc(currentUser.uid).collection('sadhana').doc(date).set({
        sleepTime:slp,wakeupTime:wak,chantingTime:chn,
        readingMinutes:rMin,hearingMinutes:hMin,serviceMinutes:sMin,notesMinutes:nMin,daySleepMinutes:dsMin,
        scores:sc,totalScore:total,dayPercent,levelAtSubmission:level,
        submittedAt:firebase.firestore.FieldValue.serverTimestamp()
    });
    alert(`✅ Submitted! Score: ${total} (${dayPercent}%)`);
    switchTab('reports');
};

// ═══════════════════════════════════════════════════════════
// 10. ADMIN PANEL
// ═══════════════════════════════════════════════════════════
async function loadAdminPanel() {
    const tableBox  = document.getElementById('admin-comparative-reports-container');
    const usersList = document.getElementById('admin-users-list');
    tableBox.innerHTML  = '<p style="color:#aaa;text-align:center;padding:20px;">Loading…</p>';
    usersList.innerHTML = '<p style="color:#aaa;text-align:center;padding:20px;">Loading…</p>';

    const weeks = [];
    for (let i=0;i<4;i++) { const d=new Date(); d.setDate(d.getDate()-i*7); weeks.push(getWeekInfo(d.toISOString().split('T')[0])); }
    weeks.reverse();

    const usersSnap = await db.collection('users').get();
    const cats = visibleCategories();
    const filtered = usersSnap.docs
        .filter(doc => cats.includes(doc.data().level||'Senior Batch'))
        .sort((a,b)=>(a.data().name||'').localeCompare(b.data().name||''));

    // Comparative table
    let tHtml = `<table class="data-table"><thead><tr>
        <th style="text-align:left;min-width:100px">User</th>
        <th>Level</th><th>Chanting</th>
        ${weeks.map(w=>`<th>${w.label.split('_')[0]}</th>`).join('')}
    </tr></thead><tbody>`;

    usersList.innerHTML = '';

    // Banner
    const banner = document.createElement('div');
    banner.className = `info-banner ${isSuperAdmin()?'banner-purple':'banner-blue'}`;
    banner.innerHTML = isSuperAdmin()
        ? '👑 <strong>Super Admin</strong> — All categories, full role management'
        : `🛡️ <strong>Category Admin</strong> — Managing: <strong>${userProfile.adminCategory}</strong>`;
    usersList.appendChild(banner);

    for (const uDoc of filtered) {
        const u     = uDoc.data();
        const sSnap = await uDoc.ref.collection('sadhana').get();
        const ents  = sSnap.docs.map(d=>({date:d.id,score:d.data().totalScore||0}));

        // Table row
        tHtml += `<tr>
            <td style="font-weight:600">${u.name}</td>
            <td style="font-size:11px">${(u.level||'SB').replace(' Coordinator','').replace('Senior Batch','SB')}</td>
            <td style="font-size:11px">${u.chantingCategory||'N/A'}</td>`;
        weeks.forEach(w => {
            let tot=0; let curr=new Date(w.sunStr);
            for (let i=0;i<7;i++){const ds=curr.toISOString().split('T')[0];const en=ents.find(e=>e.date===ds);tot+=en?en.score:-35;curr.setDate(curr.getDate()+1);}
            const pct=Math.round((tot/1120)*100);
            tHtml+=`<td style="font-weight:700;color:${pct<0?'#dc2626':pct<50?'#d97706':'#16a34a'}">${pct}%</td>`;
        });
        tHtml += '</tr>';

        // User card
        const card = document.createElement('div');
        card.className = 'user-card';

        let badge = '';
        if (u.role==='superAdmin') badge=`<span class="role-badge" style="background:#7e22ce;color:white;">👑 Super Admin</span>`;
        else if (u.role==='admin') badge=`<span class="role-badge" style="background:#d97706;color:white;">🛡️ ${u.adminCategory||''}</span>`;

        const safe = (u.name||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");

        // Role dropdown (super admin only)
        let roleDropdown = '';
        if (isSuperAdmin()) {
            let opts = '<option value="" disabled selected>Change Role…</option>';
            if (u.role==='superAdmin') {
                opts += '<option value="demote">🚫 Revoke Super Admin</option>';
            } else if (u.role==='admin') {
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
                style="padding:6px 10px;border-radius:8px;border:1px solid #ddd;font-size:12px;height:34px;background:white;cursor:pointer;flex:1;min-width:150px;max-width:200px;margin:0;">
                ${opts}</select>`;
        }

        card.innerHTML = `
            <div class="user-card-top">
                <span class="user-name">${u.name}</span>${badge}
                <div class="user-meta">${u.level||'Senior Batch'} · ${u.chantingCategory||'N/A'} · ${u.exactRounds||'?'} rounds</div>
            </div>
            <div class="user-actions">
                <button onclick="openUserModal('${uDoc.id}','${safe}')"
                    class="btn-primary btn-sm">History</button>
                <button onclick="downloadUserExcel('${uDoc.id}','${safe}')"
                    class="btn-success btn-sm">Excel</button>
                <button onclick="openProgressModal('${uDoc.id}','${safe}')"
                    class="btn-purple btn-sm">Progress</button>
                ${roleDropdown}
            </div>`;
        usersList.appendChild(card);
    }
    tableBox.innerHTML = tHtml + '</tbody></table>';
}

window.handleRoleDropdown = async (uid, sel) => {
    const val = sel.value; sel.value='';
    if (!val) return;
    let newRole, cat=null, msg='';
    if (val==='superAdmin')         { newRole='superAdmin'; msg='👑 Make this user SUPER ADMIN?\nFull access to all categories.'; }
    else if (val.startsWith('cat:')){ newRole='admin'; cat=val.slice(4); msg=`🛡️ Assign as Category Admin for:\n"${cat}"?`; }
    else if (val==='demote')        { newRole='user'; msg='🚫 Revoke all admin access?'; }
    else return;
    if (!confirm(msg)) return;
    if (!confirm('Final confirmation?')) return;
    await db.collection('users').doc(uid).update({ role:newRole, adminCategory:cat });
    alert('✅ Role updated!');
    loadAdminPanel();
};

// ═══════════════════════════════════════════════════════════
// 11. DATE SELECT & PROFILE FORM
// ═══════════════════════════════════════════════════════════
function setupDateSelect() {
    const s = document.getElementById('sadhana-date');
    if (!s) return;
    s.innerHTML = '';
    for (let i=0;i<2;i++) {
        const opt = document.createElement('option');
        opt.value = opt.textContent = localDateStr(i);
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
    await db.collection('users').doc(currentUser.uid).set(data, { merge:true });
    alert('✅ Profile saved!');
    location.reload();
};

// ═══════════════════════════════════════════════════════════
// 12. PASSWORD MODAL
// ═══════════════════════════════════════════════════════════
window.openPasswordModal = () => {
    document.getElementById('pwd-new').value     = '';
    document.getElementById('pwd-confirm').value = '';
    document.getElementById('password-modal').classList.remove('hidden');
};

window.closePasswordModal = () => {
    document.getElementById('password-modal').classList.add('hidden');
};

window.submitPasswordChange = async () => {
    const newPwd  = document.getElementById('pwd-new').value.trim();
    const confPwd = document.getElementById('pwd-confirm').value.trim();
    if (!newPwd)              { alert('❌ Please enter a new password.'); return; }
    if (newPwd.length < 6)    { alert('❌ Password must be at least 6 characters.'); return; }
    if (newPwd !== confPwd)   { alert('❌ Passwords do not match!'); return; }
    if (!confirm('🔑 Confirm password change?')) return;
    try {
        await currentUser.updatePassword(newPwd);
        closePasswordModal();
        alert('✅ Password changed successfully!');
    } catch (err) {
        if (err.code === 'auth/requires-recent-login') {
            alert('⚠️ For security, please logout and login again, then try changing your password.');
        } else {
            alert('❌ Failed: ' + err.message);
        }
    }
};

// ═══════════════════════════════════════════════════════════
// 13. MISC BINDINGS
// ═══════════════════════════════════════════════════════════
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
    document.getElementById('modal-user-name').textContent = `📋 ${name} — History`;
    loadReports(id, 'modal-report-container');
};
window.closeUserModal = () => {
    document.getElementById('user-report-modal').classList.add('hidden');
    if (activeListener) { activeListener(); activeListener = null; }
};

window.openProfileEdit = () => {
    document.getElementById('profile-title').textContent    = 'Edit Profile';
    document.getElementById('profile-subtitle').textContent = 'Update your details';
    document.getElementById('profile-name').value           = userProfile.name             || '';
    document.getElementById('profile-level').value          = userProfile.level            || '';
    document.getElementById('profile-chanting').value       = userProfile.chantingCategory || '';
    document.getElementById('profile-exact-rounds').value   = userProfile.exactRounds      || '';
    document.getElementById('cancel-edit').classList.remove('hidden');
    showSection('profile');
};
