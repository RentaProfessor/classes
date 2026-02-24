(function () {
  'use strict';

  const SEMESTER_START = new Date(2026, 0, 12);
  const SEMESTER_END = new Date(2026, 4, 13);
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const CLASSES = {
    writing:  { name: 'Writing Course', short: 'Writing', color: 'writing', icon: '✍️' },
    math118:  { name: 'MATH 118', short: 'MATH 118', color: 'math118', icon: '📐' },
    econ357:  { name: 'ECON 357', short: 'ECON 357', color: 'econ357', icon: '💰' },
    baep450:  { name: 'BAEP 450', short: 'BAEP 450', color: 'baep450', icon: '🚀' },
  };

  const ASSIGNMENTS = [
    { date: '2026-01-28', classId: 'baep450', title: 'Case Prep Questions Upload', type: 'prep' },
    { date: '2026-02-02', classId: 'baep450', title: 'Individual Assignment #1: Founder Notebook', type: 'due' },
    { date: '2026-02-03', classId: 'writing', title: 'Course Book Quiz 1', type: 'quiz' },
    { date: '2026-02-10', classId: 'writing', title: 'Assignment #1 Conferences (Zoom)', type: 'conference', endDate: '2026-02-12' },
    { date: '2026-02-11', classId: 'baep450', title: 'Case Prep Questions Upload', type: 'prep' },
    { date: '2026-02-13', classId: 'math118', title: 'Midterm 1', type: 'exam' },
    { date: '2026-02-17', classId: 'writing', title: 'Assignment #1 Due', type: 'due' },
    { date: '2026-02-17', classId: 'econ357', title: 'Midterm 1', type: 'exam' },
    { date: '2026-02-18', classId: 'baep450', title: 'Team Assignment #1: Customer Discovery', type: 'due' },
    { date: '2026-02-24', classId: 'writing', title: 'Assignment #2 Conferences (Zoom)', type: 'conference', endDate: '2026-02-26' },
    { date: '2026-03-03', classId: 'writing', title: 'Assignment #2 Due', type: 'due' },
    { date: '2026-03-10', classId: 'writing', title: 'Assignment 3 Intro', type: 'workshop' },
    { date: '2026-03-11', classId: 'baep450', title: 'Individual Assignment #2: Pitch', type: 'due' },
    { date: '2026-03-17', classId: 'writing', title: 'Op-ed Tutorial', type: 'workshop' },
    { date: '2026-03-23', classId: 'baep450', title: 'Individual Assignment #3: Mid-Term Assessment', type: 'exam' },
    { date: '2026-03-26', classId: 'writing', title: 'Op-ed Workshop & Course Book Quiz 2', type: 'quiz' },
    { date: '2026-03-31', classId: 'econ357', title: 'Midterm 2', type: 'exam' },
    { date: '2026-03-31', classId: 'writing', title: 'Assignment #3 Conferences (Zoom)', type: 'conference', endDate: '2026-04-02' },
    { date: '2026-04-03', classId: 'math118', title: 'Midterm 2', type: 'exam' },
    { date: '2026-04-07', classId: 'writing', title: 'Assignment #3 Due', type: 'due' },
    { date: '2026-04-08', classId: 'baep450', title: 'Team Assignment #2: MVP Development & Showcase', type: 'due' },
    { date: '2026-04-13', classId: 'writing', title: 'Portfolio Conferences (In-Person)', type: 'conference' },
    { date: '2026-04-13', classId: 'baep450', title: 'Individual Assignment #4: Greif Center Passport', type: 'due' },
    { date: '2026-04-14', classId: 'writing', title: 'Portfolio Conferences (Zoom)', type: 'conference', endDate: '2026-04-16' },
    { date: '2026-04-21', classId: 'writing', title: 'Portfolio Conference', type: 'conference' },
    { date: '2026-04-27', classId: 'baep450', title: 'Team Assignment #3: Final Presentations', type: 'due' },
    { date: '2026-05-05', classId: 'writing', title: 'Portfolios & Assignment #4 Due', type: 'due' },
    { date: '2026-05-07', classId: 'econ357', title: 'Final Exam (4:30 PM)', type: 'exam' },
    { date: '2026-05-13', classId: 'math118', title: 'Final Exam (8:00 AM)', type: 'exam' },
  ];

  const STORAGE_KEY = 'classDashboard_completed';

  function loadCompleted() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
    } catch { return {}; }
  }

  function saveCompleted(map) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }

  let completedMap = loadCompleted();
  let showPast = false;

  function assignmentId(a) {
    return `${a.date}_${a.classId}_${a.title}`;
  }

  function parseDate(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }

  function formatDate(d) {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function weekdayShort(d) {
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  }

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

  let activeFilter = 'all';
  let activeType = 'all';
  let activeView = 'timeline';
  let calMonth = TODAY.getMonth();
  let calYear = TODAY.getFullYear();

  document.getElementById('currentDate').textContent = formatDate(TODAY);
  renderSemesterProgress();
  renderStats();
  renderSpotlight();
  renderMainContent();
  bindFilters();
  bindTypeFilters();
  bindViews();

  function renderSemesterProgress() {
    const total = daysBetween(SEMESTER_START, SEMESTER_END);
    const elapsed = Math.min(Math.max(daysBetween(SEMESTER_START, TODAY), 0), total);
    const pct = Math.round((elapsed / total) * 100);
    document.getElementById('semesterProgress').style.width = pct + '%';
    document.getElementById('semesterPct').textContent = pct + '%';
  }

  function renderStats() {
    const filtered = getFilteredAssignments();
    const upcoming = filtered.filter(a => parseDate(a.date) >= TODAY);
    const past = filtered.filter(a => parseDate(a.date) < TODAY);
    const exams = upcoming.filter(a => a.type === 'exam');

    const nextUp = upcoming[0];
    const daysToNext = nextUp ? daysBetween(TODAY, parseDate(nextUp.date)) : null;

    const cards = [
      {
        icon: '📋',
        bg: 'rgba(96, 165, 250, 0.1)',
        value: upcoming.length,
        label: 'Upcoming'
      },
      {
        icon: '✅',
        bg: 'rgba(52, 211, 153, 0.1)',
        value: past.length,
        label: 'Past Events'
      },
      {
        icon: '📝',
        bg: 'rgba(248, 113, 113, 0.1)',
        value: exams.length,
        label: 'Exams Left'
      },
      {
        icon: '⏳',
        bg: 'rgba(251, 191, 36, 0.1)',
        value: daysToNext !== null ? daysToNext + 'd' : '—',
        label: daysToNext !== null ? `Until ${CLASSES[nextUp.classId].short}` : 'All done!'
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
    let pool = [...ASSIGNMENTS];
    if (activeFilter !== 'all') pool = pool.filter(a => a.classId === activeFilter);
    if (activeType !== 'all') pool = pool.filter(a => a.type === activeType);
    const upcoming = pool
      .filter(a => parseDate(a.date) >= TODAY)
      .filter(a => activeType !== 'all' || a.type === 'exam' || a.type === 'due')
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));

    const next = upcoming[0];
    if (!next) {
      document.getElementById('upcomingSpotlight').innerHTML = '';
      return;
    }

    const d = parseDate(next.date);
    const days = daysBetween(TODAY, d);
    const urg = urgencyClass(days);
    const cls = CLASSES[next.classId];

    document.getElementById('upcomingSpotlight').innerHTML = `
      <div class="spotlight-card ${urg}">
        <div class="spotlight-header">
          <span class="spotlight-label ${urg}">${days === 0 ? '🔴 Today' : days <= 3 ? '⚠️ Due Soon' : '📌 Next Up'}</span>
          <div class="spotlight-countdown">
            <div class="countdown-number ${urg}">${days === 0 ? 'TODAY' : days}</div>
            ${days > 0 ? `<div class="countdown-unit">day${days !== 1 ? 's' : ''} left</div>` : ''}
          </div>
        </div>
        <div class="spotlight-class" style="color: var(--${cls.color})">${cls.icon} ${cls.name}</div>
        <div class="spotlight-title">${next.title}</div>
        <div class="spotlight-date">${formatDate(d)}</div>
      </div>
    `;
  }

  function getFilteredAssignments() {
    let list = [...ASSIGNMENTS];
    if (activeFilter !== 'all') {
      list = list.filter(a => a.classId === activeFilter);
    }
    if (activeType !== 'all') {
      list = list.filter(a => a.type === activeType);
    }
    return list.sort((a, b) => parseDate(a.date) - parseDate(b.date));
  }

  function bindFilters() {
    document.getElementById('filterTabs').addEventListener('click', e => {
      const tab = e.target.closest('.filter-tab');
      if (!tab) return;
      document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeFilter = tab.dataset.filter;
      renderStats();
      renderSpotlight();
      renderMainContent();
    });
  }

  function bindTypeFilters() {
    document.getElementById('typeFilters').addEventListener('click', e => {
      const tab = e.target.closest('.type-tab');
      if (!tab) return;
      document.querySelectorAll('.type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      activeType = tab.dataset.type;
      renderStats();
      renderSpotlight();
      renderMainContent();
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

  // ===================== RENDER SINGLE TIMELINE ITEM =====================
  function renderTimelineItem(a) {
    const d = parseDate(a.date);
    const days = daysBetween(TODAY, d);
    const isPast = days < 0;
    const isToday = days === 0;
    const cls = CLASSES[a.classId];
    const id = assignmentId(a);
    const done = !!completedMap[id];

    return `
      <div class="timeline-item ${isToday ? 'today' : ''} ${done ? 'completed' : ''}">
        <div class="tl-date">
          <div class="tl-date-day">${d.getDate()}</div>
          <div class="tl-date-weekday">${weekdayShort(d)}</div>
        </div>
        <div class="tl-dot-container">
          <div class="tl-dot ${a.classId}"></div>
        </div>
        <div class="tl-content">
          <div class="tl-class ${a.classId}">${cls.short}</div>
          <div class="tl-title">${a.title}</div>
          <div class="tl-meta">
            <span class="tl-badge ${a.type}">${a.type}</span>
            ${a.endDate ? `<span style="font-size:0.7rem;color:var(--text-dim)">→ ${parseDate(a.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>` : ''}
          </div>
        </div>
        ${isPast
          ? `<button class="tl-check ${done ? 'checked' : ''}" data-id="${id}" title="Mark complete"></button>`
          : `<div class="tl-countdown">
              <div class="tl-countdown-num ${countdownClass(days)}">${isToday ? 'Today' : days + 'd'}</div>
              <div class="tl-countdown-label">${isToday ? '⚡' : 'remaining'}</div>
            </div>`
        }
      </div>`;
  }

  // ===================== TIMELINE VIEW =====================
  function renderTimeline(container) {
    const items = getFilteredAssignments();
    if (!items.length) {
      container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No assignments for this filter</div></div>`;
      return;
    }

    const upcomingItems = items.filter(a => parseDate(a.date) >= TODAY);
    const pastItems = items.filter(a => parseDate(a.date) < TODAY);

    let html = '<div class="timeline">';

    // Past events collapsible
    if (pastItems.length > 0) {
      html += `
        <div class="past-toggle-section">
          <button class="past-toggle-btn" id="pastToggleBtn">
            <svg class="past-toggle-chevron ${showPast ? 'open' : ''}" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"></polyline>
            </svg>
            <span>Past Events</span>
            <span class="past-toggle-count">${pastItems.length}</span>
          </button>
          <div class="past-events-container ${showPast ? 'open' : ''}" id="pastEventsContainer">`;

      const pastGrouped = {};
      pastItems.forEach(a => {
        const d = parseDate(a.date);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!pastGrouped[key]) pastGrouped[key] = [];
        pastGrouped[key].push(a);
      });

      Object.keys(pastGrouped).sort().forEach(key => {
        const [y, m] = key.split('-').map(Number);
        const monthName = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        html += `<div class="timeline-month"><div class="month-header">${monthName}</div>`;
        pastGrouped[key].forEach(a => { html += renderTimelineItem(a); });
        html += '</div>';
      });

      html += `</div></div>`;
    }

    // Upcoming events (always visible)
    if (upcomingItems.length > 0) {
      const upGrouped = {};
      upcomingItems.forEach(a => {
        const d = parseDate(a.date);
        const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`;
        if (!upGrouped[key]) upGrouped[key] = [];
        upGrouped[key].push(a);
      });

      Object.keys(upGrouped).sort().forEach(key => {
        const [y, m] = key.split('-').map(Number);
        const monthName = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        html += `<div class="timeline-month"><div class="month-header">${monthName}</div>`;
        upGrouped[key].forEach(a => { html += renderTimelineItem(a); });
        html += '</div>';
      });
    } else {
      html += `<div class="empty-state"><div class="empty-state-icon">🎉</div><div class="empty-state-text">No more upcoming assignments!</div></div>`;
    }

    html += '</div>';
    container.innerHTML = html;
  }

  // ===================== CALENDAR VIEW =====================
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
        <div class="cal-header">Sun</div>
        <div class="cal-header">Mon</div>
        <div class="cal-header">Tue</div>
        <div class="cal-header">Wed</div>
        <div class="cal-header">Thu</div>
        <div class="cal-header">Fri</div>
        <div class="cal-header">Sat</div>`;

    for (let i = 0; i < startWeekday; i++) {
      html += '<div class="cal-day empty"></div>';
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const thisDate = new Date(calYear, calMonth, d);
      const isToday = thisDate.getTime() === TODAY.getTime();
      const isPast = thisDate < TODAY;
      const events = eventsByDay[d] || [];

      html += `<div class="cal-day ${isToday ? 'today' : ''} ${isPast && !isToday ? 'past' : ''}">
        <div class="cal-day-num">${d}</div>
        ${events.map(e => `<div class="cal-event ${e.classId}" title="${CLASSES[e.classId].short}: ${e.title}">${e.title}</div>`).join('')}
      </div>`;
    }

    html += '</div>';
    container.innerHTML = html;

    document.getElementById('calPrev').addEventListener('click', () => {
      calMonth--;
      if (calMonth < 0) { calMonth = 11; calYear--; }
      renderCalendar(container);
    });
    document.getElementById('calNext').addEventListener('click', () => {
      calMonth++;
      if (calMonth > 11) { calMonth = 0; calYear++; }
      renderCalendar(container);
    });
  }

  // ===================== BY CLASS VIEW =====================
  function renderByClass(container) {
    const classIds = activeFilter === 'all'
      ? Object.keys(CLASSES)
      : [activeFilter];

    let html = '<div class="class-grid">';

    classIds.forEach(cid => {
      const cls = CLASSES[cid];
      let allItems = ASSIGNMENTS.filter(a => a.classId === cid);
      if (activeType !== 'all') allItems = allItems.filter(a => a.type === activeType);
      allItems.sort((a, b) => parseDate(a.date) - parseDate(b.date));
      const upcomingItems = allItems.filter(a => parseDate(a.date) >= TODAY);
      const pastItems = allItems.filter(a => parseDate(a.date) < TODAY);

      html += `
        <div class="class-card ${cid}">
          <div class="class-card-header">
            <div class="class-card-name">${cls.icon} ${cls.name}</div>
            <div class="class-card-sub">${upcomingItems.length} upcoming · ${pastItems.length} past</div>
          </div>
          <div class="class-card-body">`;

      // Upcoming items always visible
      upcomingItems.forEach(a => {
        const d = parseDate(a.date);
        const id = assignmentId(a);
        const done = !!completedMap[id];
        html += `
            <div class="class-item">
              <button class="tl-check ${done ? 'checked' : ''}" data-id="${id}" title="Mark complete"
                style="width:16px;height:16px;min-width:16px"></button>
              <div class="class-item-info">
                <div class="class-item-title">${a.title}</div>
                <div class="class-item-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              <span class="class-item-badge tl-badge ${a.type}">${a.type}</span>
            </div>`;
      });

      // Past items collapsible
      if (pastItems.length > 0) {
        html += `
          <div class="class-past-section">
            <button class="class-past-toggle" data-target="past-${cid}">
              <svg class="past-toggle-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
              </svg>
              <span>${pastItems.length} past event${pastItems.length !== 1 ? 's' : ''}</span>
            </button>
            <div class="class-past-items" id="past-${cid}" style="display:none;">`;

        pastItems.forEach(a => {
          const d = parseDate(a.date);
          const id = assignmentId(a);
          const done = !!completedMap[id];
          html += `
              <div class="class-item past">
                <button class="tl-check ${done ? 'checked' : ''}" data-id="${id}" title="Mark complete"
                  style="width:16px;height:16px;min-width:16px"></button>
                <div class="class-item-info">
                  <div class="class-item-title">${a.title}</div>
                  <div class="class-item-date">${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
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

    // Bind class-level past toggles
    document.querySelectorAll('.class-past-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.dataset.target;
        const target = document.getElementById(targetId);
        const chevron = btn.querySelector('.past-toggle-chevron');
        if (target.style.display === 'none') {
          target.style.display = 'block';
          chevron.classList.add('open');
        } else {
          target.style.display = 'none';
          chevron.classList.remove('open');
        }
      });
    });
  }

  // ===================== PAST TOGGLE =====================
  function bindPastToggle() {
    const btn = document.getElementById('pastToggleBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
      showPast = !showPast;
      const chevron = btn.querySelector('.past-toggle-chevron');
      const container = document.getElementById('pastEventsContainer');
      chevron.classList.toggle('open', showPast);
      container.classList.toggle('open', showPast);
    });
  }

  // ===================== CHECKBOX HANDLER =====================
  function bindCheckboxes() {
    document.querySelectorAll('.tl-check').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        completedMap[id] = !completedMap[id];
        saveCompleted(completedMap);
        btn.classList.toggle('checked');
        const item = btn.closest('.timeline-item') || btn.closest('.class-item');
        if (item) item.classList.toggle('completed');
        renderStats();
      });
    });
  }
})();
