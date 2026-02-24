(function () {
  'use strict';

  const savedTheme = localStorage.getItem('syllaboard-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);

  const COLOR_PALETTE = [
    { hex: '#a78bfa', rgb: '167,139,250' },
    { hex: '#34d399', rgb: '52,211,153' },
    { hex: '#60a5fa', rgb: '96,165,250' },
    { hex: '#fbbf24', rgb: '251,191,36' },
    { hex: '#f87171', rgb: '248,113,113' },
    { hex: '#fb923c', rgb: '251,146,60' },
    { hex: '#e879f9', rgb: '232,121,249' },
    { hex: '#22d3ee', rgb: '34,211,238' },
  ];

  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  let SEMESTER_START, SEMESTER_END, SEMESTER_NAME;
  let CLASSES = {};
  let ASSIGNMENTS = [];
  let userName = '';
  let activeFilter = 'all';
  let activeType = 'all';
  let activeView = localStorage.getItem('syllaboard-default-view') || 'timeline';
  let calMonth = TODAY.getMonth();
  let calYear = TODAY.getFullYear();
  let showPast = false;

  init();

  async function init() {
    try {
      const meRes = await fetch('/api/me');
      if (!meRes.ok) { window.location.href = '/'; return; }
      const me = await meRes.json();
      userName = me.name;

      const dashRes = await fetch('/api/dashboard');
      const dashData = await dashRes.json();

      if (!dashData.hasSemester) {
        renderUploadFlow();
        return;
      }

      SEMESTER_NAME = dashData.semester.name;
      SEMESTER_START = parseDate(dashData.semester.startDate);
      SEMESTER_END = parseDate(dashData.semester.endDate);
      CLASSES = dashData.classes;
      ASSIGNMENTS = dashData.assignments;

      renderDashboard();
    } catch {
      window.location.href = '/';
    }
  }

  function getColor(classId) {
    const cls = CLASSES[classId];
    if (!cls) return COLOR_PALETTE[0];
    return COLOR_PALETTE[cls.color % COLOR_PALETTE.length];
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function weekdayShort(d) { return d.toLocaleDateString('en-US', { weekday: 'short' }); }

  function urgencyClass(days) {
    if (days <= 3) return 'urgent';
    if (days <= 7) return 'soon';
    return 'upcoming';
  }

  function countdownClass(days) {
    if (days <= 3) return 'urgent';
    if (days <= 7) return 'soon';
    return 'ok';
  }

  // ======================== UPLOAD FLOW ========================

  function renderUploadFlow() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="upload-page">
        <header class="upload-header">
          <h1 class="logo">📚 <span class="gradient-text">SyllaBoard</span></h1>
          <div class="upload-header-right">
            <span class="upload-greeting">Hey, ${esc(userName)}</span>
            <button class="btn-ghost" id="logoutBtn">Log Out</button>
          </div>
        </header>

        <div class="upload-hero">
          <h2>Upload Your Syllabuses</h2>
          <p>Drop your syllabus files below and we'll build your personalized dashboard.</p>
        </div>

        <div class="upload-zone" id="uploadZone">
          <div class="upload-zone-content">
            <div class="upload-icon">📄</div>
            <p class="upload-zone-text">Drag & drop PDF or text files here</p>
            <p class="upload-zone-sub">or <button type="button" class="browse-link" id="browseBtn">browse files</button> — up to 10 files</p>
          </div>
          <input type="file" id="fileInput" multiple accept=".pdf,.txt,.png,.jpg,.jpeg,.webp" style="display:none" />
        </div>

        <div class="file-list" id="fileList"></div>

        <button class="btn-primary upload-submit" id="uploadBtn" disabled>
          <span id="uploadBtnText">Upload & Parse Syllabuses</span>
        </button>

        <div class="upload-status" id="uploadStatus"></div>

        <!-- Review step -->
        <div id="reviewSection" style="display:none">
          <div class="review-header">
            <h3>Review Extracted Schedule</h3>
            <p>Verify the data below looks correct, then save to create your dashboard.</p>
          </div>
          <div class="review-content" id="reviewContent"></div>
          <div class="review-actions">
            <button class="btn-ghost" id="reuploadBtn">Re-upload</button>
            <button class="btn-primary" id="saveBtn">Save & Create Dashboard</button>
          </div>
        </div>
      </div>
    `;

    const zone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const fileList = document.getElementById('fileList');
    const uploadBtn = document.getElementById('uploadBtn');
    let selectedFiles = [];

    document.getElementById('browseBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

    function addFiles(files) {
      for (const f of files) selectedFiles.push(f);
      renderFileList();
    }

    function renderFileList() {
      fileList.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-item">
          <span class="file-item-icon">${f.type.includes('pdf') ? '📄' : f.type.includes('image') ? '🖼️' : '📝'}</span>
          <span class="file-item-name">${esc(f.name)}</span>
          <span class="file-item-size">${(f.size / 1024).toFixed(0)} KB</span>
          <button class="file-item-remove" data-idx="${i}">&times;</button>
        </div>
      `).join('');
      uploadBtn.disabled = selectedFiles.length === 0;
      fileList.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedFiles.splice(parseInt(btn.dataset.idx), 1);
          renderFileList();
        });
      });
    }

    uploadBtn.addEventListener('click', async () => {
      const btnText = document.getElementById('uploadBtnText');
      const status = document.getElementById('uploadStatus');
      uploadBtn.disabled = true;
      btnText.textContent = 'Parsing syllabuses with AI...';
      status.innerHTML = '<div class="status-loading"><div class="loading-spinner small"></div> This usually takes 10–20 seconds</div>';

      const fd = new FormData();
      selectedFiles.forEach(f => fd.append('files', f));

      try {
        const r = await fetch('/api/upload-syllabus', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);

        status.innerHTML = '';
        showReview(data.data);
      } catch (err) {
        status.innerHTML = `<div class="status-error">${esc(err.message)}</div>`;
        uploadBtn.disabled = false;
        btnText.textContent = 'Upload & Parse Syllabuses';
      }
    });

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }

  function showReview(data) {
    const section = document.getElementById('reviewSection');
    const content = document.getElementById('reviewContent');
    section.style.display = 'block';
    document.getElementById('uploadZone').style.display = 'none';
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('uploadBtn').style.display = 'none';

    let html = `
      <div class="review-semester">
        <strong>${esc(data.semester_name)}</strong>
        <span class="review-dates">${data.semester_start} → ${data.semester_end}</span>
      </div>
    `;

    data.classes.forEach((cls, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      html += `
        <div class="review-class">
          <div class="review-class-header" style="border-left: 3px solid ${color.hex}">
            <strong>${esc(cls.name)}</strong>
            <span class="review-class-count">${cls.assignments.length} items</span>
          </div>
          <div class="review-assignments">
            ${cls.assignments.map(a => `
              <div class="review-assignment">
                <span class="review-a-date">${a.date}</span>
                <span class="review-a-title">${esc(a.title)}</span>
                <span class="tl-badge ${a.type}">${a.type}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });

    content.innerHTML = html;

    document.getElementById('saveBtn').addEventListener('click', async () => {
      const btn = document.getElementById('saveBtn');
      btn.disabled = true;
      btn.textContent = 'Saving...';
      try {
        const r = await fetch('/api/save-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Save & Create Dashboard';
        alert('Error: ' + err.message);
      }
    });

    document.getElementById('reuploadBtn').addEventListener('click', () => {
      window.location.reload();
    });
  }

  // ======================== DASHBOARD ========================

  function renderDashboard() {
    const app = document.getElementById('app');
    app.innerHTML = `
      <header class="top-bar">
        <div class="top-bar-left">
          <h1 class="logo">📚 <span class="gradient-text">${esc(SEMESTER_NAME)}</span></h1>
          <p class="subtitle">Assignment Dashboard</p>
        </div>
        <div class="top-bar-right">
          <div class="date-display">${formatDate(TODAY)}</div>
          <div class="semester-progress">
            <span class="progress-label">Semester</span>
            <div class="progress-bar-container">
              <div class="progress-bar-fill" id="semesterProgress"></div>
            </div>
            <span class="progress-pct" id="semesterPct"></span>
          </div>
          <div class="user-menu">
            <span class="user-name">${esc(userName)}</span>
            <button class="btn-ghost btn-sm" id="exportPdfBtn" title="Export PDF">📥 Export</button>
            <button class="btn-ghost btn-sm" id="addSyllabusBtn">+ Add Syllabuses</button>
            <button class="btn-ghost btn-sm" id="newUploadBtn">New Semester</button>
            <button class="btn-ghost btn-sm btn-icon" id="settingsBtn" title="Settings">⚙</button>
            <button class="btn-ghost btn-sm" id="logoutDashBtn">Log Out</button>
          </div>
        </div>
      </header>
      <section class="stats-row" id="statsRow"></section>
      <section class="filter-section">
        <div class="filter-rows">
          <div class="filter-tabs" id="filterTabs"></div>
          <div class="filter-tabs type-filters" id="typeFilters">
            <button class="type-tab active" data-type="all">All Types</button>
            <button class="type-tab" data-type="exam">Exams</button>
            <button class="type-tab" data-type="due">Assignments</button>
            <button class="type-tab" data-type="quiz">Quizzes</button>
            <button class="type-tab" data-type="conference">Conferences</button>
            <button class="type-tab" data-type="workshop">Workshops</button>
            <button class="type-tab" data-type="prep">Prep Work</button>
          </div>
        </div>
        <div class="view-toggle">
          <button class="view-btn ${activeView === 'timeline' ? 'active' : ''}" data-view="timeline" title="Timeline View">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <button class="view-btn ${activeView === 'calendar' ? 'active' : ''}" data-view="calendar" title="Calendar View">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          </button>
          <button class="view-btn ${activeView === 'byclass' ? 'active' : ''}" data-view="byclass" title="By Class">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
          </button>
        </div>
      </section>
      <section class="upcoming-spotlight" id="upcomingSpotlight"></section>
      <main class="main-content" id="mainContent"></main>
    `;

    renderSemesterProgress();
    renderFilterTabs();
    renderStats();
    renderSpotlight();
    renderMainContent();
    bindFilters();
    bindTypeFilters();
    bindViews();

    document.getElementById('logoutDashBtn').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      window.location.href = '/';
    });

    document.getElementById('newUploadBtn').addEventListener('click', async () => {
      if (!confirm('Start a new semester? Your current dashboard will be replaced.')) return;
      const dashData = await (await fetch('/api/dashboard')).json();
      if (dashData.hasSemester) {
        await fetch(`/api/semester/${dashData.semester.id}`, { method: 'DELETE' });
      }
      window.location.reload();
    });

    document.getElementById('addSyllabusBtn').addEventListener('click', () => {
      renderAddSyllabusModal();
    });

    document.getElementById('settingsBtn').addEventListener('click', () => {
      renderSettingsModal();
    });

    document.getElementById('exportPdfBtn').addEventListener('click', () => {
      exportPDF();
    });
  }

  function renderFilterTabs() {
    const container = document.getElementById('filterTabs');
    let html = '<button class="filter-tab active" data-filter="all">All Classes</button>';
    Object.entries(CLASSES).forEach(([key, cls]) => {
      const c = getColor(key);
      html += `<button class="filter-tab" data-filter="${key}" style="--tab-color:${c.hex}">${cls.icon} ${cls.short}</button>`;
    });
    container.innerHTML = html;
  }

  function renderSemesterProgress() {
    const total = daysBetween(SEMESTER_START, SEMESTER_END);
    const elapsed = Math.min(Math.max(daysBetween(SEMESTER_START, TODAY), 0), total);
    const pct = Math.round((elapsed / total) * 100);
    document.getElementById('semesterProgress').style.width = pct + '%';
    document.getElementById('semesterPct').textContent = pct + '%';
  }

  function getFilteredAssignments() {
    let list = [...ASSIGNMENTS];
    if (activeFilter !== 'all') list = list.filter(a => a.classId === activeFilter);
    if (activeType !== 'all') list = list.filter(a => a.type === activeType);
    return list.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }

  function renderStats() {
    const filtered = getFilteredAssignments();
    const upcoming = filtered.filter(a => parseDate(a.date) >= TODAY);
    const past = filtered.filter(a => parseDate(a.date) < TODAY);
    const exams = upcoming.filter(a => a.type === 'exam');
    const nextUp = upcoming[0];
    const daysToNext = nextUp ? daysBetween(TODAY, parseDate(nextUp.date)) : null;

    const cards = [
      { icon: '📋', bg: 'rgba(96,165,250,0.1)', value: upcoming.length, label: 'Upcoming' },
      { icon: '✅', bg: 'rgba(52,211,153,0.1)', value: past.length, label: 'Past Events' },
      { icon: '📝', bg: 'rgba(248,113,113,0.1)', value: exams.length, label: 'Exams Left' },
      {
        icon: '⏳', bg: 'rgba(251,191,36,0.1)',
        value: daysToNext !== null ? daysToNext + 'd' : '—',
        label: daysToNext !== null ? `Until ${CLASSES[nextUp.classId]?.short || 'Next'}` : 'All done!'
      },
    ];

    document.getElementById('statsRow').innerHTML = cards.map(c => `
      <div class="stat-card">
        <div class="stat-icon" style="background:${c.bg}">${c.icon}</div>
        <div class="stat-info">
          <div class="stat-value">${c.value}</div>
          <div class="stat-label">${c.label}</div>
        </div>
      </div>
    `).join('');
  }

  function renderSpotlight() {
    let pool = getFilteredAssignments();
    const upcoming = pool
      .filter(a => parseDate(a.date) >= TODAY)
      .filter(a => activeType !== 'all' || a.type === 'exam' || a.type === 'due')
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));

    const next = upcoming[0];
    const el = document.getElementById('upcomingSpotlight');
    if (!next) { el.innerHTML = ''; return; }

    const d = parseDate(next.date);
    const days = daysBetween(TODAY, d);
    const urg = urgencyClass(days);
    const cls = CLASSES[next.classId] || { name: 'Class', icon: '📚' };
    const c = getColor(next.classId);

    el.innerHTML = `
      <div class="spotlight-card ${urg}">
        <div class="spotlight-header">
          <span class="spotlight-label ${urg}">${days === 0 ? '🔴 Today' : days <= 3 ? '⚠️ Due Soon' : '📌 Next Up'}</span>
          <div class="spotlight-countdown">
            <div class="countdown-number ${urg}">${days === 0 ? 'TODAY' : days}</div>
            ${days > 0 ? `<div class="countdown-unit">day${days !== 1 ? 's' : ''} left</div>` : ''}
          </div>
        </div>
        <div class="spotlight-class" style="color:${c.hex}">${cls.icon} ${cls.name}</div>
        <div class="spotlight-title">${esc(next.title)}</div>
        <div class="spotlight-date">${formatDate(d)}</div>
      </div>
    `;
  }

  function bindFilters() {
    document.getElementById('filterTabs').addEventListener('click', e => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      renderStats(); renderSpotlight(); renderMainContent();
    });
  }

  function bindTypeFilters() {
    document.getElementById('typeFilters').addEventListener('click', e => {
      const tab = e.target.closest('.type-tab');
      if (!tab) return;
      document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeType = tab.dataset.type;
      renderStats(); renderSpotlight(); renderMainContent();
    });
  }

  function bindViews() {
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeView = btn.dataset.view;
        renderMainContent();
      });
    });
  }

  function renderMainContent() {
    const container = document.getElementById('mainContent');
    switch (activeView) {
      case 'timeline': renderTimeline(container); break;
      case 'calendar': renderCalendar(container); break;
      case 'byclass': renderByClass(container); break;
    }
    bindCheckboxes();
    bindPastToggle();
  }

  // ======================== TIMELINE ========================

  function renderTimelineItem(a) {
    const d = parseDate(a.date);
    const days = daysBetween(TODAY, d);
    const isPast = days < 0;
    const isToday = days === 0;
    const cls = CLASSES[a.classId] || { short: '?', icon: '📚' };
    const c = getColor(a.classId);

    return `
      <div class="timeline-item ${isToday ? 'today' : ''} ${a.completed ? 'completed' : ''}" style="--item-color:${c.hex};--item-rgb:${c.rgb}">
        <div class="tl-date">
          <div class="tl-date-day">${d.getDate()}</div>
          <div class="tl-date-weekday">${weekdayShort(d)}</div>
        </div>
        <div class="tl-dot-container">
          <div class="tl-dot" style="background:${c.hex};box-shadow:0 0 8px rgba(${c.rgb},0.4)"></div>
        </div>
        <div class="tl-content">
          <div class="tl-class" style="color:${c.hex}">${cls.short}</div>
          <div class="tl-title">${esc(a.title)}</div>
          <div class="tl-meta">
            <span class="tl-badge ${a.type}">${a.type}</span>
            ${a.endDate ? `<span style="font-size:0.7rem;color:var(--text-dim)">→ ${parseDate(a.endDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>` : ''}
          </div>
        </div>
        <button class="tl-check ${a.completed ? 'checked' : ''}" data-id="${a.id}" title="Mark complete"></button>
        ${!isPast ? `<div class="tl-countdown">
              <div class="tl-countdown-num ${countdownClass(days)}">${isToday ? 'Today' : days + 'd'}</div>
              <div class="tl-countdown-label">${isToday ? '⚡' : 'remaining'}</div>
            </div>` : ''}
      </div>`;
  }

  function renderTimeline(container) {
    const items = getFilteredAssignments();
    if (!items.length) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No assignments for this filter</div></div>';
      return;
    }
    const upcomingItems = items.filter(a => parseDate(a.date) >= TODAY);
    const pastItems = items.filter(a => parseDate(a.date) < TODAY);
    let html = '<div class="timeline">';

    if (pastItems.length > 0) {
      html += `<div class="past-toggle-section">
        <button class="past-toggle-btn" id="pastToggleBtn">
          <svg class="past-toggle-chevron ${showPast ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
          <span>Past Events</span>
          <span class="past-toggle-count">${pastItems.length}</span>
        </button>
        <div class="past-events-container ${showPast ? 'open' : ''}" id="pastEventsContainer">`;
      groupByMonth(pastItems).forEach(([label, items]) => {
        html += `<div class="timeline-month"><div class="month-header">${label}</div>`;
        items.forEach(a => { html += renderTimelineItem(a); });
        html += '</div>';
      });
      html += '</div></div>';
    }

    if (upcomingItems.length > 0) {
      groupByMonth(upcomingItems).forEach(([label, items]) => {
        html += `<div class="timeline-month"><div class="month-header">${label}</div>`;
        items.forEach(a => { html += renderTimelineItem(a); });
        html += '</div>';
      });
    } else {
      html += '<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-text">No more upcoming assignments!</div></div>';
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function groupByMonth(items) {
    const groups = {};
    items.forEach(a => {
      const d = parseDate(a.date);
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(a);
    });
    return Object.keys(groups).sort().map(key => {
      const [y, m] = key.split('-').map(Number);
      return [new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), groups[key]];
    });
  }

  // ======================== CALENDAR ========================

  function renderCalendar(container) {
    const firstDay = new Date(calYear, calMonth, 1);
    const lastDay = new Date(calYear, calMonth + 1, 0);
    const startWeekday = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const eventsThisMonth = getFilteredAssignments().filter(a => {
      const d = parseDate(a.date);
      return d.getMonth() === calMonth && d.getFullYear() === calYear;
    });
    const eventsByDay = {};
    eventsThisMonth.forEach(a => {
      const day = parseDate(a.date).getDate();
      if (!eventsByDay[day]) eventsByDay[day] = [];
      eventsByDay[day].push(a);
    });

    let html = `
      <div class="cal-nav">
        <button class="cal-nav-btn" id="calPrev">← Prev</button>
        <div class="cal-month-label">${monthLabel}</div>
        <button class="cal-nav-btn" id="calNext">Next →</button>
      </div>
      <div class="calendar-grid">
        <div class="cal-header">Sun</div><div class="cal-header">Mon</div><div class="cal-header">Tue</div>
        <div class="cal-header">Wed</div><div class="cal-header">Thu</div><div class="cal-header">Fri</div><div class="cal-header">Sat</div>`;

    for (let i = 0; i < startWeekday; i++) html += '<div class="cal-day empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(calYear, calMonth, d);
      const isToday = thisDate.getTime() === TODAY.getTime();
      const isPast = thisDate < TODAY;
      const events = eventsByDay[d] || [];
      html += `<div class="cal-day ${isToday ? 'today' : ''} ${isPast && !isToday ? 'past' : ''}">
        <div class="cal-day-num">${d}</div>
        ${events.map(e => {
          const c = getColor(e.classId);
          const cls = CLASSES[e.classId] || { short: '?' };
          return `<div class="cal-event" style="background:rgba(${c.rgb},0.08);color:${c.hex};border-left:2px solid ${c.hex}" title="${cls.short}: ${e.title}">${esc(e.title)}</div>`;
        }).join('')}
      </div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('calPrev').addEventListener('click', () => {
      calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar(container);
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar(container);
    });
  }

  // ======================== BY CLASS ========================

  function renderByClass(container) {
    const classIds = activeFilter === 'all' ? Object.keys(CLASSES) : [activeFilter];
    let html = '<div class="class-grid">';

    classIds.forEach(cid => {
      const cls = CLASSES[cid];
      if (!cls) return;
      const c = getColor(cid);
      let allItems = ASSIGNMENTS.filter(a => a.classId === cid);
      if (activeType !== 'all') allItems = allItems.filter(a => a.type === activeType);
      allItems.sort((a, b) => parseDate(a.date) - parseDate(b.date));
      const upcomingItems = allItems.filter(a => parseDate(a.date) >= TODAY);
      const pastItems = allItems.filter(a => parseDate(a.date) < TODAY);

      html += `
        <div class="class-card">
          <div class="class-card-header" style="--card-color:${c.hex}">
            <div class="class-card-name">${cls.icon} ${esc(cls.name)}</div>
            <div class="class-card-sub">${upcomingItems.length} upcoming · ${pastItems.length} past</div>
          </div>
          <div class="class-card-body">`;

      upcomingItems.forEach(a => {
        const d = parseDate(a.date);
        html += `<div class="class-item">
          <button class="tl-check ${a.completed ? 'checked' : ''}" data-id="${a.id}" title="Mark complete" style="width:16px;height:16px;min-width:16px"></button>
          <div class="class-item-info">
            <div class="class-item-title">${esc(a.title)}</div>
            <div class="class-item-date">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
          </div>
          <span class="class-item-badge tl-badge ${a.type}">${a.type}</span>
        </div>`;
      });

      if (pastItems.length > 0) {
        html += `<div class="class-past-section">
          <button class="class-past-toggle" data-target="past-${cid}">
            <svg class="past-toggle-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            <span>${pastItems.length} past event${pastItems.length !== 1 ? 's' : ''}</span>
          </button>
          <div class="class-past-items" id="past-${cid}" style="display:none;">`;
        pastItems.forEach(a => {
          const d = parseDate(a.date);
          html += `<div class="class-item past">
            <button class="tl-check ${a.completed ? 'checked' : ''}" data-id="${a.id}" title="Mark complete" style="width:16px;height:16px;min-width:16px"></button>
            <div class="class-item-info">
              <div class="class-item-title">${esc(a.title)}</div>
              <div class="class-item-date">${d.toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
            </div>
            <span class="class-item-badge tl-badge ${a.type}">${a.type}</span>
          </div>`;
        });
        html += '</div></div>';
      }
      html += '</div></div>';
    });

    html += '</div>';
    container.innerHTML = html;

    document.querySelectorAll('.class-past-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        const chevron = btn.querySelector('.past-toggle-chevron');
        const isHidden = target.style.display === 'none';
        target.style.display = isHidden ? 'block' : 'none';
        chevron.classList.toggle('open', isHidden);
      });
    });
  }

  // ======================== INTERACTIONS ========================

  function bindPastToggle() {
    const btn = document.getElementById('pastToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      showPast = !showPast;
      btn.querySelector('.past-toggle-chevron').classList.toggle('open', showPast);
      document.getElementById('pastEventsContainer').classList.toggle('open', showPast);
    });
  }

  function bindCheckboxes() {
    document.querySelectorAll('.tl-check').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.id);
        const assignment = ASSIGNMENTS.find(a => a.id === id);
        if (!assignment) return;
        assignment.completed = !assignment.completed;
        btn.classList.toggle('checked');
        const item = btn.closest('.timeline-item') || btn.closest('.class-item');
        if (item) item.classList.toggle('completed');
        renderStats();
        try {
          await fetch('/api/toggle-complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ assignmentId: id, completed: assignment.completed })
          });
        } catch {}
      });
    });
  }

  function esc(s) {
    const el = document.createElement('span');
    el.textContent = s;
    return el.innerHTML;
  }

  // ======================== ADD SYLLABUS MODAL ========================

  function renderAddSyllabusModal() {
    const existing = document.getElementById('addSyllabusModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'addSyllabusModal';
    modal.innerHTML = `
      <div class="modal-card modal-lg">
        <button class="modal-close" id="closeAddModal">&times;</button>
        <div class="upload-hero" style="margin-bottom:24px">
          <h2 style="font-size:1.3rem">Add More Syllabuses</h2>
          <p>Upload additional syllabus files to add to your current schedule.</p>
        </div>

        <div class="upload-zone" id="addUploadZone">
          <div class="upload-zone-content">
            <div class="upload-icon">📄</div>
            <p class="upload-zone-text">Drag & drop PDF or text files here</p>
            <p class="upload-zone-sub">or <button type="button" class="browse-link" id="addBrowseBtn">browse files</button> — up to 10 files</p>
          </div>
          <input type="file" id="addFileInput" multiple accept=".pdf,.txt" style="display:none" />
        </div>

        <div class="file-list" id="addFileList"></div>

        <button class="btn-primary upload-submit" id="addUploadBtn" disabled>
          <span id="addUploadBtnText">Upload & Parse Syllabuses</span>
        </button>

        <div class="upload-status" id="addUploadStatus"></div>

        <div id="addReviewSection" style="display:none">
          <div class="review-header">
            <h3>Review Extracted Schedule</h3>
            <p>These items will be added to your current dashboard.</p>
          </div>
          <div class="review-content" id="addReviewContent"></div>
          <div class="review-actions">
            <button class="btn-ghost" id="addReuploadBtn">Re-upload</button>
            <button class="btn-primary" id="addSaveBtn">Add to Dashboard</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    const zone = document.getElementById('addUploadZone');
    const fileInput = document.getElementById('addFileInput');
    const fileList = document.getElementById('addFileList');
    const uploadBtn = document.getElementById('addUploadBtn');
    let selectedFiles = [];

    document.getElementById('closeAddModal').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    document.getElementById('addBrowseBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      addFiles(e.dataTransfer.files);
    });
    fileInput.addEventListener('change', () => { addFiles(fileInput.files); fileInput.value = ''; });

    function addFiles(files) {
      for (const f of files) selectedFiles.push(f);
      renderList();
    }

    function renderList() {
      fileList.innerHTML = selectedFiles.map((f, i) => `
        <div class="file-item">
          <span class="file-item-icon">${f.type.includes('pdf') ? '📄' : '📝'}</span>
          <span class="file-item-name">${esc(f.name)}</span>
          <span class="file-item-size">${(f.size / 1024).toFixed(0)} KB</span>
          <button class="file-item-remove" data-idx="${i}">&times;</button>
        </div>
      `).join('');
      uploadBtn.disabled = selectedFiles.length === 0;
      fileList.querySelectorAll('.file-item-remove').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedFiles.splice(parseInt(btn.dataset.idx), 1);
          renderList();
        });
      });
    }

    uploadBtn.addEventListener('click', async () => {
      const btnText = document.getElementById('addUploadBtnText');
      const status = document.getElementById('addUploadStatus');
      uploadBtn.disabled = true;
      btnText.textContent = 'Parsing syllabuses with AI...';
      status.innerHTML = '<div class="status-loading"><div class="loading-spinner small"></div> This usually takes 10–20 seconds</div>';

      const fd = new FormData();
      selectedFiles.forEach(f => fd.append('files', f));

      try {
        const r = await fetch('/api/upload-syllabus', { method: 'POST', body: fd });
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        status.innerHTML = '';
        showAddReview(data.data, modal);
      } catch (err) {
        status.innerHTML = `<div class="status-error">${esc(err.message)}</div>`;
        uploadBtn.disabled = false;
        btnText.textContent = 'Upload & Parse Syllabuses';
      }
    });
  }

  function showAddReview(data, modal) {
    const section = document.getElementById('addReviewSection');
    const content = document.getElementById('addReviewContent');
    section.style.display = 'block';
    document.getElementById('addUploadZone').style.display = 'none';
    document.getElementById('addFileList').style.display = 'none';
    document.getElementById('addUploadBtn').style.display = 'none';

    let html = '';
    data.classes.forEach((cls, i) => {
      const color = COLOR_PALETTE[i % COLOR_PALETTE.length];
      html += `
        <div class="review-class">
          <div class="review-class-header" style="border-left: 3px solid ${color.hex}">
            <strong>${esc(cls.name)}</strong>
            <span class="review-class-count">${cls.assignments.length} items</span>
          </div>
          <div class="review-assignments">
            ${cls.assignments.map(a => `
              <div class="review-assignment">
                <span class="review-a-date">${a.date}</span>
                <span class="review-a-title">${esc(a.title)}</span>
                <span class="tl-badge ${a.type}">${a.type}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    });
    content.innerHTML = html;

    document.getElementById('addSaveBtn').addEventListener('click', async () => {
      const btn = document.getElementById('addSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Adding...';
      try {
        const r = await fetch('/api/add-to-schedule', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error);
        modal.remove();
        window.location.reload();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Add to Dashboard';
        alert('Error: ' + err.message);
      }
    });

    document.getElementById('addReuploadBtn').addEventListener('click', () => {
      modal.remove();
      renderAddSyllabusModal();
    });
  }

  // ======================== EXPORT PDF ========================

  function exportPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 16;
    const contentWidth = pageWidth - margin * 2;
    let y = 0;

    doc.setFillColor(26, 26, 46);
    doc.rect(0, 0, pageWidth, 42, 'F');

    const gradientColors = [[167, 139, 250], [96, 165, 250], [52, 211, 153]];
    const segW = pageWidth / gradientColors.length;
    gradientColors.forEach((c, i) => {
      doc.setFillColor(...c);
      doc.rect(i * segW, 42, segW, 1.5, 'F');
    });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(255, 255, 255);
    doc.text('SyllaBoard', margin, 20);

    doc.setFontSize(12);
    doc.setTextColor(167, 139, 250);
    doc.text(SEMESTER_NAME, margin, 32);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(136, 136, 160);
    const startStr = SEMESTER_START.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const endStr = SEMESTER_END.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    doc.text(`${startStr}  —  ${endStr}`, pageWidth - margin, 32, { align: 'right' });

    y = 52;

    const allAssignments = [...ASSIGNMENTS].sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const upcoming = allAssignments.filter(a => parseDate(a.date) >= TODAY);
    const completed = allAssignments.filter(a => a.completed);

    doc.setFontSize(9);
    doc.setTextColor(100, 100, 120);
    doc.text(
      `Total: ${allAssignments.length}   |   Upcoming: ${upcoming.length}   |   Completed: ${completed.length}   |   Generated: ${new Date().toLocaleDateString('en-US')}`,
      margin, y
    );
    y += 10;

    const classIds = Object.keys(CLASSES);
    classIds.forEach(cid => {
      const cls = CLASSES[cid];
      const c = getColor(cid);
      const classAssignments = allAssignments.filter(a => a.classId === cid);
      if (classAssignments.length === 0) return;

      if (y > pageHeight - 40) {
        doc.addPage();
        y = margin;
      }

      const [r, g, b] = c.rgb.split(',').map(Number);
      doc.setFillColor(r, g, b);
      doc.roundedRect(margin, y, contentWidth, 9, 1.5, 1.5, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(`${cls.icon}  ${cls.name}`, margin + 4, y + 6.2);

      doc.setFontSize(8);
      doc.text(`${classAssignments.length} items`, pageWidth - margin - 4, y + 6.2, { align: 'right' });

      y += 13;

      const tableData = classAssignments.map(a => {
        const d = parseDate(a.date);
        const days = daysBetween(TODAY, d);
        let status;
        if (a.completed) status = '✓ Done';
        else if (days < 0) status = 'Past';
        else if (days === 0) status = 'Today';
        else status = days + 'd left';

        return [
          d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          a.title,
          a.type.charAt(0).toUpperCase() + a.type.slice(1),
          status
        ];
      });

      doc.autoTable({
        startY: y,
        margin: { left: margin, right: margin },
        head: [['Date', 'Title', 'Type', 'Status']],
        body: tableData,
        theme: 'plain',
        styles: {
          fontSize: 8.5,
          cellPadding: { top: 2.8, bottom: 2.8, left: 3, right: 3 },
          textColor: [60, 60, 80],
          lineColor: [220, 220, 230],
          lineWidth: 0.2,
          font: 'helvetica',
        },
        headStyles: {
          fillColor: [245, 245, 248],
          textColor: [80, 80, 100],
          fontStyle: 'bold',
          fontSize: 7.5,
        },
        columnStyles: {
          0: { cellWidth: 34 },
          2: { cellWidth: 24 },
          3: { cellWidth: 22 },
        },
        alternateRowStyles: {
          fillColor: [250, 250, 253],
        },
        didParseCell: function(data) {
          if (data.section === 'body' && data.column.index === 3) {
            const val = data.cell.raw;
            if (val === '✓ Done') data.cell.styles.textColor = [52, 211, 153];
            else if (val === 'Today') data.cell.styles.textColor = [248, 113, 113];
            else if (val === 'Past') data.cell.styles.textColor = [160, 160, 180];
            else data.cell.styles.textColor = [251, 191, 36];
          }
          if (data.section === 'body' && data.column.index === 2) {
            const t = data.cell.raw.toLowerCase();
            if (t === 'exam') data.cell.styles.textColor = [248, 113, 113];
            else if (t === 'quiz') data.cell.styles.textColor = [96, 165, 250];
            else if (t === 'due') data.cell.styles.textColor = [251, 191, 36];
            else if (t === 'conference') data.cell.styles.textColor = [167, 139, 250];
            else if (t === 'workshop') data.cell.styles.textColor = [52, 211, 153];
          }
        }
      });

      y = doc.lastAutoTable.finalY + 10;
    });

    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(150, 150, 170);
      doc.text('SyllaBoard — Assignment Dashboard', margin, pageHeight - 8);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    const filename = SEMESTER_NAME.replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
    doc.save(`${filename}_Schedule.pdf`);
  }

  // ======================== SETTINGS MODAL ========================

  function renderSettingsModal() {
    const existing = document.getElementById('settingsModal');
    if (existing) existing.remove();

    const currentTheme = localStorage.getItem('syllaboard-theme') || 'dark';
    const savedView = localStorage.getItem('syllaboard-default-view') || 'timeline';

    const modal = document.createElement('div');
    modal.className = 'modal-overlay open';
    modal.id = 'settingsModal';
    modal.innerHTML = `
      <div class="modal-card" style="max-width:480px">
        <button class="modal-close" id="closeSettingsBtn">&times;</button>
        <h3 class="settings-title">Settings</h3>

        <div class="settings-section">
          <div class="settings-section-title">Appearance</div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-name">Theme</div>
              <div class="setting-desc">Switch between dark and light mode</div>
            </div>
            <div class="theme-switch">
              <button class="theme-option ${currentTheme === 'dark' ? 'active' : ''}" data-theme="dark">🌙 Dark</button>
              <button class="theme-option ${currentTheme === 'light' ? 'active' : ''}" data-theme="light">☀️ Light</button>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Preferences</div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-name">Default View</div>
              <div class="setting-desc">Choose your preferred dashboard view</div>
            </div>
            <select class="setting-select" id="defaultViewSelect">
              <option value="timeline" ${savedView === 'timeline' ? 'selected' : ''}>Timeline</option>
              <option value="calendar" ${savedView === 'calendar' ? 'selected' : ''}>Calendar</option>
              <option value="byclass" ${savedView === 'byclass' ? 'selected' : ''}>By Class</option>
            </select>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Account</div>
          <div class="setting-row">
            <div class="setting-label">
              <div class="setting-name">Signed in as</div>
              <div class="setting-desc">${esc(userName)}</div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('closeSettingsBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    modal.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => {
        const theme = btn.dataset.theme;
        localStorage.setItem('syllaboard-theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        modal.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    document.getElementById('defaultViewSelect').addEventListener('change', (e) => {
      localStorage.setItem('syllaboard-default-view', e.target.value);
      activeView = e.target.value;
      document.querySelectorAll('.view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === activeView);
      });
      renderMainContent();
    });
  }

})();
