// Quando o front-end roda no GitHub Pages, ele precisa apontar para o
// backend hospedado separadamente (Render). Em desenvolvimento local
// (mesma origem do server.js) usamos caminho relativo.
const API_BASE = window.location.hostname.endsWith("github.io")
  ? "https://studyforge-ai-ccer.onrender.com"
  : "";

const WEEKDAY_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const state = {
  step: 1,
  currentView: "overview",
  user: {
    name: "Estudante",
    plan: "free",
    objective: "ENEM",
    days: 90,
    hours: 2,
    studyTimeStart: "08:00",
    studyTimeEnd: "10:00",
    level: "Intermediário",
    subjects: []
  },
  sessions: [],
  // Domínio de cada tópico da ementa: chave "Matéria|||Tópico" -> status
  // ("unknown" | "learning" | "mastered").
  syllabus: {}
};

// Ementa de referência por matéria (conteúdos típicos de prova).
const SYLLABUS = {
  "Matemática": ["Funções (afim, quadrática, exponencial)", "Logaritmos", "Progressões (PA e PG)", "Geometria plana", "Geometria espacial", "Trigonometria", "Análise combinatória", "Probabilidade", "Estatística e gráficos", "Matemática financeira"],
  "Português": ["Interpretação de texto", "Gêneros textuais", "Figuras de linguagem", "Funções da linguagem", "Variação linguística", "Sintaxe (período e oração)", "Concordância verbal e nominal", "Regência", "Crase", "Redação dissertativa-argumentativa"],
  "Biologia": ["Citologia", "Bioquímica celular", "Genética", "Evolução", "Ecologia", "Fisiologia humana", "Botânica", "Zoologia", "Microbiologia e doenças", "Biotecnologia"],
  "História": ["Antiguidade clássica", "Idade Média", "Grandes navegações", "Brasil colônia", "Iluminismo e revoluções", "Independência do Brasil", "República brasileira", "Era Vargas", "Guerras mundiais", "Guerra Fria e mundo atual"],
  "Física": ["Cinemática", "Leis de Newton", "Trabalho e energia", "Hidrostática", "Termologia e calorimetria", "Óptica geométrica", "Ondulatória", "Eletrostática", "Eletrodinâmica (circuitos)", "Eletromagnetismo"],
  "Química": ["Estrutura atômica", "Tabela periódica", "Ligações químicas", "Funções inorgânicas", "Reações químicas", "Estequiometria", "Soluções e concentração", "Termoquímica", "Química orgânica", "Eletroquímica"]
};

const SYLLABUS_STATUS_WEIGHT = { mastered: 1, learning: 0.5, unknown: 0 };
const SYLLABUS_STATUS_LABEL = { mastered: "Já domino", learning: "Estudando", unknown: "Não sei" };

function syllabusKey(subject, topic) {
  return `${subject}|||${topic}`;
}

