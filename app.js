let userData = JSON.parse(localStorage.getItem('devotee_meta')) || {};

// 1. DATE DROPDOWN (DD.MM.YYYY)
function setupDateDropdown() {
    const dateSelect = document.getElementById('s-date');
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

// 2. SCORING ENGINE (5-MIN SLABS: 30m=25, 0m=-5)
function calculateSadhanaScore(d) {
    let s = 0;
    const t2m = (t, n=false) => { if(!t) return 0; let [h,m]=t.split(':').map(Number); return n&&h<12 ? (h*60+m)+1440 : h*60+m; };

    // Sleep & Wakeup
    const sT = t2m(d.sleep, true);
    s += (sT <= 1350) ? 25 : (sT > 1380 ? -5 : 25 - (Math.ceil((sT-1350)/5)*5));
    const wT = t2m(d.wakeup);
    s += (wT <= 305) ? 25 : (wT > 335 ? -5 : 25 - (Math.ceil((wT-305)/5)*5));

    // Chanting (9:00 AM Target)
    const cT = t2m(d.chanting);
    if(cT <= 540) s+=25; else if(cT <= 570) s+=20; else if(cT <= 660) s+=15;
    else if(cT <= 870) s+=10; else if(cT <= 1020) s+=5; else if(cT <= 1140) s+=0; else s-=5;

    // 5-Min Slab logic (Target 30m, Max 25pt, 0m = -5)
    const getSlab30 = (m) => (m >= 30) ? 25 : 25 - (Math.ceil((30 - m) / 5) * 5);
    
    s += getSlab30(d.read);
    s += getSlab30(d.hear);

    if (userData.pos === "Senior Batch") {
        s += (d.service >= 15) ? 10 : 10 - (Math.ceil((15 - d.service) / 5) * 5);
        s += (d.notes >= 20) ? 15 : 15 - (Math.ceil((20 - d.notes) / 5) * 5);
    } else {
        s += getSlab30(d.service);
    }

    s += (d.daySleep === 0) ? 10 : (d.daySleep <= 60 ? 5 : -5);
    return s;
}

// 3. CORE FUNCTIONS
function saveProfile() {
    userData = {
        name: document.getElementById('p-name').value,
        pos: document.getElementById('p-pos').value,
        level: document.getElementById('p-level').value,
        rounds: document.getElementById('p-rounds').value
    };
    if(!userData.name) return alert("Enter Name!");
    localStorage.setItem('devotee_meta', JSON.stringify(userData));
    location.reload();
}

function showProfileEditor() {
    document.getElementById('ProfileEditor').classList.add('active');
    document.getElementById('MainUI').style.display = 'none';
    document.getElementById('main-header').style.display = 'none';
}

function showTab(name) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(name + 'Tab').classList.add('active');
    document.querySelectorAll('.tab-nav button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn-' + name.toLowerCase()).classList.add('active');
    if(name === 'Reports') loadReports();
}

async function loadReports() {
    const out = document.getElementById('report-output');
    out.innerHTML = "Loading...";
    try {
        const snap = await db.collection('sadhana_logs').where('uName', '==', userData.name).orderBy('date', 'desc').get();
        let h = `<table><tr><th>Date</th><th>Score</th></tr>`;
        snap.forEach(doc => { h += `<tr><td>${doc.data().date}</td><td><b>${doc.data().score}</b></td></tr>`; });
        out.innerHTML = snap.empty ? "No data found." : h + `</table>`;
    } catch(e) { out.innerHTML = "Error loading data."; }
}

window.onload = () => {
    if(userData.name) {
        document.getElementById('ProfileEditor').classList.remove('active');
        document.getElementById('MainUI').style.display = 'block';
        document.getElementById('main-header').style.display = 'block';
        document.getElementById('display-name').innerText = userData.name;
        document.getElementById('display-meta').innerText = `${userData.pos} | ${userData.rounds} Rounds`;
        document.getElementById('notes-wrapper').style.display = (userData.pos === "Senior Batch") ? "block" : "none";
        setupDateDropdown();
    }
};

document.getElementById('sadhana-form').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.disabled = true; btn.innerText = "Saving...";
    const d = {
        date: document.getElementById('s-date').value,
        sleep: document.getElementById('s-sleep').value,
        wakeup: document.getElementById('s-wakeup').value,
        chanting: document.getElementById('s-chanting').value,
        read: parseInt(document.getElementById('s-read').value) || 0,
        hear: parseInt(document.getElementById('s-hear').value) || 0,
        service: parseInt(document.getElementById('s-service').value) || 0,
        notes: parseInt(document.getElementById('s-notes').value) || 0,
        daySleep: parseInt(document.getElementById('s-daysleep').value) || 0,
        uName: userData.name
    };
    try {
        const score = calculateSadhanaScore(d);
        await db.collection('sadhana_logs').add({ ...d, score });
        alert("Saved! Score: " + score);
        location.reload();
    } catch(e) { alert("Error!"); btn.disabled = false; }
};
