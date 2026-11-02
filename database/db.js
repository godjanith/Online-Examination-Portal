
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

// Create database connection
const dataDir = __dirname;

if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(
    path.join(dataDir, 'examination.db')
);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create database tables
db.exec(`
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'student',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    total_marks INTEGER NOT NULL DEFAULT 0,
    is_published INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    question_text TEXT NOT NULL,
    option_a TEXT NOT NULL,
    option_b TEXT NOT NULL,
    option_c TEXT NOT NULL,
    option_d TEXT NOT NULL,
    correct_option TEXT NOT NULL CHECK(correct_option IN ('A','B','C','D')),
    marks INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    exam_id INTEGER NOT NULL REFERENCES exams(id),
    score INTEGER NOT NULL DEFAULT 0,
    total_marks INTEGER NOT NULL,
    submitted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attempt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES questions(id),
    selected_option TEXT,
    is_correct INTEGER NOT NULL DEFAULT 0
);
`);

// Create admin account
const admin = db.prepare(
    'SELECT id FROM users WHERE email=?'
).get('admin@example.com');

if (!admin) {
    db.prepare(`
        INSERT INTO users (name,email,password,role)
        VALUES (?,?,?,?)
    `).run(
        'Administrator',
        'admin@example.com',
        bcrypt.hashSync('Admin@123', 10),
        'admin'
    );
}

// Insert sample examinations if they do not exist
const checkExam = db.prepare('SELECT id FROM exams WHERE title = ?');

const addExam = db.prepare(`
    INSERT INTO exams
    (title,description,duration_minutes,total_marks)
    VALUES (?,?,?,?)
`);

const addQuestion = db.prepare(`
    INSERT INTO questions
    (exam_id,question_text,option_a,option_b,
     option_c,option_d,correct_option,marks)
    VALUES (?,?,?,?,?,?,?,?)
`);

// JavaScript Fundamentals
if (!checkExam.get('JavaScript Fundamentals')) {
    const jsId = addExam.run(
        'JavaScript Fundamentals',
        'Test your JavaScript knowledge.',
        15, 5
    ).lastInsertRowid;

    const jsQuestions = [
        ['Which keyword declares a block-scoped variable?', 'var', 'let', 'define', 'dim', 'B'],
        ['Which method converts JSON text into an object?', 'JSON.parse()', 'JSON.stringify()', 'JSON.object()', 'JSON.convert()', 'A'],
        ['Which operator checks both value and type?', '==', '=', '===', '!=', 'C'],
        ['Which method adds an item to the end of an array?', 'pop()', 'shift()', 'unshift()', 'push()', 'D'],
        ['Which keyword defines a constant?', 'let', 'const', 'static', 'final', 'B']
    ];

    jsQuestions.forEach(q =>
        addQuestion.run(jsId, ...q, 1)
    );
}

// Python Programming
if (!checkExam.get('Python Programming')) {
    const pythonId = addExam.run(
        'Python Programming',
        'Test your Python programming knowledge.',
        20, 10
    ).lastInsertRowid;

    const pythonQuestions = [
        ['Which symbol is used for comments?', '//', '#', '/* */', '--', 'B'],
        ['Which function displays output?', 'input()', 'print()', 'display()', 'show()', 'B'],
        ['Which data type stores True or False?', 'int', 'str', 'bool', 'float', 'C'],
        ['Which keyword defines a function?', 'function', 'define', 'def', 'fun', 'C'],
        ['Which collection stores key-value pairs?', 'List', 'Tuple', 'Set', 'Dictionary', 'D'],
        ['Which operator performs exponentiation?', '^', '**', '//', '%', 'B'],
        ['Which method adds an element to a list?', 'add()', 'append()', 'insertEnd()', 'push()', 'B'],
        ['Which loop iterates over a sequence?', 'repeat', 'foreach', 'for', 'loop', 'C'],
        ['What is len("Python")?', '5', '6', '7', '8', 'B'],
        ['Which keyword handles exceptions?', 'catch', 'error', 'try', 'check', 'C']
    ];

    pythonQuestions.forEach(q =>
        addQuestion.run(pythonId, ...q, 1)
    );
}

// Database Management System
if (!checkExam.get('Database Management System (DBMS)')) {
    const dbmsId = addExam.run(
        'Database Management System (DBMS)',
        'Test your database and SQL knowledge.',
        20, 10
    ).lastInsertRowid;

    const dbmsQuestions = [
        ['What does DBMS stand for?', 'Database Management System', 'Data Backup Management System', 'Database Machine System', 'Data Basic Management System', 'A'],
        ['Which SQL command retrieves data?', 'INSERT', 'UPDATE', 'SELECT', 'DELETE', 'C'],
        ['Which key uniquely identifies a record?', 'Foreign Key', 'Primary Key', 'Candidate Key', 'Alternate Key', 'B'],
        ['Which SQL command removes a table?', 'DELETE', 'REMOVE', 'DROP', 'CLEAR', 'C'],
        ['Which command inserts new records?', 'INSERT', 'UPDATE', 'SELECT', 'ALTER', 'A'],
        ['What does SQL stand for?', 'Simple Query Language', 'Structured Query Language', 'Standard Question Language', 'System Query Logic', 'B'],
        ['Which clause filters records?', 'ORDER BY', 'GROUP BY', 'WHERE', 'FROM', 'C'],
        ['Which command modifies existing records?', 'CHANGE', 'MODIFY', 'UPDATE', 'ALTER', 'C'],
        ['Which key creates a relationship between tables?', 'Primary Key', 'Foreign Key', 'Super Key', 'Unique Key', 'B'],
        ['Which SQL function counts rows?', 'SUM()', 'AVG()', 'COUNT()', 'TOTAL()', 'C']
    ];

    dbmsQuestions.forEach(q =>
        addQuestion.run(dbmsId, ...q, 1)
    );
}

module.exports = db;

console.log('SQLite database connected successfully!');