function subjectMastery(subject) {
  const topics = SYLLABUS[subject] || [];
  if (!topics.length) return { coverage: 0, remaining: 100, counts: { mastered: 0, learning: 0, unknown: 0 } };
  const counts = { mastered: 0, learning: 0, unknown: 0 };
  let score = 0;
  topics.forEach((topic) => {
    const status = state.syllabus[syllabusKey(subject, topic)] || "unknown";
    counts[status] = (counts[status] || 0) + 1;
    score += SYLLABUS_STATUS_WEIGHT[status] || 0;
  });
  const coverage = Math.round((score / topics.length) * 100);
  return { coverage, remaining: 100 - coverage, counts };
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function showScreen(screenId) {
  $$(".screen").forEach((screen) => screen.classList.remove("active-screen"));
  const screen = $(`#${screenId}`);
  if (screen) screen.classList.add("active-screen");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function updateOnboardingProgress() {
  const onboardingScreen = $("#onboarding-screen");
  $$(".progress-step", onboardingScreen).forEach((step, index) => {
    step.classList.toggle("active", index + 1 <= state.step);
  });
  $$(".form-step", onboardingScreen).forEach((step) => {
    step.classList.toggle("active", Number(step.dataset.step) === state.step);
  });
}

async function registerUser() {
  const name = $("#user-name").value.trim();
  const email = $("#user-email").value.trim();
  const password = $("#user-password").value;

  if (!name) {
    showToast("Digite seu nome para continuar.");
    $("#user-name").focus();
    return false;
  }
  if (!email) {
    showToast("Digite seu e-mail para continuar.");
    $("#user-email").focus();
    return false;
  }
  if (password.length < 6) {
    showToast("Sua senha precisa ter pelo menos 6 caracteres.");
    $("#user-password").focus();
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível concluir seu cadastro.");
      return false;
    }
    state.user.id = data.id;
    state.user.plan = data.plan || "free";
    return true;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
    return false;
  }
}

async function loginUser(email, password) {
  try {
    const response = await fetch(`${API_BASE}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível entrar.");
      return false;
    }
    state.user.id = data.id;
    state.user.name = data.name;
    state.user.plan = data.plan || "free";
    return true;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
    return false;
  }
}

function collectFormData() {
  state.user.name = $("#user-name").value.trim() || "Estudante";
  state.user.objective = $(".choice.selected")?.dataset.value || "ENEM";
  state.user.days = Number($("#exam-days").value) || 90;
  state.user.hours = Number($("#daily-hours").value) || 2;
  state.user.level = $("#level").value;
  state.user.subjects = $$(".subject.selected").map((subject) => subject.dataset.subject);
}

function initials(name) {
  return name.split(" ").filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join("") || "ST";
}

function formatDate() {
  const date = new Date();
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(date).toUpperCase();
}

function formatShortDate() {
  const date = new Date();
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "short" }).format(date).toUpperCase().replace(".", "");
}

function setUserLabels() {
  const firstName = state.user.name.split(" ")[0] || "Estudante";
  const avatar = initials(state.user.name);
  $("#dashboard-name").textContent = firstName;
  $("#sidebar-name").textContent = state.user.name;
  $("#sidebar-avatar").textContent = avatar;
  $("#topbar-avatar").textContent = avatar;
  $("#plan-objective").textContent = state.user.objective;
  $("#plan-days").textContent = state.user.days;
  $("#plan-hours").textContent = `${state.user.studyTimeStart} às ${state.user.studyTimeEnd}`;
  $("#plan-level").textContent = state.user.level.toLowerCase();
  $("#current-date").textContent = formatDate();
  $("#today-panel-date").textContent = formatShortDate();

  const isPlus = state.user.plan === "plus";
  const planLabelEl = $("#sidebar-plan-label");
  if (planLabelEl) planLabelEl.textContent = isPlus ? "Plano Plus" : "Plano gratuito";
  const badgeEl = $("#tutor-badge");
  if (badgeEl) badgeEl.textContent = isPlus ? "novo" : "plus";
  $("#upgrade-card")?.classList.toggle("hidden", isPlus);
}

function renderSchedule() {
  const list = $("#schedule-list");
  if (!list) return;
  list.innerHTML = state.sessions.length
    ? state.sessions.map((session, index) => `
      <div class="schedule-item ${session.completed ? "completed" : ""} ${!session.completed && index === 2 ? "active-item" : ""}" data-session-id="${session.id}">
        <button class="schedule-check" aria-label="Marcar ${session.subject} como concluído">${session.completed ? "✓" : ""}</button>
        <span class="schedule-time">${session.time}</span>
        <span class="schedule-copy"><strong>${session.subject}</strong><small>${session.detail}</small></span>
        <span class="schedule-tag ${session.tagClass}">${session.tag}</span>
      </div>
    `).join("")
    : `<p class="empty-state-text">Nenhuma sessão de estudo hoje ainda. Adicione uma para começar.</p>`;
  const complete = state.sessions.filter((session) => session.completed).length;
  const total = state.sessions.length;
  const percent = total > 0 ? Math.round((complete / total) * 100) : 0;
  $("#schedule-completed").textContent = complete;
  $("#schedule-total").textContent = total;
  $("#today-progress").innerHTML = `${complete}<small>/${total}</small>`;
  $("#today-bar").style.width = `${percent}%`;
  $("#today-percent").textContent = total > 0 ? `${percent}% do dia completo` : "Nenhuma sessão hoje";
  $("#schedule-progress-label").textContent = total === 0
    ? "adicione sua primeira sessão"
    : complete === total
      ? "dia concluído"
      : `${Math.max(0, total - complete)} sessão${total - complete === 1 ? "" : "ões"} restante${total - complete === 1 ? "" : "s"}`;
}

const SUBJECT_COLOR_CLASS = {
  "Matemática": "math-color",
  "Português": "portuguese-color",
  "Biologia": "bio-color",
  "História": "history-color",
  "Física": "physics-color",
  "Química": "chemistry-color"
};

function subjectColorClass(subject) {
  return SUBJECT_COLOR_CLASS[subject] || "math-color";
}

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}min`;
}

function subjectTagClass(subject) {
  const classes = { "Matemática": "", "Português": "mint-session", "Biologia": "lilac-session", "História": "mint-session", "Física": "lilac-session", "Química": "mint-session" };
  return classes[subject] || "";
}

function addMinutes(time, minutesToAdd) {
  const [hours, minutes] = time.split(":").map(Number);
  const totalMinutes = (hours * 60 + minutes + minutesToAdd) % (24 * 60);
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const mm = String(totalMinutes % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function minutesBetween(start, end) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = (eh * 60 + em) - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

function renderWeekPlan() {
  const list = $("#week-list");
  if (!list) return;
  const subjects = state.user.subjects.length ? state.user.subjects : ["Matemática", "Português"];
  const startTime = state.user.studyTimeStart || "08:00";
  const endTime = state.user.studyTimeEnd || "10:00";
  const windowMinutes = minutesBetween(startTime, endTime);
  const secondTime = windowMinutes >= 120 ? addMinutes(startTime, Math.floor(windowMinutes / 2)) : null;
  const today = new Date();
  const dateFormatter = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
  list.innerHTML = Array.from({ length: 5 }, (_, dayIndex) => {
    const date = new Date(today);
    date.setDate(today.getDate() + dayIndex);
    const label = dayIndex === 0
      ? "Hoje"
      : dayIndex === 1
        ? "Amanhã"
        : weekdayFormatter.format(date).replace(/^\p{L}/u, (letter) => letter.toUpperCase());
    const dateLabel = dateFormatter.format(date).replace(".", "");
    const first = subjects[dayIndex % subjects.length];
    const second = subjects[(dayIndex + 1) % subjects.length];
    const sessions = [
      { time: startTime, subject: first, detail: dayIndex % 2 ? "conteúdo novo" : "revisão espaçada", className: subjectTagClass(first) },
      ...(secondTime ? [{ time: secondTime, subject: second, detail: "questões e prática", className: subjectTagClass(second) }] : [])
    ];
    return `<article class="week-day ${dayIndex === 0 ? "today" : ""}"><div class="week-day-label"><strong>${label}</strong><span>${dateLabel}</span></div><div class="week-day-sessions">${sessions.map((session) => `<div class="week-session ${session.className}"><span class="time">${session.time}</span><strong>${session.subject}</strong><small>${session.detail}</small></div>`).join("")}</div></article>`;
  }).join("");
}

function tagClassFor(tag) {
  const classes = { "Foco": "tag-coral", "Leitura": "tag-mint", "Prática": "tag-lilac", "Extra": "tag-mint" };
  return classes[tag] || "tag-lilac";
}

function toDateKey(date) {
  return date.toISOString().slice(0, 10);
}

function lastNDates(n) {
  const dates = [];
  for (let i = n - 1; i >= 0; i--) {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - i);
    dates.push(date);
  }
  return dates;
}

function buildDailyMap(daily) {
  const map = new Map();
  daily.forEach((row) => {
    map.set(row.date, { minutes: Number(row.minutes) || 0, hasCompleted: Boolean(row.has_completed) });
  });
  return map;
}

function computeStreak(dailyMap) {
  let current = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  while (dailyMap.get(toDateKey(cursor))?.hasCompleted) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  let best = current;
  let running = 0;
  let prevDate = null;
  [...dailyMap.keys()].sort().forEach((key) => {
    if (!dailyMap.get(key).hasCompleted) {
      running = 0;
      prevDate = null;
      return;
    }
    const date = new Date(key);
    const diffDays = prevDate ? Math.round((date - prevDate) / 86400000) : 1;
    running = diffDays === 1 ? running + 1 : 1;
    best = Math.max(best, running);
    prevDate = date;
  });

  return { current, best };
}

function renderStreakCard(dailyMap, streak) {
  const countEl = $("#streak-count");
  if (countEl) countEl.textContent = streak.current;
  const labelEl = $("#streak-label");
  if (labelEl) labelEl.textContent = streak.current > 0 ? "Você está no ritmo!" : "Comece sua sequência hoje.";
  const bestEl = $("#streak-best");
  if (bestEl) bestEl.textContent = `Melhor: ${streak.best} ${streak.best === 1 ? "dia" : "dias"}`;

  const daysEl = $("#mini-days");
  if (daysEl) {
    daysEl.innerHTML = lastNDates(7).map((date, index) => {
      const isToday = index === 6;
      const done = dailyMap.get(toDateKey(date))?.hasCompleted;
      return `<span class="${isToday ? "today" : done ? "done" : ""}"></span>`;
    }).join("");
  }
}

function renderWeekMetric(dailyMap) {
  const last7 = lastNDates(7);
  const minutesPerDay = last7.map((date) => dailyMap.get(toDateKey(date))?.minutes || 0);
  const totalMinutes = minutesPerDay.reduce((sum, minutes) => sum + minutes, 0);

  const hoursEl = $("#week-hours");
  if (hoursEl) hoursEl.innerHTML = `${Math.floor(totalMinutes / 60)}h <small>${totalMinutes % 60}m</small>`;

  const prevTotal = lastNDates(14).slice(0, 7).reduce((sum, date) => sum + (dailyMap.get(toDateKey(date))?.minutes || 0), 0);
  const changeEl = $("#week-change");
  if (changeEl) {
    if (totalMinutes === 0 && prevTotal === 0) {
      changeEl.textContent = "Comece a registrar suas sessões";
    } else if (prevTotal === 0) {
      changeEl.textContent = "Primeira semana registrada";
    } else {
      const change = Math.round(((totalMinutes - prevTotal) / prevTotal) * 100);
      changeEl.textContent = `${change >= 0 ? "+" : ""}${change}% vs. semana passada`;
    }
  }

  const barsEl = $("#week-bars");
  if (barsEl) {
    const max = Math.max(...minutesPerDay, 1);
    barsEl.innerHTML = minutesPerDay.map((minutes) => `<span style="height:${Math.max(8, Math.round((minutes / max) * 100))}%"></span>`).join("");
  }
}

function renderWeeklyChart(dailyMap) {
  const chartEl = $("#weekly-line-chart");
  const labelsEl = $("#weekly-chart-labels");
  if (!chartEl || !labelsEl) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + i);
    return date;
  });

  const minutesPerDay = weekDates.map((date) => dailyMap.get(toDateKey(date))?.minutes || 0);
  const metaMinutes = minutesBetween(state.user.studyTimeStart || "08:00", state.user.studyTimeEnd || "10:00");
  const maxMinutes = Math.max(...minutesPerDay, metaMinutes, 60);

  const xAt = (i) => ((i + 0.5) / 7) * 100;
  const yAt = (minutes) => 98 - (minutes / maxMinutes) * 90;

  // A linha "Estudado" só vai até hoje — dias futuros não viram zero (isso
  // distorceria o gráfico), ficam sem ponto.
  const studyPoints = [];
  weekDates.forEach((date, i) => {
    if (date > today) return;
    studyPoints.push({ i, x: xAt(i), y: yAt(minutesPerDay[i]), minutes: minutesPerDay[i], isToday: toDateKey(date) === toDateKey(today) });
  });

  const studyPath = studyPoints.map((p, idx) => `${idx === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const metaY = yAt(metaMinutes).toFixed(2);
  const metaPath = `M ${xAt(0).toFixed(2)} ${metaY} L ${xAt(6).toFixed(2)} ${metaY}`;

  const svg = `<svg class="line-chart-svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<path class="line-meta" vector-effect="non-scaling-stroke" d="${metaPath}" />` +
    (studyPoints.length > 1 ? `<path class="line-study" vector-effect="non-scaling-stroke" d="${studyPath}" />` : "") +
    `</svg>`;

  const markers = studyPoints.map((p) =>
    `<div class="line-marker ${p.isToday ? "today" : ""}" style="left:${p.x.toFixed(2)}%;top:${p.y.toFixed(2)}%" data-min="${p.minutes}" data-label="${WEEKDAY_LABELS[p.i]}"></div>`
  ).join("");

  chartEl.innerHTML = svg + markers + `<div class="chart-tooltip hidden" id="weekly-chart-tooltip"></div>`;

  labelsEl.innerHTML = weekDates.map((date, i) =>
    `<span class="${toDateKey(date) === toDateKey(today) ? "today-label" : ""}">${WEEKDAY_LABELS[i]}</span>`
  ).join("");

  const yAxisEl = $("#chart-y-axis");
  if (yAxisEl) {
    const maxHours = Math.max(1, Math.ceil(maxMinutes / 60));
    yAxisEl.innerHTML = `<span>${maxHours}h</span><span>${Math.round((maxHours / 2) * 10) / 10}h</span><span>0h</span>`;
  }
}

function renderProgressView(dailyMap, subjects, streak) {
  const totalMinutes30 = lastNDates(30).reduce((sum, date) => sum + (dailyMap.get(toDateKey(date))?.minutes || 0), 0);
  const hoursEl = $("#big-progress-hours");
  if (hoursEl) hoursEl.innerHTML = `${Math.floor(totalMinutes30 / 60)}<span>h</span> ${totalMinutes30 % 60}<span>min</span>`;

  const largeChartEl = $("#large-chart");
  if (largeChartEl) {
    const minutes12 = lastNDates(12).map((date) => dailyMap.get(toDateKey(date))?.minutes || 0);
    const max = Math.max(...minutes12, 1);
    largeChartEl.innerHTML = minutes12.map((minutes) => `<span style="height:${Math.max(4, Math.round((minutes / max) * 100))}%"></span>`).join("");
  }

  const subjectListEl = $("#subject-progress-list");
  if (subjectListEl) {
    if (!subjects.length) {
      subjectListEl.innerHTML = `<p class="empty-state-text">Ainda sem sessões suficientes para calcular seu domínio por matéria. Conclua algumas sessões para ver esse gráfico.</p>`;
    } else {
      subjectListEl.innerHTML = subjects.map((subject) => {
        const total = Number(subject.total);
        const completed = Number(subject.completed);
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const colorClass = subjectColorClass(subject.subject);
        return `<div class="subject-progress-row"><span class="subject-dot ${colorClass}"></span><b>${subject.subject}</b><span class="progress-mini-track"><i class="${colorClass}" style="width:${percent}%"></i></span><strong>${percent}%</strong></div>`;
      }).join("");
    }
  }

  renderSubjectHours(subjects);

  const titleEl = $("#achievement-title");
  const textEl = $("#achievement-text");
  if (titleEl && textEl) {
    if (streak.current >= 7) {
      titleEl.textContent = "Semana consistente";
      textEl.textContent = `Você estudou em ${streak.current} dias seguidos. É assim que uma rotina começa.`;
    } else if (streak.current > 0) {
      titleEl.textContent = "Sequência em construção";
      textEl.textContent = `${streak.current} ${streak.current === 1 ? "dia seguido" : "dias seguidos"} até agora. Continue firme!`;
    } else {
      titleEl.textContent = "Comece sua sequência";
      textEl.textContent = "Conclua uma sessão de estudo hoje para começar sua sequência.";
    }
  }
}

function renderSubjectHours(subjects) {
  const listEl = $("#subject-hours-list");
  if (!listEl) return;

  const minutesBySubject = new Map(subjects.map((row) => [row.subject, Number(row.minutes) || 0]));
  const chosenSubjects = state.user.subjects.length ? state.user.subjects : subjects.map((row) => row.subject);
  const rows = chosenSubjects.map((subject) => ({ subject, minutes: minutesBySubject.get(subject) || 0 }));

  if (!rows.length || rows.every((row) => row.minutes === 0)) {
    listEl.innerHTML = `<p class="empty-state-text">Conclua sessões de estudo nas suas matérias para ver o tempo investido em cada uma.</p>`;
    return;
  }

  const max = Math.max(...rows.map((row) => row.minutes), 1);
  listEl.innerHTML = rows.map((row) => {
    const percent = Math.round((row.minutes / max) * 100);
    const colorClass = subjectColorClass(row.subject);
    return `<div class="subject-hours-row"><span class="subject-dot ${colorClass}"></span><b>${row.subject}</b><span class="progress-mini-track"><i class="${colorClass}" style="width:${percent}%"></i></span><strong>${formatMinutes(row.minutes)}</strong></div>`;
  }).join("");
}

function applyDashboardData(data) {
  state.sessions = data.today.map((row) => ({
    id: row.id,
    time: row.session_time,
    subject: row.subject,
    detail: row.detail,
    duration: `${row.duration_minutes} min`,
    tag: row.tag,
    tagClass: tagClassFor(row.tag),
    completed: row.completed
  }));

  const dailyMap = buildDailyMap(data.daily);
  const streak = computeStreak(dailyMap);

  renderSchedule();
  renderStreakCard(dailyMap, streak);
  renderWeekMetric(dailyMap);
  renderWeeklyChart(dailyMap);
  renderProgressView(dailyMap, data.subjects, streak);
}

async function fetchDashboard() {
  try {
    const response = await fetch(`${API_BASE}/api/dashboard`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    applyDashboardData(data);
  } catch (error) {
    // Mantém os últimos dados renderizados se o servidor ficar indisponível.
  }
}

async function fetchSyllabus() {
  try {
    const response = await fetch(`${API_BASE}/api/syllabus`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    state.syllabus = {};
    (data.progress || []).forEach((row) => {
      state.syllabus[syllabusKey(row.subject, row.topic)] = row.status;
    });
    renderSyllabusView();
  } catch (error) {
    // Mantém o que já estava renderizado se o servidor cair.
  }
}

function renderSyllabusView() {
  const tag = $("#syllabus-objective-tag");
  if (tag) tag.innerHTML = `<span>${state.user.objective}</span>`;

  const subjects = state.user.subjects.length ? state.user.subjects : Object.keys(SYLLABUS);
  const knownSubjects = subjects.filter((subject) => SYLLABUS[subject]);

  const listEl = $("#syllabus-subject-list");
  if (listEl) {
    listEl.innerHTML = knownSubjects.map((subject) => {
      const { coverage, counts } = subjectMastery(subject);
      const total = (SYLLABUS[subject] || []).length;
      const colorClass = subjectColorClass(subject);
      return `<article class="panel syllabus-subject" data-syllabus-subject="${subject}">
        <div class="syllabus-subject-head"><span class="subject-dot ${colorClass}"></span><div><strong>${subject}</strong><small>${counts.mastered} de ${total} tópicos dominados</small></div><span class="syllabus-learned-pill">${coverage}% aprendido</span></div>
        <div class="syllabus-subject-bar"><i class="${colorClass}" style="width:${coverage}%"></i></div>
        <div class="syllabus-subject-foot"><span>${coverage}% da ementa</span><button class="text-button" data-action="open-syllabus" data-subject="${subject}">Preencher ementa <span>→</span></button></div>
      </article>`;
    }).join("");
  }

  const totals = { mastered: 0, learning: 0, unknown: 0 };
  knownSubjects.forEach((subject) => {
    const { counts } = subjectMastery(subject);
    totals.mastered += counts.mastered;
    totals.learning += counts.learning;
    totals.unknown += counts.unknown;
  });
  const totalTopics = totals.mastered + totals.learning + totals.unknown;

  ["mastered", "learning", "unknown"].forEach((status) => {
    const count = totals[status];
    const percent = totalTopics ? Math.round((count / totalTopics) * 100) : 0;
    const pctEl = $(`#syllabus-${status}-pct`);
    if (pctEl) pctEl.innerHTML = `${percent}<span>%</span>`;
    const countEl = $(`#syllabus-${status}-count`);
    if (countEl) countEl.textContent = `${count} de ${totalTopics} tópicos`;
    const barEl = $(`#syllabus-${status}-bar`);
    if (barEl) barEl.style.width = `${percent}%`;
  });

  const totalLearned = totalTopics ? Math.round((totals.mastered / totalTopics) * 100) : 0;

  const answered = knownSubjects.some((subject) => (SYLLABUS[subject] || []).some((topic) => state.syllabus[syllabusKey(subject, topic)]));
  const hintTitle = $("#syllabus-hint-title");
  const hintText = $("#syllabus-hint-text");
  if (hintTitle && hintText) {
    if (!answered) {
      hintTitle.textContent = "Comece pelo que ainda não viu.";
      hintText.textContent = "Preencha a ementa de cada matéria para o StudyForge priorizar os tópicos que faltam no seu plano.";
    } else {
      const focus = [...knownSubjects].sort((a, b) => subjectMastery(b).remaining - subjectMastery(a).remaining)[0];
      hintTitle.textContent = totalLearned >= 85 ? "Você está quase lá!" : `Foque em ${focus} agora.`;
      hintText.textContent = totalLearned >= 85
        ? "Você já aprendeu quase toda a ementa. Capriche na revisão dos últimos tópicos."
        : `${focus} é a matéria menos avançada (só ${subjectMastery(focus).coverage}% aprendido).`;
    }
  }
}

let editingSyllabusSubject = null;
function openSyllabusModal(subject) {
  const topics = SYLLABUS[subject];
  if (!topics) return;
  editingSyllabusSubject = subject;
  $("#syllabus-modal-title").textContent = `Ementa de ${subject}`;
  $("#syllabus-modal-sub").textContent = "Para cada tópico, diga o quanto você já sabe. Isso mostra o que ainda falta.";
  $("#syllabus-topic-list").innerHTML = topics.map((topic) => {
    const current = state.syllabus[syllabusKey(subject, topic)] || "unknown";
    const options = ["unknown", "learning", "mastered"].map((status) =>
      `<button class="topic-option ${status} ${current === status ? "selected" : ""}" data-topic-status="${status}">${SYLLABUS_STATUS_LABEL[status]}</button>`
    ).join("");
    return `<div class="syllabus-topic-row" data-topic="${topic.replace(/"/g, "&quot;")}" data-status="${current}"><span class="syllabus-topic-name">${topic}</span><div class="topic-options">${options}</div></div>`;
  }).join("");
  $("#syllabus-modal").classList.remove("hidden");
}

function closeSyllabusModal() {
  $("#syllabus-modal").classList.add("hidden");
  editingSyllabusSubject = null;
}

async function saveSyllabus() {
  if (!editingSyllabusSubject) return;
  const subject = editingSyllabusSubject;
  const items = $$("#syllabus-topic-list .syllabus-topic-row").map((row) => ({
    subject,
    topic: row.dataset.topic,
    status: row.dataset.status || "unknown"
  }));

  try {
    const response = await fetch(`${API_BASE}/api/syllabus`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ items })
    });
    if (!response.ok) throw new Error("save failed");
    items.forEach((item) => {
      state.syllabus[syllabusKey(item.subject, item.topic)] = item.status;
    });
    closeSyllabusModal();
    renderSyllabusView();
    const { coverage } = subjectMastery(subject);
    showToast(`Ementa de ${subject} salva. Você já aprendeu ${coverage}%.`);
  } catch (error) {
    showToast("Não foi possível salvar sua ementa agora.");
  }
}

function enterDashboard() {
  setUserLabels();
  renderWeekPlan();
  renderSyllabusView();
  showScreen("dashboard-screen");
  switchView("overview");
  fetchDashboard();
  fetchSyllabus();
}

function goToOnboarding() {
  showScreen("onboarding-screen");
  state.step = 1;
  $(".form-card").classList.remove("is-generating");
  $("#generating-state").classList.remove("active");
  updateOnboardingProgress();
}

function goToLogin() {
  showScreen("login-screen");
  $("#login-form").reset();
}

function switchView(view) {
  if (view === "tutor" && state.user.plan !== "plus") {
    showToast("O Tutor IA é exclusivo do StudyForge Plus. Assine para desbloquear.");
    $(".sidebar")?.classList.remove("sidebar-open");
    return;
  }
  state.currentView = view;
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active-view", panel.dataset.viewPanel === view));
  $$(".side-nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const labels = { overview: "Visão geral", plan: "Meu plano", syllabus: "Minha ementa", tutor: "Tutor IA", progress: "Meu progresso" };
  $("#breadcrumb-current").textContent = labels[view] || "Visão geral";
  $(".sidebar")?.classList.remove("sidebar-open");
}

function openPlanModal() {
  $$("#plan-modal-subjects .subject").forEach((button) => {
    button.classList.toggle("selected", state.user.subjects.includes(button.dataset.subject));
  });
  $("#plan-modal-days").value = state.user.days;
  $("#plan-modal-time-start").value = state.user.studyTimeStart;
  $("#plan-modal-time-end").value = state.user.studyTimeEnd;
  $("#plan-modal").classList.remove("hidden");
}

function closePlanModal() {
  $("#plan-modal").classList.add("hidden");
}

function savePlanFromModal() {
  const subjects = $$("#plan-modal-subjects .subject.selected").map((button) => button.dataset.subject);
  if (!subjects.length) {
    showToast("Escolha pelo menos uma matéria.");
    return;
  }
  state.user.subjects = subjects;
  state.user.days = Number($("#plan-modal-days").value) || state.user.days;
  state.user.studyTimeStart = $("#plan-modal-time-start").value || state.user.studyTimeStart;
  state.user.studyTimeEnd = $("#plan-modal-time-end").value || state.user.studyTimeEnd;
  closePlanModal();
  setUserLabels();
  renderWeekPlan();
  renderSyllabusView();
  showToast("Plano atualizado com seu novo foco.");
}

function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem("studyforge-theme", theme);
}

function openSettingsModal() {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  $("#dark-mode-toggle").checked = isDark;
  $("#settings-modal").classList.remove("hidden");
}

function closeSettingsModal() {
  $("#settings-modal").classList.add("hidden");
}

function openLogSessionModal() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  $("#log-session-time").value = `${hh}:${mm}`;
  $("#log-session-minutes").value = 30;
  $("#log-session-modal").classList.remove("hidden");
}

