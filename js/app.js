// ============================================================
//  CCNA 200-301 Trainer — logic
// ============================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  menu: $("#screen-menu"),
  study: $("#screen-study"),
  examSetup: $("#screen-exam-setup"),
  practiceSetup: $("#screen-practice-setup"),
  manage: $("#screen-manage"),
  quiz: $("#screen-quiz"),
  result: $("#screen-result"),
  review: $("#screen-review"),
};

let session = null; // current session

// ---------- Screen navigation ----------
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  window.scrollTo(0, 0);
}

// ---------- Main menu ----------
$("#btn-study").addEventListener("click", () => {
  renderToc();
  const saved = findStudyIndex(getStudyPosition());
  selectChapter(saved >= 0 ? saved : 0);
  showScreen("study");
});
$("#btn-exam").addEventListener("click", () => showScreen("examSetup"));
$("#btn-practice").addEventListener("click", () => {
  renderTopicList();
  showScreen("practiceSetup");
});

// ---------- Segmented buttons ----------
function bindSegmented(containerSel, onChange) {
  const container = $(containerSel);
  container.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    container.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    if (onChange) onChange(btn.dataset.value);
  });
}

const examSettings = { count: "50", time: "120", pass: "825" };
const practiceSettings = { count: "10" };

bindSegmented("#exam-count", v => examSettings.count = v);
bindSegmented("#exam-time", v => examSettings.time = v);
bindSegmented("#exam-pass", v => examSettings.pass = v);
bindSegmented("#practice-count", v => practiceSettings.count = v);

// ---------- Topic list (practice) ----------
function renderTopicList() {
  const wrap = $("#topic-list");
  wrap.innerHTML = "";
  const counts = {};
  allQuestions().forEach(q => counts[q.topic] = (counts[q.topic] || 0) + 1);
  allTopics().forEach(topic => {
    const item = document.createElement("label");
    item.className = "topic-item selected";
    item.innerHTML =
      `<input type="checkbox" class="topic-check" checked data-topic="${topic}">
       <span>${topic}</span>
       <span class="t-count">${counts[topic]}</span>`;
    item.addEventListener("click", (e) => {
      if (e.target.tagName === "INPUT") {
        const cb = item.querySelector(".topic-check");
        item.classList.toggle("selected", cb.checked);
      }
    });
    wrap.appendChild(item);
  });
}
function getSelectedTopics() {
  return $$(".topic-check:checked").length
    ? Array.from($$(".topic-check:checked")).map(c => c.dataset.topic)
    : [];
}

// ---------- Back navigation ----------
$("#btn-exam-back").addEventListener("click", () => showScreen("menu"));
$("#btn-practice-back").addEventListener("click", () => showScreen("menu"));

// ---------- Start a session ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function startSession(cfg) {
  let pool = cfg.mode === "exam"
    ? allQuestions()
    : allQuestions().filter(q => cfg.topics.includes(q.topic));

  if (cfg.shuffle) pool = shuffle(pool);
  if (cfg.count !== "all") pool = pool.slice(0, parseInt(cfg.count, 10));

  if (pool.length === 0) {
    alert("No questions available for the selected topics.");
    return;
  }

  const total = pool.length;
  session = {
    mode: cfg.mode,
    questions: pool,
    total,
    answers: new Array(total).fill(null),   // array of selected option indices
    flagged: new Array(total).fill(false),
    current: 0,
    startTime: Date.now(),
    timeLimitSec: cfg.time ? parseInt(cfg.time, 10) * 60 : 0,
    timerRunning: !!cfg.time,
    timeLeft: cfg.time ? parseInt(cfg.time, 10) * 60 : 0,
    passScore: cfg.pass ? parseInt(cfg.pass, 10) : null,
    practiceFeedback: cfg.mode === "practice",
    finished: false,
  };

  $("#timer-display").classList.remove("low");
  $("#topbar-info").textContent = cfg.mode === "exam" ? "Exam Simulator" : "Practice";
  updateTimerButton();
  renderQuestion();
  showScreen("quiz");
  startTimerTick();
}

$("#btn-exam-start").addEventListener("click", () => {
  startSession({
    mode: "exam",
    count: examSettings.count,
    time: examSettings.time !== "0" ? examSettings.time : 0,
    pass: examSettings.pass,
    shuffle: $("#exam-shuffle").checked,
  });
});

