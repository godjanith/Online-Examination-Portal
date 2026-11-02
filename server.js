require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database/db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'local-development-secret-change-before-deploying',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 3 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please log in first.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Administrator access required.' });
  }
  next();
}

// Authentication
app.post('/api/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({ error: 'Enter name, email and a password of at least 6 characters.' });
  }
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
    ).run(name.trim(), email.trim().toLowerCase(), hash, 'student');
    req.session.user = { id: result.lastInsertRowid, name: name.trim(), email: email.trim().toLowerCase(), role: 'student' };
    res.json({ user: req.session.user });
  } catch (err) {
    res.status(409).json({ error: 'That email address is already registered.' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get((email || '').trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password || '', user.password)) {
    return res.status(401).json({ error: 'Incorrect email or password.' });
  }
  req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ user: req.session.user });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out.' }));
});
app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));

// Student: available exams
app.get('/api/exams', requireAuth, (req, res) => {
  const exams = db.prepare(`
    SELECT e.id, e.title, e.description, e.duration_minutes, e.total_marks,
      (SELECT COUNT(*) FROM questions q WHERE q.exam_id=e.id) AS question_count
    FROM exams e WHERE e.is_published=1 ORDER BY e.id DESC
  `).all();
  res.json(exams);
});

app.get('/api/exams/:id', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND is_published=1').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const questions = db.prepare(`
    SELECT id, question_text, option_a, option_b, option_c, option_d
    FROM questions WHERE exam_id=? ORDER BY id
  `).all(exam.id);
  res.json({ ...exam, questions });
});

app.post('/api/exams/:id/submit', requireAuth, (req, res) => {
  const exam = db.prepare('SELECT * FROM exams WHERE id=? AND is_published=1').get(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Exam not found.' });
  const questions = db.prepare('SELECT id, correct_option, marks FROM questions WHERE exam_id=?').all(exam.id);
  if (!Array.isArray(req.body.answers)) return res.status(400).json({ error: 'Answers must be an array.' });

  const answerMap = new Map(req.body.answers.map(a => [Number(a.questionId), a.selectedOption]));
  let score = 0;
  const insert = db.prepare(`INSERT INTO attempts (user_id, exam_id, score, total_marks) VALUES (?, ?, ?, ?)`);
  const insertAnswer = db.prepare(`INSERT INTO attempt_answers (attempt_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)`);
  const transaction = db.transaction(() => {
    const total = questions.reduce((sum, q) => sum + q.marks, 0);
    // Insert a placeholder, then update score after checking responses.
    const attempt = insert.run(req.session.user.id, exam.id, 0, total);
    for (const q of questions) {
      const selected = answerMap.get(q.id) || null;
      const correct = selected === q.correct_option;
      if (correct) score += q.marks;
      insertAnswer.run(attempt.lastInsertRowid, q.id, selected, correct ? 1 : 0);
    }
    db.prepare('UPDATE attempts SET score=? WHERE id=?').run(score, attempt.lastInsertRowid);
    return { id: attempt.lastInsertRowid, total };
  });
  const attempt = transaction();
  res.json({ attemptId: attempt.id, score, totalMarks: attempt.total, percentage: attempt.total ? Math.round(score / attempt.total * 100) : 0 });
});

app.get('/api/results', requireAuth, (req, res) => {
  const results = db.prepare(`
    SELECT a.id, e.title, a.score, a.total_marks, a.submitted_at
    FROM attempts a JOIN exams e ON e.id=a.exam_id
    WHERE a.user_id=? ORDER BY a.submitted_at DESC
  `).all(req.session.user.id);
  res.json(results);
});

// Admin APIs
app.get('/api/admin/exams', requireAdmin, (req, res) => {
  res.json(db.prepare('SELECT * FROM exams ORDER BY id DESC').all());
});
app.post('/api/admin/exams', requireAdmin, (req, res) => {
  const { title, description, duration, questions } = req.body;
  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Exam title and at least one question are required.' });
  }
  const create = db.transaction(() => {
    const exam = db.prepare(`INSERT INTO exams (title, description, duration_minutes, total_marks, is_published)
      VALUES (?, ?, ?, ?, 1)`).run(title, description || '', Number(duration) || 30,
      questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0));
    const add = db.prepare(`INSERT INTO questions
      (exam_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const q of questions) {
      if (!q.text || !q.a || !q.b || !q.c || !q.d || !['A','B','C','D'].includes(q.correct)) {
        throw new Error('Each question needs text, four options and a correct answer.');
      }
      add.run(exam.lastInsertRowid, q.text, q.a, q.b, q.c, q.d, q.correct, Number(q.marks) || 1);
    }
    return exam.lastInsertRowid;
  });
  try {
    res.status(201).json({ examId: create() });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
app.get('/api/admin/results', requireAdmin, (req, res) => {
  res.json(db.prepare(`
    SELECT u.name, u.email, e.title, a.score, a.total_marks, a.submitted_at
    FROM attempts a JOIN users u ON u.id=a.user_id JOIN exams e ON e.id=a.exam_id
    ORDER BY a.submitted_at DESC
  `).all());
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Online Examination System running at http://localhost:${PORT}`);
});