function closeLogSessionModal() {
  $("#log-session-modal").classList.add("hidden");
}

async function submitLogSession() {
  const subject = $("#log-session-subject").value;
  const minutes = Number($("#log-session-minutes").value);
  const time = $("#log-session-time").value || "08:00";

  if (!minutes || minutes <= 0) {
    showToast("Informe quantos minutos você estudou.");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ subject, detail: "Sessão registrada manualmente", time, duration: minutes, tag: "Prática", completed: true })
    });
    if (!response.ok) throw new Error("create failed");
    await fetchDashboard();
    closeLogSessionModal();
    showToast(`Sessão registrada: ${formatMinutes(minutes)} de ${subject}.`);
  } catch (error) {
    showToast("Não foi possível registrar a sessão agora.");
  }
}

async function startCheckout() {
  try {
    const response = await fetch(`${API_BASE}/api/billing/checkout`, { method: "POST", credentials: "include" });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível iniciar o pagamento.");
      return;
    }
    window.location.href = data.url;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
  }
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  $("#toast-message").textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function addChatMessage(text, kind = "tutor") {
  const messages = $("#chat-messages");
  const message = document.createElement("div");
  message.className = `chat-message ${kind === "user" ? "user-message" : "tutor-message"}`;
  if (kind === "user") {
    message.style.alignSelf = "flex-end";
    message.innerHTML = `<div><p style="background:var(--coral);color:#fff;border-radius:11px 3px 11px 11px">${text}</p><small style="display:block;text-align:right">agora</small></div>`;
  } else {
    message.innerHTML = `<span class="message-avatar">✦</span><div><p>${text}</p><small>agora</small></div>`;
  }
  const suggestions = $(".suggestion-row", messages);
  messages.insertBefore(message, suggestions || null);
  messages.scrollTop = messages.scrollHeight;
}