$("#btn-practice-start").addEventListener("click", () => {
  const topics = getSelectedTopics();
  if (topics.length === 0) { alert("Select at least one topic."); return; }
  startSession({
    mode: "practice",
    topics,
    count: practiceSettings.count,
    shuffle: $("#practice-shuffle").checked,
    time: $("#practice-time").checked ? "30" : 0,
  });
});

// ---------- Timer ----------
let timerInterval = null;

function startTimerTick() {
  stopTimerTick();
  if (!session.timeLimitSec) { updateTimerDisplay(); return; }
  timerInterval = setInterval(() => {
    if (!session.timerRunning || session.finished) return;
    session.timeLeft--;
    if (session.timeLeft <= 0) {
      session.timeLeft = 0;
      updateTimerDisplay();
      finishQuiz();
      return;
    }
    updateTimerDisplay();
  }, 1000);
}
function stopTimerTick() { if (timerInterval) clearInterval(timerInterval); }

function updateTimerDisplay() {
  const el = $("#timer-display");
  const total = session.timeLimitSec ? session.timeLeft : 0;
  const mm = String(Math.floor(total / 60)).padStart(2, "0");
  const ss = String(total % 60).padStart(2, "0");
  el.textContent = session.timeLimitSec ? `${mm}:${ss}` : "--:--";
  el.classList.toggle("low", session.timeLimitSec && total <= 60);
}
function updateTimerButton() {
  $("#btn-timer-toggle").textContent = !session.timeLimitSec
    ? "⏸" : (session.timerRunning ? "⏸" : "▶");
}
$("#btn-timer-toggle").addEventListener("click", () => {
  if (!session || !session.timeLimitSec) return;
  session.timerRunning = !session.timerRunning;
  updateTimerButton();
});

// ---------- Render question ----------
function renderQuestion() {
  if (!session) return;
  const q = session.questions[session.current];
  $("#q-topic").textContent = q.topic;
  $("#q-num").textContent = `Question ${session.current + 1} of ${session.total}`;
  $("#q-text").textContent = q.question;
  $("#q-text").dataset.multiple = q.multiple ? "1" : "0";

  // flag
  $("#btn-flag").classList.toggle("on", session.flagged[session.current]);

  // options
  const wrap = $("#q-options");
  wrap.innerHTML = "";
  const letters = ["A", "B", "C", "D", "E", "F"];
  const selected = session.answers[session.current] || [];
  q.options.forEach((opt, i) => {
    const div = document.createElement("div");
    div.className = "option";
    if (selected.includes(i)) div.classList.add("selected");
    div.dataset.index = i;
    div.innerHTML = `
      <span class="opt-key">${letters[i]}</span>
      <span class="opt-text">${opt}</span>`;
    div.addEventListener("click", () => onSelect(i, div));
    wrap.appendChild(div);
  });

  // in practice — show previous feedback if already answered
  const fb = $("#q-feedback");
  if (session.practiceFeedback && selected.length > 0) {
    showPracticeFeedback();
  } else {
    fb.classList.add("hidden");
    fb.innerHTML = "";
  }

  updateProgress();
  renderPalette();
  updateNavButtons();
  updateTimerDisplay();
}

function onSelect(i, div) {
  if (session.finished) return;
  const q = session.questions[session.current];
  let sel = session.answers[session.current] || [];

  if (q.multiple) {
    // checkbox: toggle the option
    sel = sel.includes(i) ? sel.filter(x => x !== i) : [...sel, i];
    session.answers[session.current] = sel.sort((a, b) => a - b);
    div.classList.toggle("selected", sel.includes(i));
  } else {
    sel = [i];
    session.answers[session.current] = sel;
    $$("#q-options .option").forEach(o => o.classList.toggle("selected", parseInt(o.dataset.index, 10) === i));
  }

  if (session.practiceFeedback && sel.length > 0) {
    showPracticeFeedback();
  }
  updateProgress();
  renderPalette();
}

