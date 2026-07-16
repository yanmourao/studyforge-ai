const state = {
  step: 1,
  currentView: "overview",
  user: {
    name: "Rafaela",
    objective: "ENEM",
    days: 90,
    hours: 2,
    level: "Intermediário",
    subjects: ["Matemática", "Português", "Biologia"]
  },
  sessions: [
    { id: 1, time: "08:00", subject: "Matemática", detail: "Função quadrática · revisão", duration: "50 min", tag: "Foco", tagClass: "tag-coral", completed: true },
    { id: 2, time: "10:00", subject: "Português", detail: "Interpretação de texto", duration: "40 min", tag: "Leitura", tagClass: "tag-mint", completed: true },
    { id: 3, time: "19:00", subject: "Biologia", detail: "Ecologia · questões", duration: "30 min", tag: "Prática", tagClass: "tag-lilac", completed: false }
  ]
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
    const response = await fetch("/api/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível concluir seu cadastro.");
      return false;
    }
    state.user.id = data.id;
    return true;
  } catch (error) {
    showToast("Não foi possível conectar ao servidor.");
    return false;
  }
}

async function loginUser(email, password) {
  try {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      showToast(data.error || "Não foi possível entrar.");
      return false;
    }
    state.user.id = data.id;
    state.user.name = data.name;
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
}

function renderSchedule() {
  const list = $("#schedule-list");
  if (!list) return;
  list.innerHTML = state.sessions.map((session, index) => `
    <div class="schedule-item ${session.completed ? "completed" : ""} ${!session.completed && index === 2 ? "active-item" : ""}" data-session-id="${session.id}">
      <button class="schedule-check" aria-label="Marcar ${session.subject} como concluído">${session.completed ? "✓" : ""}</button>
      <span class="schedule-time">${session.time}</span>
      <span class="schedule-copy"><strong>${session.subject}</strong><small>${session.detail}</small></span>
      <span class="schedule-tag ${session.tagClass}">${session.tag}</span>
    </div>
  `).join("");
  const complete = state.sessions.filter((session) => session.completed).length;
  const total = state.sessions.length;
  const percent = Math.round((complete / total) * 100);
  $("#schedule-completed").textContent = complete;
  $("#schedule-total").textContent = total;
  $("#today-progress").innerHTML = `${complete}<small>/${total}</small>`;
  $("#today-bar").style.width = `${percent}%`;
  $("#today-percent").textContent = `${percent}% do dia completo`;
  $("#schedule-progress-label").textContent = complete === total ? "dia concluído" : `${Math.max(0, total - complete)} sessão${total - complete === 1 ? "" : "ões"} restante${total - complete === 1 ? "" : "s"}`;
}

function subjectTagClass(subject) {
  const classes = { "Matemática": "", "Português": "mint-session", "Biologia": "lilac-session", "História": "mint-session", "Física": "lilac-session", "Química": "mint-session" };
  return classes[subject] || "";
}

function renderWeekPlan() {
  const list = $("#week-list");
  if (!list) return;
  const subjects = state.user.subjects.length ? state.user.subjects : ["Matemática", "Português"];
  const days = ["Hoje", "Amanhã", "Sexta-feira", "Sábado", "Domingo"];
  const dates = ["15 mai", "16 mai", "17 mai", "18 mai", "19 mai"];
  list.innerHTML = days.map((day, dayIndex) => {
    const first = subjects[dayIndex % subjects.length];
    const second = subjects[(dayIndex + 1) % subjects.length];
    const sessions = [
      { time: dayIndex === 0 ? "08:00" : "09:00", subject: first, detail: dayIndex % 2 ? "conteúdo novo" : "revisão espaçada", className: subjectTagClass(first) },
      ...(state.user.hours >= 2 ? [{ time: dayIndex === 0 ? "10:00" : "19:00", subject: second, detail: "questões e prática", className: subjectTagClass(second) }] : [])
    ];
    return `<article class="week-day ${dayIndex === 0 ? "today" : ""}"><div class="week-day-label"><strong>${day}</strong><span>${dates[dayIndex]}</span></div><div class="week-day-sessions">${sessions.map((session) => `<div class="week-session ${session.className}"><span class="time">${session.time}</span><strong>${session.subject}</strong><small>${session.detail}</small></div>`).join("")}</div></article>`;
  }).join("");
}

function enterDashboard() {
  setUserLabels();
  renderSchedule();
  renderWeekPlan();
  showScreen("dashboard-screen");
  switchView("overview");
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
  state.currentView = view;
  $$("[data-view-panel]").forEach((panel) => panel.classList.toggle("active-view", panel.dataset.viewPanel === view));
  $$(".side-nav-item[data-view]").forEach((item) => item.classList.toggle("active", item.dataset.view === view));
  const labels = { overview: "Visão geral", plan: "Meu plano", tutor: "Tutor IA", progress: "Meu progresso" };
  $("#breadcrumb-current").textContent = labels[view] || "Visão geral";
  $(".sidebar")?.classList.remove("sidebar-open");
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
    if (action === "upgrade") showToast("O plano Plus estará disponível em breve.");
    if (action === "regenerate") {
      showToast("Seu plano foi reorganizado com base no seu ritmo.");
      state.sessions = state.sessions.map((session, index) => ({ ...session, completed: index < 1 }));
      renderSchedule();
      renderWeekPlan();
    }
    if (action === "add-session") {
      const nextId = Math.max(...state.sessions.map((session) => session.id), 0) + 1;
      state.sessions.push({ id: nextId, time: "21:00", subject: "Revisão livre", detail: "Consolide o que aprendeu hoje", duration: "20 min", tag: "Extra", tagClass: "tag-mint", completed: false });
      renderSchedule();
      showToast("Sessão extra adicionada ao seu dia.");
    }
    if (action === "toggle-sidebar") $(".sidebar").classList.toggle("sidebar-open");
    if (action === "logout") {
      await fetch("/api/logout", { method: "POST" });
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
    const sessionData = state.sessions.find((item) => item.id === Number(session.dataset.sessionId));
    if (sessionData) {
      sessionData.completed = !sessionData.completed;
      renderSchedule();
      showToast(sessionData.completed ? "Boa! Sessão concluída." : "Sessão reaberta para você retomar.");
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

// Inicializa a tela de demonstração com dados prontos para explorar.
setUserLabels();
renderSchedule();
renderWeekPlan();

async function restoreSession() {
  try {
    const response = await fetch("/api/me");
    if (!response.ok) return;
    const data = await response.json();
    state.user.id = data.id;
    state.user.name = data.name;
    enterDashboard();
  } catch (error) {
    // Sem conexão com o servidor: permanece na landing page.
  }
}

restoreSession();