function tutorReply(prompt) {
  const lower = prompt.toLowerCase();
  if (lower.includes("quadrática")) return "Função quadrática é uma função cujo gráfico forma uma parábola. Pense nela como uma curva que pode abrir para cima ou para baixo: <strong>f(x) = ax² + bx + c</strong>. Quer praticar com um exemplo?";
  if (lower.includes("quiz") || lower.includes("questões")) return "Boa! Preparei um desafio rápido: se <strong>f(x) = x² − 4x + 3</strong>, quais são as raízes? Responda e eu corrijo com você.";
  if (lower.includes("revis")) return "Para hoje, faça uma revisão ativa: 10 minutos de resumo sem consultar, 20 minutos de questões e 5 minutos explicando o tema em voz alta. Começamos por Matemática?";
  if (lower.includes("ponto fraco")) return "Pelo seu histórico recente, Biologia é a matéria que mais pede atenção. Sugiro 30 minutos de ecologia hoje e uma revisão curta amanhã.";
  if (lower.includes("resumo")) return "Posso transformar qualquer tema em um resumo de uma página. Me diga o assunto e o nível de profundidade que você quer.";
  return "Entendi. Vamos deixar isso mais simples juntos. Você prefere uma explicação passo a passo, um exemplo resolvido ou algumas questões para praticar?";
}