// ---------- Feedback in practice ----------
function showPracticeFeedback() {
  const q = session.questions[session.current];
  const sel = session.answers[session.current] || [];
  const opts = $$("#q-options .option");
  opts.forEach(o => {
    const idx = parseInt(o.dataset.index, 10);
    o.classList.add("disabled");
    if (q.correct.includes(idx)) o.classList.add("correct");
    else if (sel.includes(idx)) o.classList.add("incorrect");
  });
  const correctText = q.correct.map(i => q.options[i]).join("; ");
  const isRight = q.correct.every(i => sel.includes(i)) && sel.length === q.correct.length;
  const fb = $("#q-feedback");
  fb.classList.remove("hidden");
  fb.innerHTML = `
    <div class="fb-title">${isRight ? "✅ Correct!" : "❌ Incorrect"}</div>
    <div>Correct answer: <b>${correctText}</b></div>
    ${q.explanation ? `<div style="margin-top:8px;color:var(--text-dim)">${q.explanation}</div>` : ""}`;
}

// ---------- Navigation ----------
function goTo(i) {
  if (i < 0 || i >= session.total) return;
  session.current = i;
  renderQuestion();
}
$("#btn-prev").addEventListener("click", () => goTo(session.current - 1));
$("#btn-next").addEventListener("click", () => goTo(session.current + 1));

function updateNavButtons() {
  $("#btn-prev").disabled = session.current === 0;
  $("#btn-next").disabled = session.current === session.total - 1;
}

function updateProgress() {
  const answered = session.answers.filter(a => a && a.length).length;
  const pct = Math.round(answered / session.total * 100);
  $("#progress-fill").style.width = `${pct}%`;
  $("#progress-label").textContent = `${answered} / ${session.total}`;
}

// ---------- Palette ----------
function renderPalette() {
  const grid = $("#palette");
  grid.innerHTML = "";
  for (let i = 0; i < session.total; i++) {
    const b = document.createElement("button");
    b.textContent = i + 1;
    if (session.answers[i] && session.answers[i].length) b.classList.add("answered");
    if (session.flagged[i]) b.classList.add("flagged");
    if (i === session.current) b.classList.add("current");
    b.addEventListener("click", () => goTo(i));
    grid.appendChild(b);
  }
}

// Palette collapse/expand on mobile
const paletteBody = $("#palette-body");
const paletteToggleBtn = $("#btn-palette-toggle");
if (paletteToggleBtn) {
  paletteToggleBtn.addEventListener("click", () => {
    if (!paletteBody) return;
    const isOpen = paletteBody.classList.toggle("open");
    paletteToggleBtn.textContent = isOpen ? "Grid ▴" : "Grid ▾";
  });
}

// ---------- Flag ----------
$("#btn-flag").addEventListener("click", () => {
  session.flagged[session.current] = !session.flagged[session.current];
  $("#btn-flag").classList.toggle("on", session.flagged[session.current]);
  renderPalette();
});

// ---------- Finish ----------
$("#btn-finish").addEventListener("click", () => finishQuiz());

function finishQuiz() {
  if (session.finished) return;
  session.finished = true;
  stopTimerTick();
  showResults();
}

function showResults() {
  let correct = 0, skipped = 0;
  session.questions.forEach((q, i) => {
    const sel = session.answers[i] || [];
    if (sel.length === 0) { skipped++; return; }
    const ok = q.correct.every(c => sel.includes(c)) && sel.length === q.correct.length;
    if (ok) correct++;
  });
  const wrong = session.total - correct - skipped;

  // scale 0–1000
  const perQuestion = 1000 / session.total;
  const score = Math.round(correct * perQuestion);
  const elapsedSec = Math.round((Date.now() - session.startTime) / 1000);

  session.result = { correct, wrong, skipped, score, elapsedSec };

  const pass = session.passScore != null;
  const passed = score >= session.passScore;

  $("#result-title").innerHTML =
    (pass ? `<span class="pass-badge ${passed ? "ok" : "fail"}">${passed ? "PASSED" : "FAILED"}</span>`
           : `<span class="pass-badge ok">Completed</span>`) +
    (pass ? `<br><div style="font-size:16px;color:var(--text-dim);margin-top:8px">Passing score: ${session.passScore} of 1000</div>` : "");

  const ring = $("#score-ring");
  ring.style.setProperty("--pct", Math.max(2, score / 10));
  $("#score-value").textContent = score;
  $("#stat-correct").textContent = correct;
  $("#stat-wrong").textContent = wrong;
  $("#stat-skipped").textContent = skipped;
  $("#stat-time").textContent = formatTime(elapsedSec);

  showScreen("result");
}

