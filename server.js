require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const crypto = require('crypto');

async function callOpenAI(content) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set.');

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: 'gpt-4.1',
      messages: [{ role: 'user', content }],
      max_tokens: 16384,
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error('Invalid OpenAI API key.');
    if (res.status === 429) throw new Error('OpenAI rate limit — try again in a moment.');
    if (res.status === 402 || body.includes('insufficient_quota')) throw new Error('OpenAI account has no credits. Add funds at platform.openai.com/account/billing');
    throw new Error(`OpenAI error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (!reply) throw new Error('OpenAI returned an empty response.');
  return reply;
}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CLASS_ICONS = ['📚', '📐', '💰', '🚀', '✍️', '🔬', '🎨', '📊', '💻', '🏛️', '🧮', '📝'];

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['application/pdf', 'text/plain', 'image/png', 'image/jpeg', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  }
});

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '30d' });
}

function authMiddleware(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.userId = jwt.verify(token, JWT_SECRET).userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function setAuthCookie(res, token) {
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 });
}

const EXTRACTION_PROMPT = `You extract structured class schedule data from syllabuses, spreadsheets, and calendar exports. Output ONLY valid JSON — no markdown, no backticks, no explanation. Use this exact schema:
{
  "semester_name": "Spring 2026",
  "semester_start": "2026-01-12",
  "semester_end": "2026-05-13",
  "classes": [
    {
      "name": "Full Class Name",
      "short_name": "SHORT",
      "assignments": [
        { "title": "Assignment Title", "date": "2026-02-15", "end_date": null, "type": "due" }
      ]
    }
  ]
}

Rules:
- type must be one of: "exam", "due", "quiz", "discussion", "conference", "workshop", "prep"
- "discussion" = discussion posts, discussion boards, class discussions, forum posts — these are scheduled class activities, NOT homework assignments
- "due" = homework, papers, projects, presentations, labs, readings, essays, problem sets
- "exam" = midterms, finals, exams, tests
- "quiz" = quizzes, pop quizzes
- "conference" = one-on-one meetings, office hours appointments, conferences with professor
- "workshop" = in-class workshops, peer review sessions, group activities
- "prep" = preparation tasks, pre-class readings, study guides
- ALL dates MUST be YYYY-MM-DD format. Pay very close attention to dates:
  * If the input is a spreadsheet or table, dates may be in columns — map them carefully to each row
  * Dates may be in M/D/YYYY, MM/DD/YYYY, DD-Mon-YYYY, "January 15, 2026", or other formats — convert ALL to YYYY-MM-DD
  * If a date says "Week 5" or "Week of Jan 20", use the Monday of that week
  * If only a month and day are given without a year, infer the year from the semester context
  * DOUBLE-CHECK every date you output — an incorrect date is worse than a missing item
- end_date is only for multi-day events, otherwise null
- You MUST capture EVERY numbered assignment, homework, quiz, exam, paper, project, presentation, lab, discussion post, reading, and any item with a due date or deadline — do NOT skip any
- SKIP ONLY: holidays, university closures, break days, "no class" days, and purely administrative dates (registration, add/drop, withdrawal) with no student deliverable
- If semester dates aren't explicit, estimate from the first and last assignment dates with 1 week padding
- short_name should be a brief identifier (e.g. "MATH 118", "ECON 357", "Writing")
- If the input is a Google Sheets export, CSV, or calendar file, each row or event is typically one item — extract them all
- If column headers indicate dates, map each cell value to its correct date column
- When in doubt about whether something is an assignment, INCLUDE it — it is far better to include too many items than to miss one
- Output ONLY the JSON object, nothing else`;

// ======================== AUTH (Supabase Auth) ========================

app.post('/api/register', async (req, res) => {
  try {
    const { email, password, name } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'All fields required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const { data, error } = await supabase.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true,
      user_metadata: { name: name.trim() }
    });

    if (error) {
      if (error.message.includes('already been registered')) {
        return res.status(409).json({ error: 'Email already registered' });
      }
      return res.status(400).json({ error: error.message });
    }

    const token = signToken(data.user.id);
    setAuthCookie(res, token);
    res.json({ ok: true, name: name.trim() });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'All fields required' });

    const response = await fetch(`${process.env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: email.toLowerCase().trim(), password })
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(data.user.id);
    setAuthCookie(res, token);
    res.json({ ok: true, name: data.user.user_metadata?.name || email.split('@')[0] });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase.auth.admin.getUserById(req.userId);
    if (error || !data.user) return res.status(404).json({ error: 'User not found' });
    res.json({ id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name || '' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// ======================== SYLLABUS PARSE (OpenAI) ========================

app.post('/api/upload-syllabus', authMiddleware, upload.array('files', 10), async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  let textPrompt = EXTRACTION_PROMPT + '\n\nExtract the class schedule from the following syllabuses:\n';
  const imageParts = [];
  const fileErrors = [];
  let hasContent = false;

  for (const file of req.files) {
    try {
      if (file.mimetype === 'application/pdf') {
        let gotText = false;
        try {
          const data = await pdfParse(file.buffer);
          if (data.text && data.text.trim().length >= 50) {
            textPrompt += `\n--- ${file.originalname} ---\n${data.text}\n`;
            gotText = true;
            hasContent = true;
          }
        } catch (e) { /* pdf-parse failed, try image fallback */ }

        if (!gotText) {
          try {
            const { pdf } = await import('pdf-to-img');
            const doc = await pdf(file.buffer, { scale: 2.0 });
            let pageNum = 0;
            for await (const image of doc) {
              if (pageNum >= 15) break;
              const base64 = Buffer.from(image).toString('base64');
              imageParts.push({
                type: 'image_url',
                image_url: { url: `data:image/png;base64,${base64}`, detail: 'high' }
              });
              pageNum++;
            }
            if (pageNum > 0) {
              textPrompt += `\n--- ${file.originalname} (scanned PDF, ${pageNum} page images included) ---\n`;
              hasContent = true;
            } else {
              fileErrors.push(`${file.originalname}: PDF appears empty.`);
            }
          } catch (renderErr) {
            console.error(`PDF render error for ${file.originalname}:`, renderErr.message);
            fileErrors.push(`${file.originalname}: Could not read PDF — try uploading screenshots instead.`);
          }
        }
      } else if (file.mimetype === 'text/plain' || file.mimetype === 'text/calendar' ||
                 file.originalname.endsWith('.ics') || file.originalname.endsWith('.txt')) {
        const text = file.buffer.toString('utf-8');
        if (text.trim().length < 20) {
          fileErrors.push(`${file.originalname}: File appears empty or too short.`);
        } else {
          const label = (file.mimetype === 'text/calendar' || file.originalname.endsWith('.ics'))
            ? `${file.originalname} (iCalendar export)` : file.originalname;
          textPrompt += `\n--- ${label} ---\n${text}\n`;
          hasContent = true;
        }
      } else if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
        const text = file.buffer.toString('utf-8');
        if (text.trim().length < 20) {
          fileErrors.push(`${file.originalname}: CSV appears empty.`);
        } else {
          textPrompt += `\n--- ${file.originalname} (CSV spreadsheet) ---\n${text}\n`;
          hasContent = true;
        }
      } else if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                 file.mimetype === 'application/vnd.ms-excel' ||
                 file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
        try {
          const workbook = XLSX.read(file.buffer, { type: 'buffer', cellDates: true });
          let sheetText = '';
          for (const name of workbook.SheetNames) {
            const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[name]);
            if (csv.trim().length > 0) {
              sheetText += `\n[Sheet: ${name}]\n${csv}\n`;
            }
          }
          if (sheetText.trim().length < 20) {
            fileErrors.push(`${file.originalname}: Spreadsheet appears empty.`);
          } else {
            textPrompt += `\n--- ${file.originalname} (Google Sheets / Excel spreadsheet) ---\n${sheetText}\n`;
            hasContent = true;
          }
        } catch (xlErr) {
          console.error(`XLSX parse error for ${file.originalname}:`, xlErr.message);
          fileErrors.push(`${file.originalname}: Could not read spreadsheet — ${xlErr.message}`);
        }
      } else if (file.mimetype.startsWith('image/')) {
        const base64 = file.buffer.toString('base64');
        imageParts.push({
          type: 'image_url',
          image_url: { url: `data:${file.mimetype};base64,${base64}`, detail: 'high' }
        });
        textPrompt += `\n--- ${file.originalname} (image included) ---\n`;
        hasContent = true;
      }
    } catch (err) {
      console.error(`Error processing ${file.originalname}:`, err.message);
      fileErrors.push(`${file.originalname}: Failed to read — ${err.message}`);
    }
  }

  if (!hasContent) {
    return res.status(400).json({ error: `Could not read any files:\n${fileErrors.join('\n')}` });
  }

  const apiContent = imageParts.length > 0
    ? [{ type: 'text', text: textPrompt }, ...imageParts]
    : textPrompt;

  let raw;
  try {
    raw = await callOpenAI(apiContent);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return res.status(502).json({ error: err.message });
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON in response:', raw?.slice(0, 500));
      return res.status(502).json({ error: 'Could not read a schedule from those files. Try clearer PDFs with dates and assignments.' });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.semester_name || !parsed.classes || !Array.isArray(parsed.classes) || parsed.classes.length === 0) {
      console.error('Missing fields:', JSON.stringify(parsed).slice(0, 500));
      return res.status(422).json({ error: 'No classes or dates found. Make sure the syllabus has a schedule with dates.' });
    }
    res.json({ ok: true, data: parsed });
  } catch (err) {
    console.error('Parse error:', err.message, '| Raw:', raw?.slice(0, 500));
    res.status(502).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ======================== SAVE SCHEDULE ========================

app.post('/api/save-schedule', authMiddleware, async (req, res) => {
  const { semester_name, semester_start, semester_end, classes } = req.body;
  if (!semester_name || !semester_start || !semester_end || !classes?.length) {
    return res.status(400).json({ error: 'Invalid schedule data' });
  }

  try {
    await supabase.from('semesters').update({ is_active: false }).eq('user_id', req.userId);

    const { data: sem, error: semErr } = await supabase.from('semesters').insert({
      user_id: req.userId, name: semester_name, start_date: semester_start, end_date: semester_end
    }).select().single();
    if (semErr) throw semErr;

    for (let i = 0; i < classes.length; i++) {
      const cls = classes[i];
      const { data: classRow, error: clsErr } = await supabase.from('classes').insert({
        semester_id: sem.id, name: cls.name, short_name: cls.short_name,
        class_key: 'class' + (i + 1), icon: CLASS_ICONS[i % CLASS_ICONS.length], color_index: i % 8
      }).select().single();
      if (clsErr) throw clsErr;

      const assignments = (cls.assignments || []).map(a => ({
        class_id: classRow.id, title: a.title, date: a.date, end_date: a.end_date || null, type: a.type || 'due'
      }));
      if (assignments.length > 0) {
        const { error: aErr } = await supabase.from('assignments').insert(assignments);
        if (aErr) throw aErr;
      }
    }

    res.json({ ok: true, semesterId: sem.id });
  } catch (err) {
    console.error('Save error:', err.message);
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// ======================== ADD TO EXISTING SCHEDULE ========================

app.post('/api/add-to-schedule', authMiddleware, async (req, res) => {
  const { classes, semester_start, semester_end } = req.body;
  if (!classes?.length) return res.status(400).json({ error: 'No classes provided' });

  try {
    const { data: semesters } = await supabase.from('semesters')
      .select('*').eq('user_id', req.userId).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1);

    if (!semesters?.length) return res.status(404).json({ error: 'No active semester found' });
    const semester = semesters[0];

    const { data: existingClasses } = await supabase.from('classes')
      .select('*').eq('semester_id', semester.id);
    let nextIndex = (existingClasses || []).length;

    for (const cls of classes) {
      const match = (existingClasses || []).find(ec =>
        ec.name.toLowerCase().trim() === cls.name.toLowerCase().trim()
      );

      let classId;
      if (match) {
        classId = match.id;
      } else {
        const { data: classRow, error: clsErr } = await supabase.from('classes').insert({
          semester_id: semester.id, name: cls.name, short_name: cls.short_name,
          class_key: 'class' + (nextIndex + 1), icon: CLASS_ICONS[nextIndex % CLASS_ICONS.length], color_index: nextIndex % 8
        }).select().single();
        if (clsErr) throw clsErr;
        classId = classRow.id;
        nextIndex++;
      }

      const assignments = (cls.assignments || []).map(a => ({
        class_id: classId, title: a.title, date: a.date, end_date: a.end_date || null, type: a.type || 'due'
      }));
      if (assignments.length > 0) {
        const { error: aErr } = await supabase.from('assignments').insert(assignments);
        if (aErr) throw aErr;
      }
    }

    const updates = {};
    if (semester_start && semester_start < semester.start_date) updates.start_date = semester_start;
    if (semester_end && semester_end > semester.end_date) updates.end_date = semester_end;
    if (Object.keys(updates).length > 0) {
      await supabase.from('semesters').update(updates).eq('id', semester.id);
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('Add to schedule error:', err.message);
    res.status(500).json({ error: 'Failed to add to schedule' });
  }
});

// ======================== DASHBOARD DATA ========================

app.get('/api/dashboard', authMiddleware, async (req, res) => {
  try {
    const { data: semesters } = await supabase.from('semesters')
      .select('*').eq('user_id', req.userId).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1);

    if (!semesters || semesters.length === 0) return res.json({ hasSemester: false });
    const semester = semesters[0];

    const { data: classRows } = await supabase.from('classes')
      .select('*').eq('semester_id', semester.id);

    const classMap = {};
    const allAssignments = [];

    for (const cls of (classRows || [])) {
      classMap[cls.class_key] = {
        name: cls.name, short: cls.short_name, color: cls.color_index, icon: cls.icon, dbId: cls.id
      };
      const { data: aRows } = await supabase.from('assignments')
        .select('*').eq('class_id', cls.id);
      for (const a of (aRows || [])) {
        allAssignments.push({
          id: a.id, date: a.date, endDate: a.end_date, dueTime: a.due_time || null,
          classId: cls.class_key, title: a.title, type: a.type, completed: !!a.completed
        });
      }
    }

    res.json({
      hasSemester: true,
      semester: { id: semester.id, name: semester.name, startDate: semester.start_date, endDate: semester.end_date },
      classes: classMap,
      assignments: allAssignments
    });
  } catch (err) {
    console.error('Dashboard error:', err.message);
    res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

app.post('/api/toggle-complete', authMiddleware, async (req, res) => {
  try {
    const { assignmentId, completed } = req.body;

    const { data: rows } = await supabase.from('assignments')
      .select('id, classes!inner(semester_id, semesters!inner(user_id))')
      .eq('id', assignmentId);

    const owned = rows?.some(r => r.classes?.semesters?.user_id === req.userId);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    await supabase.from('assignments').update({ completed: !!completed }).eq('id', assignmentId);
    res.json({ ok: true });
  } catch (err) {
    console.error('Toggle error:', err.message);
    res.status(500).json({ error: 'Failed to update' });
  }
});

app.delete('/api/semester/:id', authMiddleware, async (req, res) => {
  try {
    const { data } = await supabase.from('semesters')
      .select('id').eq('id', req.params.id).eq('user_id', req.userId);
    if (!data?.length) return res.status(404).json({ error: 'Not found' });

    const { data: classRows } = await supabase.from('classes').select('id').eq('semester_id', req.params.id);
    const classIds = (classRows || []).map(c => c.id);
    if (classIds.length > 0) {
      await supabase.from('assignments').delete().in('class_id', classIds);
    }
    await supabase.from('classes').delete().eq('semester_id', req.params.id);
    await supabase.from('semesters').delete().eq('id', req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error('Delete error:', err.message);
    res.status(500).json({ error: 'Failed to delete' });
  }
});

// ======================== ASSIGNMENT CRUD ========================

app.post('/api/assignment', authMiddleware, async (req, res) => {
  const { classId, title, date, end_date, type, due_time } = req.body;
  if (!classId || !title || !date || !type) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const { data: cls } = await supabase.from('classes')
      .select('id, semester_id, semesters!inner(user_id)')
      .eq('id', classId).single();
    if (!cls || cls.semesters.user_id !== req.userId) return res.status(404).json({ error: 'Class not found' });

    const { data: row, error } = await supabase.from('assignments').insert({
      class_id: classId, title, date, end_date: end_date || null, type, due_time: due_time || null
    }).select().single();
    if (error) throw error;

    const classKey = (await supabase.from('classes').select('class_key').eq('id', classId).single()).data.class_key;
    res.json({ ok: true, assignment: { id: row.id, date: row.date, endDate: row.end_date, dueTime: row.due_time || null, classId: classKey, title: row.title, type: row.type, completed: false } });
  } catch (err) {
    console.error('Create assignment error:', err.message);
    res.status(500).json({ error: 'Failed to create assignment' });
  }
});

app.put('/api/assignment/:id', authMiddleware, async (req, res) => {
  const { title, date, end_date, type, due_time } = req.body;
  if (!title || !date || !type) return res.status(400).json({ error: 'Missing required fields' });

  try {
    const { data: rows } = await supabase.from('assignments')
      .select('id, classes!inner(semester_id, semesters!inner(user_id))')
      .eq('id', req.params.id);
    const owned = rows?.some(r => r.classes?.semesters?.user_id === req.userId);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    const { error } = await supabase.from('assignments').update({
      title, date, end_date: end_date || null, type, due_time: due_time || null
    }).eq('id', req.params.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Update assignment error:', err.message);
    res.status(500).json({ error: 'Failed to update assignment' });
  }
});

app.delete('/api/assignment/:id', authMiddleware, async (req, res) => {
  try {
    const { data: rows } = await supabase.from('assignments')
      .select('id, classes!inner(semester_id, semesters!inner(user_id))')
      .eq('id', req.params.id);
    const owned = rows?.some(r => r.classes?.semesters?.user_id === req.userId);
    if (!owned) return res.status(404).json({ error: 'Not found' });

    const { error } = await supabase.from('assignments').delete().eq('id', req.params.id);
    if (error) throw error;

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete assignment error:', err.message);
    res.status(500).json({ error: 'Failed to delete assignment' });
  }
});

// ======================== CLASS (SYLLABUS) DELETE ========================

app.delete('/api/class/:id', authMiddleware, async (req, res) => {
  try {
    const { data: cls } = await supabase.from('classes')
      .select('id, semester_id, semesters!inner(user_id)')
      .eq('id', req.params.id).single();
    if (!cls || cls.semesters.user_id !== req.userId) return res.status(404).json({ error: 'Not found' });

    await supabase.from('assignments').delete().eq('class_id', req.params.id);
    await supabase.from('classes').delete().eq('id', req.params.id);

    res.json({ ok: true });
  } catch (err) {
    console.error('Delete class error:', err.message);
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

// ======================== PARSE TEXT ========================

app.post('/api/parse-text', authMiddleware, async (req, res) => {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY is not configured on the server.' });
  }
  const { text } = req.body;
  if (!text || text.trim().length < 20) {
    return res.status(400).json({ error: 'Please paste more text — the input is too short.' });
  }

  const prompt = EXTRACTION_PROMPT + '\n\nExtract the class schedule from the following syllabus text:\n\n' + text;

  let raw;
  try {
    raw = await callOpenAI(prompt);
  } catch (err) {
    console.error('OpenAI error:', err.message);
    return res.status(502).json({ error: err.message });
  }

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON in response:', raw?.slice(0, 500));
      return res.status(502).json({ error: 'Could not extract a schedule from that text. Try pasting more detail with dates.' });
    }
    const parsed = JSON.parse(jsonMatch[0]);

    if (!parsed.semester_name || !parsed.classes || !Array.isArray(parsed.classes) || parsed.classes.length === 0) {
      console.error('Missing fields:', JSON.stringify(parsed).slice(0, 500));
      return res.status(422).json({ error: 'No classes or dates found in the text.' });
    }
    res.json({ ok: true, data: parsed });
  } catch (err) {
    console.error('Parse error:', err.message, '| Raw:', raw?.slice(0, 500));
    res.status(502).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ======================== PAGE ROUTES ========================

app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

app.get('/', (req, res) => {
  const token = req.cookies.token;
  if (token) {
    try {
      jwt.verify(token, JWT_SECRET);
      return res.redirect('/dashboard');
    } catch {}
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`SyllaBoard running at http://localhost:${PORT}`);
});