function submitTutor(prompt) {
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) return;
  addChatMessage(cleanPrompt, "user");
  setTimeout(() => addChatMessage(tutorReply(cleanPrompt)), 450);
}

document.addEventListener("click", async (event) => {
  const actionTarget = event.target.closest("[data-action]");
  const viewTarget = event.target.closest("[data-view-target]");
  const navTarget = event.target.closest(".side-nav-item[data-view]");
  const choiceTarget = event.target.closest("[data-choice-group]");
  const subjectTarget = event.target.closest(".subject");

  if (actionTarget) {
    const action = actionTarget.dataset.action;
    if (action === "start") goToOnboarding();
    if (action === "login") goToLogin();
    if (action === "goto-login") goToLogin();
    if (action === "back-landing") showScreen("landing-screen");
    if (action === "next-step") {
      if (state.step === 1) {
        actionTarget.disabled = true;
        const registered = await registerUser();
        actionTarget.disabled = false;
        if (!registered) return;
      }
      state.step = Math.min(3, state.step + 1);
      updateOnboardingProgress();
    }
    if (action === "prev-step") {
      state.step = Math.max(1, state.step - 1);
      updateOnboardingProgress();
    }
    if (action === "generate-plan") {
      collectFormData();
      if (!state.user.subjects.length) {
        showToast("Escolha pelo menos uma matéria.");
        return;
      }
      $(".form-card").classList.add("is-generating");
      setTimeout(enterDashboard, 1900);
    }
    if (action === "demo") {
      $("#features").scrollIntoView({ behavior: "smooth" });
      showToast("Este é o jeito StudyForge de organizar sua rotina.");
    }
    if (action === "upgrade") startCheckout();
    if (action === "regenerate") openPlanModal();
    if (action === "close-plan-modal") closePlanModal();
    if (action === "save-plan") savePlanFromModal();
    if (action === "open-syllabus") openSyllabusModal(actionTarget.dataset.subject);
    if (action === "close-syllabus-modal") closeSyllabusModal();
    if (action === "save-syllabus") await saveSyllabus();
    if (action === "open-log-session") openLogSessionModal();
    if (action === "close-log-session-modal") closeLogSessionModal();
    if (action === "save-log-session") await submitLogSession();
    if (action === "toggle-sidebar") $(".sidebar").classList.toggle("sidebar-open");
    if (action === "open-settings") openSettingsModal();
    if (action === "close-settings-modal") closeSettingsModal();
    if (action === "logout") {
      await fetch(`${API_BASE}/api/logout`, { method: "POST", credentials: "include" });
      window.location.reload();
    }
  }

  if (viewTarget) switchView(viewTarget.dataset.viewTarget);
  if (navTarget) switchView(navTarget.dataset.view);
  if (choiceTarget) {
    const group = choiceTarget.dataset.choiceGroup;
    $$(`[data-choice-group="${group}"]`).forEach((choice) => choice.classList.remove("selected"));
    choiceTarget.classList.add("selected");
  }
  if (subjectTarget) subjectTarget.classList.toggle("selected");

  const topicOption = event.target.closest(".topic-option");
  if (topicOption) {
    const row = topicOption.closest(".syllabus-topic-row");
    row.dataset.status = topicOption.dataset.topicStatus;
    $$(".topic-option", row).forEach((option) => option.classList.toggle("selected", option === topicOption));
  }

  const session = event.target.closest(".schedule-item");
  if (session && event.target.closest(".schedule-check")) {
    const sessionId = Number(session.dataset.sessionId);
    try {
      const response = await fetch(`${API_BASE}/api/sessions/${sessionId}/toggle`, { method: "POST", credentials: "include" });
      if (!response.ok) throw new Error("toggle failed");
      const updated = await response.json();
      await fetchDashboard();
      showToast(updated.completed ? "Boa! Sessão concluída." : "Sessão reaberta para você retomar.");
    } catch (error) {
      showToast("Não foi possível atualizar a sessão agora.");
    }
  }

  const promptTarget = event.target.closest("[data-prompt]");
  if (promptTarget) {
    switchView("tutor");
    submitTutor(promptTarget.dataset.prompt);
  }
});

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#login-form button[type=submit]");
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;

  if (!email || !password) {
    showToast("Preencha e-mail e senha para entrar.");
    return;
  }

  submitButton.disabled = true;
  const loggedIn = await loginUser(email, password);
  submitButton.disabled = false;
  if (loggedIn) enterDashboard();
});