function formatTime(s) {
  const m = Math.floor(s / 60), ss = s % 60;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

// ---------- Result buttons ----------
$("#btn-result-menu").addEventListener("click", () => {
  session = null;
  stopTimerTick();
  showScreen("menu");
});
$("#btn-retry").addEventListener("click", () => {
  const mode = session.mode;
  const cfg = mode === "exam"
    ? { mode, count: examSettings.count, time: examSettings.time !== "0" ? examSettings.time : 0, pass: examSettings.pass, shuffle: $("#exam-shuffle").checked }
    : { mode, topics: getSelectedTopics(), count: practiceSettings.count, shuffle: $("#practice-shuffle").checked, time: $("#practice-time").checked ? "30" : 0 };
  startSession(cfg);
});
$("#btn-review").addEventListener("click", () => {
  renderReview();
  showScreen("review");
});

// ---------- Review answers ----------
let reviewFilter = "all";
function renderReview() {
  const list = $("#review-list");
  list.innerHTML = "";
  const filtered = session.questions
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => {
      const sel = session.answers[i] || [];
      const answered = sel.length > 0;
      const ok = answered && q.correct.every(c => sel.includes(c)) && sel.length === q.correct.length;
      if (reviewFilter === "wrong") return answered && !ok;
      if (reviewFilter === "right") return ok;
      if (reviewFilter === "skipped") return !answered;
      return true;
    });

  if (filtered.length === 0) {
    list.innerHTML = `<p style="color:var(--text-dim);text-align:center;padding:20px">No questions match the selected filter.</p>`;
    return;
  }

  filtered.forEach(({ q, i }) => {
    const sel = session.answers[i] || [];
    const ok = sel.length > 0 && q.correct.every(c => sel.includes(c)) && sel.length === q.correct.length;
    const skipped = sel.length === 0;

    let verdict, verdictClass;
    if (skipped) { verdict = "Unanswered"; verdictClass = "verdict-skipped"; }
    else if (ok) { verdict = "✅ Correct"; verdictClass = "verdict-right"; }
    else { verdict = "❌ Incorrect"; verdictClass = "verdict-wrong"; }

    const letters = ["A", "B", "C", "D", "E", "F"];
    const userText = sel.length ? sel.map(s => q.options[s]).join("; ") : "—";
    const rightText = q.correct.map(c => q.options[c]).join("; ");

    const item = document.createElement("div");
    item.className = "review-item";
    item.innerHTML = `
      <div class="r-topic">${q.topic}</div>
      <h4>${q.question}</h4>
      <div class="r-verdict ${verdictClass}">${verdict}</div>
      <div class="r-row"><span class="lbl">Your answer:</span> <span class="${ok || skipped ? "" : "bad"}">${userText}</span></div>
      <div class="r-row"><span class="lbl">Correct:</span> <span class="ok">${rightText}</span></div>
      ${q.explanation ? `<div class="r-expl"><span class="lbl">Explanation:</span> ${q.explanation}</div>` : ""}`;
    list.appendChild(item);
  });
}

$$(".review-filter .chip").forEach(chip => {
  chip.addEventListener("click", () => {
    $$(".review-filter .chip").forEach(c => c.classList.remove("active"));
    chip.classList.add("active");
    reviewFilter = chip.dataset.filter;
    renderReview();
  });
});
$("#btn-review-back").addEventListener("click", () => showScreen("result"));

// ---------- Study (book reader) ----------
const studyState = {
  current: 0,
  read: {},   // chapter index -> true (persisted)
  filter: "all",
};

const STUDY_KEY = "ccna_study_read_v1";

function loadStudyRead() {
  try { studyState.read = JSON.parse(localStorage.getItem(STUDY_KEY)) || {}; }
  catch (e) { studyState.read = {}; }
}
function saveStudyRead() {
  try { localStorage.setItem(STUDY_KEY, JSON.stringify(studyState.read)); }
  catch (e) { /* ignore */ }
}

