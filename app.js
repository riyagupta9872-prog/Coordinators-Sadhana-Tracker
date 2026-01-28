let userData = JSON.parse(localStorage.getItem('devotee_meta')) || {};

// 1. DATE DROPDOWN (DD.MM.YYYY)
function setupDateDropdown() {
    const dateSelect = document.getElementById('s-date');
    if (!dateSelect) return;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    const formatDate = (d) => {
        let dd = String(d.getDate()).padStart(2, '0');
        let mm = String(d.getMonth() + 1).padStart(2, '0');
        let yyyy = d.getFullYear();
        return `${dd}.${mm}.${yyyy}`;
    };
    dateSelect.innerHTML = `<option value="${formatDate(today)}">${formatDate(today)}</option>
                            <option value="${formatDate(yesterday)}">${formatDate(yesterday)}</option>`;
}

// 2. SCORING ENGINE (5-MIN SLABS FIXED)
function calculateSadhanaScore(d) {
    let s = 0;
    const t2m = (t, n=false) => { if(!t) return 0; let [h,m]=t.split(':').map(Number); return n&&h<12 ? (h*60+m)+1440 : h*60+m; };

    // Sleep (10:30 PM) & Wakeup (5:05 AM)
    const sT = t2m(d.sleep, true);
    s += (sT <= 1350) ? 25 : (sT > 1380 ? -5 : 25 - (Math.ceil((sT-1350)/5)*5));
    const wT = t2m(d.wakeup);
    s += (wT <= 305) ? 25 : (wT > 335 ? -5 : 25 - (Math.ceil((wT-305)/5)*5));

    // Chanting (Jan 27 Buckets)
    const cT = t2m(d.chanting);
    if(cT <= 540) s+=25; else if(cT <= 570) s+=20; else if(cT <= 660) s+=15;
    else if(cT <= 870) s+=10; else if(cT <= 1020) s+=5; else if(cT <= 1140) s+=0; else s-=5;

    // 5-Min Slab Calculator (Target 30m, Max 25pt, 0m = -5)
    const getSlab30 = (m) => (m >= 30) ? 25 : 25 - (Math.ceil((30 - m) / 5) * 5);
    
    s += getSlab30(d.read); // Reading 20m = 15pt
    s += getSlab30(d.hear); // Hearing 20m = 15pt

    // Position Specific
    if (userData.pos === "Senior Batch") {
        // Senior Sewa (Target 15m, Max 10pt, 0m = -5)
        s += (d.service >= 15) ? 10 : 10 - (Math.ceil((15 - d.service) / 5) * 5);
        // Senior Notes (Target 20m, Max 15pt, 0m = -5)
        s += (d.notes >= 20) ? 15 : 15 - (Math.ceil((20 - d.notes) / 5) * 5);
    } else {
        // Coordinator Sewa (Target 30m, Max 25pt, 0m = -5)
        s += getSlab30(d.service);
    }

    // Day Sleep
    s += (d.daySleep === 0) ? 10 : (d.daySleep <= 60 ? 5 : -5);
    return s;
}

// 3. UI HANDLERS
function showProfileEditor() {
    document.getElementById('ProfileEditor').style.display = 'block';
    document.getElementById('MainUI').style.display = 'none';
    document.getElementById('user-display').style.display = 'none';
}

function showTab(name) {
    document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
    document.getElementById(name + 'Tab').style.display = 'block';
    document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + name.toLowerCase()).classList.add('active');
}

function saveProfile() {
    userData = { name: document.getElementById('p-name').value, pos: document.getElementById('p-pos').value, level: document.getElementById('p-level').value };
    if(!userData.name) return alert("Enter Name!");
    localStorage.setItem('devotee_meta', JSON.stringify(userData));
    location.reload();
}

async function loadReports() {
    const out = document.getElementById('report-output');
    try {
        const snap = await db.collection('sadhana_logs').orderBy('date', 'desc').get();
        let stats = {};
        snap.forEach(doc => {
            let l = doc.data();
            if(!stats[l.uName]) stats[l.uName] = { score: 0, level: l.uLevel };
            stats[l.uName].score += l.score;
        });
        let h = `<table><tr><th>Name</th><th>Level</th><th>Eff %</th></tr>`;
        for(let n in stats) h += `<tr><td>${n}</td><td>${stats[n].level}</td><td><b>${((stats[n].score/1120)*100).toFixed(1)}%</b></td></tr>`;
        out.innerHTML = h + `</table>`;
    } catch(e) { console.log(e); }
}

window.onload = () => {
    if(userData.name) {
        document.getElementById('user-display').style.display = 'block';
        document.getElementById('display-name').innerText = userData.name;
        document.getElementById('display-meta').innerText = `${userData.pos} | ${userData.level}`;
        document.getElementById('MainUI').style.display = 'block';
        document.getElementById('ProfileEditor').style.display = 'none';
        document.getElementById('notes-wrapper').style.display = (userData.pos === "Senior Batch") ? "block" : "none";
        setupDateDropdown(); loadReports();
    } else { showProfileEditor(); }
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const d = {
        date: document.getElementById('s-date').value,
        sleep: document.getElementById('s-sleep').value, wakeup: document.getElementById('s-wakeup').value, chanting: document.getElementById('s-chanting').value,
        read: parseInt(document.getElementById('s-read').value) || 0, hear: parseInt(document.getElementById('s-hear').value) || 0,
        service: parseInt(document.getElementById('s-service').value) || 0, notes: parseInt(document.getElementById('s-notes').value) || 0,
        daySleep: parseInt(document.getElementById('s-daysleep').value) || 0
    };
    const score = calculateSadhanaScore(d);
    await db.collection('sadhana_logs').add({ ...d, uName: userData.name, uLevel: userData.level, score });
    alert("Submit Successfully"); location.reload();
};