$("#plan-modal").addEventListener("click", (event) => {
  if (event.target.id === "plan-modal") closePlanModal();
});

$("#log-session-modal").addEventListener("click", (event) => {
  if (event.target.id === "log-session-modal") closeLogSessionModal();
});

$("#settings-modal").addEventListener("click", (event) => {
  if (event.target.id === "settings-modal") closeSettingsModal();
});

$("#syllabus-modal").addEventListener("click", (event) => {
  if (event.target.id === "syllabus-modal") closeSyllabusModal();
});

$("#dark-mode-toggle").addEventListener("change", (event) => {
  applyTheme(event.target.checked ? "dark" : "light");
});

applyTheme(localStorage.getItem("studyforge-theme") === "dark" ? "dark" : "light");

const weeklyChartEl = $("#weekly-line-chart");
if (weeklyChartEl) {
  weeklyChartEl.addEventListener("mouseover", (event) => {
    const marker = event.target.closest(".line-marker");
    const tip = $("#weekly-chart-tooltip");
    if (!marker || !tip) return;
    tip.textContent = `${marker.dataset.label}: ${formatMinutes(Number(marker.dataset.min))}`;
    tip.style.left = marker.style.left;
    tip.style.top = `calc(${marker.style.top} - 12px)`;
    tip.classList.remove("hidden");
  });
  weeklyChartEl.addEventListener("mouseout", (event) => {
    if (!event.target.closest(".line-marker")) return;
    const tip = $("#weekly-chart-tooltip");
    if (tip) tip.classList.add("hidden");
  });
}

$("#chat-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const input = $("#chat-input");
  submitTutor(input.value);
  input.value = "";
});

async function restoreSession() {
  try {
    const response = await fetch(`${API_BASE}/api/me`, { credentials: "include" });
    if (!response.ok) return;
    const data = await response.json();
    state.user.id = data.id;
    state.user.name = data.name;
    state.user.plan = data.plan || "free";
    enterDashboard();
    handleCheckoutRedirect();
  } catch (error) {
    // Sem conexão com o servidor: permanece na landing page.
  }
}

function handleCheckoutRedirect() {
  const params = new URLSearchParams(window.location.search);
  const checkout = params.get("checkout");
  if (!checkout) return;
  if (checkout === "success") {
    showToast(state.user.plan === "plus" ? "Assinatura confirmada! Bem-vindo ao StudyForge Plus." : "Pagamento recebido, confirmando sua assinatura...");
  } else if (checkout === "cancelled") {
    showToast("Assinatura não concluída.");
  }
  params.delete("checkout");
  const newUrl = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
  window.history.replaceState({}, "", newUrl);
}

restoreSession();