function flatChapters() {
  return BOOK_CHAPTERS.map((c, i) => ({ ...c, idx: i }));
}

function chapterKey(c) { return `v${c.volume}-ch${c.chapter}`; }

function findStudyIndex(key) {
  return key ? flatChapters().findIndex(c => chapterKey(c) === key) : -1;
}

function getStudyPosition() {
  const saved = localStorage.getItem("ccna_study_position");
  return saved || "";
}

function renderToc() {
  const wrap = $("#study-toc");
  wrap.innerHTML = "";
  const chapters = flatChapters();
  let readCount = 0;
  chapters.forEach(c => { if (studyState.read[chapterKey(c)]) readCount++; });
  $("#study-progress").textContent = `${readCount} / ${chapters.length}`;

  BOOK_VOLUMES.forEach((vol, vi) => {
    const part = document.createElement("div");
    part.className = "toc-part";

    const head = document.createElement("div");
    head.className = "toc-part-head" + (vi === 0 ? " open" : "");
    head.textContent = vol.name;
    head.addEventListener("click", () => {
      head.classList.toggle("open");
      list.classList.toggle("open", head.classList.contains("open"));
    });

    const list = document.createElement("div");
    list.className = "toc-parts-chapters" + (vi === 0 ? " open" : "");
    vol.chapters.forEach(ch => {
      const key = chapterKey(ch);
      const btn = document.createElement("button");
      btn.className = "toc-ch";
      btn.dataset.key = key;
      btn.innerHTML = `
        <span class="toc-num">${ch.chapter}</span>
        <span class="toc-title"></span>
        ${studyState.read[key] ? '<span class="toc-mark">✓</span>' : ""}`;
      btn.querySelector(".toc-title").textContent = ch.title;
      btn.addEventListener("click", () => {
        selectChapter(findStudyIndex(key));
      });
      list.appendChild(btn);
    });

    part.appendChild(head);
    part.appendChild(list);
    wrap.appendChild(part);
  });
}

