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
    level: "Intermediário",
    subjects: []
  },
  sessions: []
};

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
  $("#plan-hours").textContent = `${state.user.hours} ${state.user.hours === 1 ? "hora" : "horas"}`;
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

function subjectTagClass(subject) {
  const classes = { "Matemática": "", "Português": "mint-session", "Biologia": "lilac-session", "História": "mint-session", "Física": "lilac-session", "Química": "mint-session" };
  return classes[subject] || "";
}

function renderWeekPlan() {
  const list = $("#week-list");
  if (!list) return;
  const subjects = state.user.subjects.length ? state.user.subjects : ["Matemática", "Português"];
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
      { time: dayIndex === 0 ? "08:00" : "09:00", subject: first, detail: dayIndex % 2 ? "conteúdo novo" : "revisão espaçada", className: subjectTagClass(first) },
      ...(state.user.hours >= 2 ? [{ time: dayIndex === 0 ? "10:00" : "19:00", subject: second, detail: "questões e prática", className: subjectTagClass(second) }] : [])
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
  const columnsEl = $("#weekly-chart-columns");
  if (!columnsEl) return;

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
  const maxMinutes = Math.max(...minutesPerDay, 60);

  columnsEl.innerHTML = weekDates.map((date, index) => {
    const minutes = minutesPerDay[index];
    const isToday = toDateKey(date) === toDateKey(today);
    const isFuture = date > today;
    const heightPercent = isFuture ? 0 : Math.max(4, Math.round((minutes / maxMinutes) * 100));
    return `<span class="${isToday ? "chart-today" : ""}"><i class="${isFuture ? "muted-column" : ""}" style="height:${heightPercent}%"></i><b>${WEEKDAY_LABELS[index]}</b></span>`;
  }).join("");

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
      const dotClasses = ["math-color", "portuguese-color", "bio-color", "history-color", "physics-color", "chemistry-color"];
      subjectListEl.innerHTML = subjects.map((subject, index) => {
        const total = Number(subject.total);
        const completed = Number(subject.completed);
        const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const colorClass = dotClasses[index % dotClasses.length];
        return `<div class="subject-progress-row"><span class="subject-dot ${colorClass}"></span><b>${subject.subject}</b><span class="progress-mini-track"><i class="${colorClass}" style="width:${percent}%"></i></span><strong>${percent}%</strong></div>`;
      }).join("");
    }
  }

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

function enterDashboard() {
  setUserLabels();
  renderWeekPlan();
  showScreen("dashboard-screen");
  switchView("overview");
  fetchDashboard();
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
  const labels = { overview: "Visão geral", plan: "Meu plano", tutor: "Tutor IA", progress: "Meu progresso" };
  $("#breadcrumb-current").textContent = labels[view] || "Visão geral";
  $(".sidebar")?.classList.remove("sidebar-open");
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
    if (action === "regenerate") {
      showToast("Seu plano foi reorganizado com base no seu ritmo.");
      renderWeekPlan();
    }
    if (action === "add-session") {
      try {
        const response = await fetch(`${API_BASE}/api/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ subject: "Revisão livre", detail: "Consolide o que aprendeu hoje", time: "21:00", duration: 20, tag: "Extra" })
        });
        if (!response.ok) throw new Error("create failed");
        await fetchDashboard();
        showToast("Sessão extra adicionada ao seu dia.");
      } catch (error) {
        showToast("Não foi possível adicionar a sessão agora.");
      }
    }
    if (action === "toggle-sidebar") $(".sidebar").classList.toggle("sidebar-open");
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
