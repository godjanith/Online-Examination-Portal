const $ = (s) => document.querySelector(s);
const views = ['auth-view','student-view','exam-view','result-view','admin-view'];
let currentUser = null, activeExam = null, timerInterval = null, secondsLeft = 0;

function showView(id) {
  views.forEach(v => $('#'+v).classList.toggle('hidden', v !== id));
}
function toast(message) {
  const el = $('#toast'); el.textContent = message; el.style.display = 'block';
  setTimeout(() => el.style.display = 'none', 3200);
}
async function api(url, options = {}) {
  const res = await fetch(url, { headers: {'Content-Type':'application/json'}, ...options });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function setUser(user) {
  currentUser = user;
  const nav = $('#nav-user');
  nav.replaceChildren();
  if (!user) return;

  const identity = document.createElement('span');
  identity.textContent = `${user.name} · ${user.role}`;
  const logoutButton = document.createElement('button');
  logoutButton.className = 'secondary';
  logoutButton.id = 'logout-btn';
  logoutButton.textContent = 'Logout';
  logoutButton.addEventListener('click', logout);
  nav.append(identity, logoutButton);
}
async function logout() {
  await api('/api/logout',{method:'POST'}); setUser(null); showView('auth-view');
}
document.querySelectorAll('.tab').forEach(btn => btn.onclick = () => {
  document.querySelectorAll('.tab').forEach(b => b.classList.toggle('active', b===btn));
  $('#login-form').classList.toggle('hidden', btn.dataset.tab!=='login');
  $('#register-form').classList.toggle('hidden', btn.dataset.tab!=='register');
  $('#auth-message').textContent = '';
});
$('#login-form').onsubmit = async e => {
  e.preventDefault(); const body = Object.fromEntries(new FormData(e.target));
  try { const data = await api('/api/login',{method:'POST',body:JSON.stringify(body)}); await enter(data.user); }
  catch(err) { $('#auth-message').textContent = err.message; }
};
$('#register-form').onsubmit = async e => {
  e.preventDefault(); const body = Object.fromEntries(new FormData(e.target));
  try { const data = await api('/api/register',{method:'POST',body:JSON.stringify(body)}); await enter(data.user); }
  catch(err) { $('#auth-message').textContent = err.message; }
};
async function enter(user) {
  setUser(user);
  if (user.role==='admin') { showView('admin-view'); await loadAdmin(); }
  else { showView('student-view'); await loadStudent(); }
}
async function loadStudent() {
  const exams = await api('/api/exams');
  $('#exam-list').innerHTML = exams.length ? exams.map(e => `
    <article class="exam-card"><p class="eyebrow">AVAILABLE TEST</p><h3>${escapeHtml(e.title)}</h3>
    <p>${escapeHtml(e.description || 'Test your knowledge with this examination.')}</p>
    <div class="meta">${e.question_count} questions · ${e.duration_minutes} minutes · ${e.total_marks} marks</div>
    <button onclick="startExam(${e.id})">Start examination →</button></article>`).join('') : '<p>No exams are published yet.</p>';
  const results = await api('/api/results');
  $('#my-results').innerHTML = table(['Exam','Score','Submitted'], results.map(r=>[r.title,`${r.score}/${r.total_marks}`,r.submitted_at]));
}
async function startExam(id) {
  try {
    activeExam = await api('/api/exams/'+id);
    $('#exam-title').textContent = activeExam.title;
    $('#exam-description').textContent = activeExam.description || '';
    $('#question-list').innerHTML = activeExam.questions.map((q,i)=>`
      <div class="question"><h3>${i+1}. ${escapeHtml(q.question_text)} <span class="small-muted">(${q.marks || 1} mark)</span></h3>
      ${['A','B','C','D'].map(letter=>`<label class="option"><input type="radio" name="q${q.id}" value="${letter}"> <b>${letter}.</b> ${escapeHtml(q['option_'+letter.toLowerCase()])}</label>`).join('')}
    </div>`).join('');
    showView('exam-view'); startTimer(activeExam.duration_minutes * 60);
  } catch(err) { toast(err.message); }
}
function startTimer(seconds) {
  clearInterval(timerInterval); secondsLeft = seconds; updateTimer();
  timerInterval = setInterval(() => { secondsLeft--; updateTimer(); if(secondsLeft<=0){clearInterval(timerInterval); submitExam(true);} },1000);
}
function updateTimer() {
  const m=String(Math.floor(secondsLeft/60)).padStart(2,'0'), s=String(secondsLeft%60).padStart(2,'0');
  $('#timer').textContent = `${m}:${s}`;
}
$('#exam-form').onsubmit = e => { e.preventDefault(); if(confirm('Submit your answers now?')) submitExam(false); };
async function submitExam(auto) {
  if(!activeExam) return;
  clearInterval(timerInterval);
  const answers = activeExam.questions.map(q => {
    const selected = document.querySelector(`input[name="q${q.id}"]:checked`);
    return {questionId:q.id, selectedOption:selected ? selected.value : null};
  });
  try {
    const result = await api(`/api/exams/${activeExam.id}/submit`,{method:'POST',body:JSON.stringify({answers})});
    $('#score-value').textContent = `${result.score}/${result.totalMarks}`;
    $('#score-detail').textContent = `You scored ${result.percentage}%. ${auto ? 'The time limit ended and your answers were submitted.' : 'Your answers have been submitted successfully.'}`;
    activeExam = null; showView('result-view');
  } catch(err) { toast(err.message); }
}
$('#back-dashboard').onclick = async () => { showView('student-view'); await loadStudent(); };

function table(headers, rows) {
  if (!rows.length) return '<p class="small-muted">No records found.</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escapeHtml(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Admin question builder
let questionCount = 0;
function addQuestionEditor() {
  questionCount++;
  const wrap = document.createElement('div'); wrap.className='question-editor'; wrap.dataset.question='1';
  wrap.innerHTML = `<h3>Question ${questionCount}</h3>
    <label>Question<input class="q-text" required></label>
    <div class="two"><label>Option A<input class="q-a" required></label><label>Option B<input class="q-b" required></label>
    <label>Option C<input class="q-c" required></label><label>Option D<input class="q-d" required></label></div>
    <div class="two"><label>Correct option<select class="q-correct"><option>A</option><option>B</option><option>C</option><option>D</option></select></label>
    <label>Marks<input class="q-marks" type="number" min="1" value="1"></label></div>`;
  $('#question-editor').appendChild(wrap);
}
$('#add-question').onclick = addQuestionEditor;
$('#create-exam-form').onsubmit = async e => {
  e.preventDefault();
  const questions = [...document.querySelectorAll('.question-editor')].map(el=>({
    text:el.querySelector('.q-text').value, a:el.querySelector('.q-a').value, b:el.querySelector('.q-b').value,
    c:el.querySelector('.q-c').value, d:el.querySelector('.q-d').value,
    correct:el.querySelector('.q-correct').value, marks:Number(el.querySelector('.q-marks').value)
  }));
  const form = new FormData(e.target);
  try {
    await api('/api/admin/exams',{method:'POST',body:JSON.stringify({
      title:form.get('title'),description:form.get('description'),duration:form.get('duration'),questions
    })});
    toast('Exam published successfully.'); e.target.reset(); $('#question-editor').innerHTML=''; questionCount=0; addQuestionEditor(); await loadAdmin();
  } catch(err) { toast(err.message); }
};
async function loadAdmin() {
  const exams = await api('/api/admin/exams');
  $('#admin-exams').innerHTML = exams.length ? exams.map(e=>`<p><b>${escapeHtml(e.title)}</b><br><span class="small-muted">${e.duration_minutes} min · ${e.total_marks} marks</span></p>`).join('') : '<p>No exams yet.</p>';
  const results = await api('/api/admin/results');
  $('#admin-results').innerHTML = table(['Student','Exam','Score','Date'],results.map(r=>[`${r.name} (${r.email})`,r.title,`${r.score}/${r.total_marks}`,r.submitted_at]));
}
async function init() {
  try {
    const data = await api('/api/me');
    if(data.user) await enter(data.user); else showView('auth-view');
  } catch { showView('auth-view'); }
  addQuestionEditor();
}
init();