function selectChapter(idx) {
  if (idx < 0 || idx >= flatChapters().length) return;
  studyState.current = idx;
  const ch = flatChapters()[idx];
  localStorage.setItem("ccna_study_position", chapterKey(ch));

  // close mobile TOC drawer if open
  const side = $("#study-side");
  if (side) side.classList.remove("open");
  const bd = $("#study-backdrop");
  if (bd) bd.classList.remove("open");

  // highlight active TOC entry
  $$("#study-toc .toc-ch").forEach(b => b.classList.toggle("active", b.dataset.key === chapterKey(ch)));

  $("#study-part").textContent = ch.volume === 1 ? "Volume 1" : "Volume 2";
  $("#study-ch-title").textContent = `Chapter ${ch.chapter} — ${ch.title}`;
  $("#lesson-num").textContent = `${ch.volume === 1 ? "Vol.1" : "Vol.2"} · Chapter ${ch.chapter}`;
  $("#study-sub").textContent = "";

  const body = $("#lesson-body");
  body.innerHTML = "";
  let inList = false;
  let list = null;
  let pre = null;

  ch.blocks.forEach(([type, text]) => {
    if (type === "h") {
      inList = false; list = null; pre = null;
      const h = document.createElement("h4");
      h.className = "less-sub";
      h.textContent = text;
      body.appendChild(h);
    } else {
      // detect command-like / diagram blocks vs prose
      if (pre === null) {
        const looksCmd = /^(Router|Switch|PC|host|interface|ip |en|conf t|copy |show |exit|!|#|switchport|vlan|enable|hostname|clock|line |username|service|no |spanning-tree|vlan database|access-list)/i.test(text)
          || /(Router|Switch)[#>]/i.test(text);
        if (looksCmd) {
          pre = document.createElement("pre");
          const code = document.createElement("code");
          code.textContent = text;
          pre.appendChild(code);
          body.appendChild(pre);
          return;
        }
      }
      if (inList && /^[-•*]\s/.test(text)) {
        const li = document.createElement("li");
        li.textContent = text.replace(/^[-•*]\s/, "");
        list.appendChild(li);
        return;
      }
      if (/^[-•*]\s/.test(text)) {
        inList = true;
        list = document.createElement("ul");
        body.appendChild(list);
        const li = document.createElement("li");
        li.textContent = text.replace(/^[-•*]\s/, "");
        list.appendChild(li);
        return;
      }
      inList = false; list = null;
      const p = document.createElement("p");
      p.textContent = text;
      body.appendChild(p);
    }
  });

  const key = chapterKey(ch);
  $("#btn-study-read").classList.toggle("done", !!studyState.read[key]);
  $("#btn-study-read").textContent = studyState.read[key] ? "Read ✓" : "Mark as read";
  $("#btn-study-prev").disabled = idx === 0;
  $("#btn-study-next").disabled = idx === flatChapters().length - 1;
  window.scrollTo(0, 0);
}

$("#btn-study-read").addEventListener("click", () => {
  const ch = flatChapters()[studyState.current];
  const key = chapterKey(ch);
  if (studyState.read[key]) {
    delete studyState.read[key];
  } else {
    studyState.read[key] = true;
  }
  saveStudyRead();
  renderToc();
  $("#btn-study-read").classList.toggle("done", !!studyState.read[key]);
  $("#btn-study-read").textContent = studyState.read[key] ? "Read ✓" : "Mark as read";
});

$("#btn-study-prev").addEventListener("click", () => selectChapter(studyState.current - 1));
$("#btn-study-next").addEventListener("click", () => selectChapter(studyState.current + 1));
$("#btn-study-back").addEventListener("click", () => showScreen("menu"));

// Mobile study drawer toggle & close
const studySideEl = $("#study-side");
const studyBackdropEl = $("#study-backdrop");
$("#btn-study-toc-toggle")?.addEventListener("click", () => {
  studySideEl?.classList.toggle("open");
  studyBackdropEl?.classList.toggle("open");
});
$("#btn-study-side-close")?.addEventListener("click", () => {
  studySideEl?.classList.remove("open");
  studyBackdropEl?.classList.remove("open");
});
studyBackdropEl?.addEventListener("click", () => {
  studySideEl?.classList.remove("open");
  studyBackdropEl?.classList.remove("open");
});

loadStudyRead();

// ---------- Custom question bank (add / delete / import / export) ----------
const CUSTOM_KEY = "ccna_custom_q_v1";
const HIDDEN_KEY = "ccna_hidden_q_v1";

function loadJSON(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch (e) { return fallback; }
}

function loadCustomQuestions() {
  return loadJSON(CUSTOM_KEY, []).map(q => ({ builtin: false, ...q }));
}
function saveCustomQuestions(list) {
  try { localStorage.setItem(CUSTOM_KEY, JSON.stringify(list)); }
  catch (e) { alert("Failed to save custom questions: " + e.message); }
}
function loadHiddenSet() {
  return new Set(loadJSON(HIDDEN_KEY, []));
}
function saveHiddenSet(set) {
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(Array.from(set))); }
  catch (e) { /* ignore */ }
}
function hiddenSet() { return loadHiddenSet(); }

