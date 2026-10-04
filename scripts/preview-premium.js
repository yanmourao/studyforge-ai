// Alternate local presentation. The main entry page stays unchanged.
const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const port = Number(process.env.PREMIUM_PORT || 3002);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PREMIUM_PORT");
process.env.PORT = String(port);
const backend = require("../server");
const pool = require("../db");
const app = express();
app.get(["/", "/index.html"], (req, res) => {
  let html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  html = html.replace('<meta name="theme-color" content="#f7f8fa" />', '<meta name="theme-color" content="#0b0b0d" />');
  html = html.replace('<title>StudyForge AI — estudos com direção</title>', '<title>StudyForge — edição premium</title>');
  html = html.replace('  <script>', '  <script>if (!localStorage.getItem("studyforge-theme")) localStorage.setItem("studyforge-theme", "dark");</script>\n  <script>');
  html = html.replace('<link rel="stylesheet" href="theme.css" />', '<link rel="stylesheet" href="theme.css" />\n  <link rel="stylesheet" href="premium.css" />');
  html = html.replace('<body>', '<body class="premium-edition">');
  html = html.replace('Organize seu estudo.<br /><span>Acompanhe o que aprendeu.</span>', 'Seu próximo objetivo.<br /><span>Um plano para chegar lá.</span>');
  html = html.replace('<section class="hero shell">', `<section class="hero shell"><div class="premium-architecture" aria-hidden="true"><svg viewBox="0 0 1440 720" fill="none" preserveAspectRatio="none"><defs><filter id="premium-edge-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16"/></filter></defs><path class="architecture-glow" d="M-60 120 160 192V302L342 365V475L530 540V650L720 715 910 650V540L1098 475V365L1280 302V192L1500 120"/><path class="architecture-edge" d="M-60 120 160 192V302L342 365V475L530 540V650L720 715 910 650V540L1098 475V365L1280 302V192L1500 120"/><path class="architecture-panel" d="M135 30 320 77V192L135 144ZM1120 30 1305 77V192L1120 144Z"/></svg></div>`);
  html = html.replace('Plano de estudo, ementa e questões', 'StudyForge · planejamento e prática');
  html = html.replace('Escolha as matérias, distribua o tempo de estudo e registre suas sessões. Use a ementa e as questões para acompanhar o que ainda precisa revisar.', 'Organize sua rotina, pratique com questões e acompanhe cada sessão. Um espaço para concentrar o que você precisa estudar.');
  html = html.replace('<div class="hero-visual"', '<div class="premium-product-label"><span>Seu espaço de estudo</span><span>Planejar. Praticar. Revisar.</span></div>\n        <div class="hero-visual"');
  html = html.replace('<div class="dashboard-preview">', '<div class="dashboard-preview"><div class="premium-preview-nav"><span class="premium-preview-dot"></span><strong>Meu espaço</strong><span>Visão geral</span><span>Meu plano</span><span>Questões</span><span>Progresso</span><small>StudyForge</small></div>');
  res.type("html").send(html);
});
app.use(backend);
module.exports = app;
if (require.main === module) {
  pool.ensureSchema().then(() => {
    const listener = app.listen(port, "127.0.0.1", () => console.log(`StudyForge Premium: http://localhost:${port}`));
    listener.on("error", error => {console.error(error.message); process.exit(1);});
  }).catch(error => {console.error("Falha ao iniciar a prévia:", error.message); process.exit(1);});
}
