// Manda um e-mail de teste com a configuração SMTP do .env, para conferir a
// senha de app sem precisar disparar a recuperação de senha inteira.
//   node scripts/test-email.js seu@email.com
require("dotenv").config();
const nodemailer = require("nodemailer");

const destino = process.argv[2] || process.env.SMTP_USER;

if (!process.env.SMTP_USER) {
  console.error("Falta SMTP_USER no .env (e SMTP_PASS com a senha de app).");
  process.exit(1);
}
if (!destino) {
  console.error("Uso: node scripts/test-email.js seu@email.com");
  process.exit(1);
}

const mailer = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
});

(async () => {
  try {
    // Falha aqui = credencial errada, antes de tentar mandar qualquer mensagem.
    await mailer.verify();
    console.log(`login ok em ${process.env.SMTP_HOST || "smtp.gmail.com"} como ${process.env.SMTP_USER}`);
    const info = await mailer.sendMail({
      from: process.env.MAIL_FROM || process.env.SMTP_USER,
      to: destino,
      subject: "Teste do StudyForge AI",
      html: "<p>Se você está lendo isto, o envio de e-mail está funcionando.</p>"
    });
    console.log(`enviado para ${destino} (id ${info.messageId})`);
  } catch (error) {
    console.error(`falhou: ${error.message}`);
    process.exit(1);
  }
})();