// Full active bank: built-in questions (minus deleted) + custom questions.
function allQuestions() {
  const hidden = hiddenSet();
  const builtin = QUESTION_BANK
    .map((q, i) => ({ id: "b" + i, builtin: true, ...q }))
    .filter(q => !hidden.has(q.id));
  return builtin.concat(loadCustomQuestions());
}
function allTopics() {
  const set = new Set();
  allQuestions().forEach(q => set.add(q.topic));
  return Array.from(set).sort((a, b) => a.localeCompare(b, "en"));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function newCustomId() {
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ---------- Manage screen ----------
const manageState = { topic: "all", search: "", showDeleted: false };

$("#btn-manage").addEventListener("click", () => {
  mfReset();
  renderManage();
  showScreen("manage");
});
$("#btn-manage-back").addEventListener("click", () => showScreen("menu"));

function buildTopicFilter() {
  const sel = $("#manage-topic-filter");
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "all"; opt.textContent = "All topics";
  sel.appendChild(opt);
  allTopics().forEach(t => {
    const o = document.createElement("option");
    o.value = t; o.textContent = t;
    sel.appendChild(o);
  });
  sel.value = manageState.topic;
}

function renderManage() {
  buildTopicFilter();
  const list = $("#manage-list");
  list.innerHTML = "";
  const qs = allQuestions();
  let shown = 0;
  qs.forEach(q => {
    if (manageState.topic !== "all" && q.topic !== manageState.topic) return;
    const hay = (q.question + " " + q.topic).toLowerCase();
    if (manageState.search && !hay.includes(manageState.search.toLowerCase())) return;
    shown++;

    const item = document.createElement("div");
    item.className = "m-item";
    item.innerHTML = `
      <div class="m-item-top">
        <span class="q-topic">${escapeHtml(q.topic)}</span>
        <span class="m-tag ${q.builtin ? "builtin" : "custom"}">${q.builtin ? "built-in" : "custom"}</span>
        <span class="m-ans">${q.correct.length} correct</span>
      </div>
      <div class="m-question">${escapeHtml(q.question)}</div>
      <div class="m-item-actions">
        <button class="btn btn-secondary btn-sm" data-del="${q.id}">Delete</button>
      </div>`;
    item.querySelector("[data-del]").addEventListener("click", () => deleteQuestion(q.id));
    list.appendChild(item);
  });

  const head = document.createElement("div");
  head.className = "m-count";
  head.textContent = shown + " question(s) shown";
  list.insertBefore(head, list.firstChild);

  renderDeleted();
}

function deleteQuestion(id) {
  if (id.charAt(0) === "b") {
    const hidden = hiddenSet();
    hidden.add(id);
    saveHiddenSet(hidden);
  } else {
    saveCustomQuestions(loadCustomQuestions().filter(q => q.id !== id));
  }
  renderManage();
}

function renderDeleted() {
  const box = $("#manage-hidden");
  box.innerHTML = "";
  if (!manageState.showDeleted) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");

  const hidden = hiddenSet();
  const items = QUESTION_BANK
    .map((q, i) => ({ id: "b" + i, ...q }))
    .filter(q => hidden.has(q.id));

  const head = document.createElement("div");
  head.className = "m-head";
  head.textContent = "Deleted built-in questions (" + items.length + ")";
  box.appendChild(head);

  items.forEach(q => {
    const d = document.createElement("div");
    d.className = "m-item";
    d.innerHTML = `<div class="m-question">${escapeHtml(q.question)}</div>`;
    const btn = document.createElement("button");
    btn.className = "btn btn-secondary btn-sm";
    btn.textContent = "Restore";
    btn.addEventListener("click", () => {
      hidden.delete(q.id);
      saveHiddenSet(hidden);
      renderManage();
    });
    d.appendChild(btn);
    box.appendChild(d);
  });
}

$("#manage-topic-filter").addEventListener("change", (e) => {
  manageState.topic = e.target.value;
  renderManage();
});
$("#manage-search").addEventListener("input", (e) => {
  manageState.search = e.target.value;
  renderManage();
});
$("#manage-show-deleted").addEventListener("change", (e) => {
  manageState.showDeleted = e.target.checked;
  renderManage();
});

// ---------- Add question form ----------
function buildTopicDatalist() {
  const dl = $("#mf-topic-list");
  dl.innerHTML = "";
  allTopics().forEach(t => {
    const o = document.createElement("option");
    o.value = t;
    dl.appendChild(o);
  });
}

function addOptionRow(text, correct) {
  const wrap = $("#mf-options");
  const row = document.createElement("div");
  row.className = "mf-opt-row";
  row.innerHTML = `
    <span class="opt-key"></span>
    <input type="text" class="mf-opt-text" placeholder="Option text…">
    <label class="checkbox"><input type="checkbox" class="mf-opt-correct"> correct</label>
    <button class="btn-icon" type="button" title="Remove option">✕</button>`;
  row.querySelector(".mf-opt-text").value = text;
  row.querySelector(".mf-opt-correct").checked = !!correct;
  row.querySelector(".btn-icon").addEventListener("click", () => {
    if (wrap.children.length <= 2) return;
    row.remove();
    relabelOptions();
  });
  wrap.appendChild(row);
  relabelOptions();
}

function relabelOptions() {
  $$("#mf-options .mf-opt-row").forEach((r, i) => {
    r.querySelector(".opt-key").textContent = String.fromCharCode(65 + i);
  });
}

function mfReset() {
  $("#mf-topic").value = "";
  $("#mf-question").value = "";
  $("#mf-expl").value = "";
  $("#mf-error").textContent = "";
  const wrap = $("#mf-options");
  wrap.innerHTML = "";
  addOptionRow("", false);
  addOptionRow("", false);
  buildTopicDatalist();
}

$("#btn-manage-add").addEventListener("click", () => {
  const f = $("#manage-form");
  const open = !f.classList.contains("hidden");
  f.classList.toggle("hidden", open);
  $("#btn-manage-add").textContent = open ? "+ Add question" : "Close form";
  if (!open) mfReset();
});
$("#mf-add-option").addEventListener("click", () => addOptionRow("", false));
$("#mf-cancel").addEventListener("click", () => {
  $("#manage-form").classList.add("hidden");
  $("#btn-manage-add").textContent = "+ Add question";
});

function mfSave() {
  const topic = $("#mf-topic").value.trim();
  const question = $("#mf-question").value.trim();
  const expl = $("#mf-expl").value.trim();
  const opts = Array.from($$("#mf-options .mf-opt-row")).map(r => ({
    text: r.querySelector(".mf-opt-text").value.trim(),
    correct: r.querySelector(".mf-opt-correct").checked,
  }));
  const err = $("#mf-error");

  if (!topic) { err.textContent = "Topic is required."; return; }
  if (!question) { err.textContent = "Question text is required."; return; }
  if (opts.length < 2) { err.textContent = "At least two options are required."; return; }
  if (opts.some(o => !o.text)) { err.textContent = "Every option needs text (or remove the empty row)."; return; }
  const correct = [];
  opts.forEach((o, i) => { if (o.correct) correct.push(i); });
  if (correct.length === 0) { err.textContent = "Mark at least one option as correct."; return; }
  err.textContent = "";

  const custom = loadCustomQuestions();
  custom.push({
    id: newCustomId(),
    topic,
    question,
    options: opts.map(o => o.text),
    correct,
    multiple: correct.length > 1,
    explanation: expl || undefined,
  });
  saveCustomQuestions(custom);

  mfReset();
  $("#manage-form").classList.add("hidden");
  $("#btn-manage-add").textContent = "+ Add question";
  renderManage();
}

$("#mf-save").addEventListener("click", mfSave);

// ---------- Import / Export ----------
$("#btn-manage-export").addEventListener("click", () => {
  const data = {
    version: 1,
    custom: loadCustomQuestions(),
    hidden: Array.from(hiddenSet()),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "ccna-questions-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

$("#btn-manage-import").addEventListener("click", () => $("#manage-file").click());
$("#manage-file").addEventListener("change", (e) => {
  if (e.target.files[0]) importBank(e.target.files[0]);
  e.target.value = "";
});

function pushImported(list, q) {
  if (!q || typeof q !== "object" || !Array.isArray(q.options) || !Array.isArray(q.correct)) return 0;
  const options = q.options.map(String);
  const correct = q.correct
    .filter(i => Number.isInteger(i) && i >= 0 && i < options.length)
    .sort((a, b) => a - b);
  if (!options.length || !correct.length || !String(q.question || "").trim()) return 0;
  list.push({
    id: newCustomId(),
    topic: String(q.topic || "Misc"),
    question: String(q.question),
    options,
    correct,
    multiple: correct.length > 1,
    explanation: q.explanation ? String(q.explanation) : undefined,
  });
  return 1;
}

function importBank(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const custom = loadCustomQuestions();
      let added = 0;

      if (Array.isArray(data)) {
        data.forEach(q => { added += pushImported(custom, q); });
      } else if (data && typeof data === "object" && Array.isArray(data.custom)) {
        const hidden = hiddenSet();
        (data.hidden || []).forEach(id => hidden.add(String(id)));
        saveHiddenSet(hidden);
        data.custom.forEach(q => { added += pushImported(custom, q); });
      } else {
        alert("Unknown file format. Export a bank from the app first.");
        return;
      }

      saveCustomQuestions(custom);
      alert(added + " question(s) imported.");
      renderManage();
    } catch (err) {
      alert("Import failed: " + err.message);
    }
  };
  reader.readAsText(file);
}

// ---------- Cleanup ----------
window.addEventListener("beforeunload", stopTimerTick);