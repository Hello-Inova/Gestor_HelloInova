// Envio de e-mails transacionais (códigos de verificação) via API do Resend.
// Usa apenas fetch nativo do Node — sem SDK extra.
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const FROM_NAME = process.env.RESEND_FROM_NAME || 'Hello Inova';

// Envia um e-mail com o código de verificação. Não lança erro para quem
// chamou em caso de falha no envio — registra no console e retorna
// { ok: false } para que o fluxo (cadastro/login) não trave por causa de
// uma instabilidade do provedor de e-mail; o código já foi salvo no banco
// e pode ser reenviado.
async function sendVerificationEmail({ to, name, code, purpose }) {
  const subject = purpose === 'login'
    ? 'Seu código de login — Hello Inova'
    : 'Confirme seu e-mail — Hello Inova';

  const greeting = name ? `Olá, ${name}!` : 'Olá!';
  const action = purpose === 'login' ? 'para concluir seu login' : 'para confirmar seu cadastro';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a;">
      <h2 style="margin:0 0 16px;">${greeting}</h2>
      <p style="font-size:14px;line-height:1.6;">Use o código abaixo ${action} no Gestor de Sistemas Hello Inova:</p>
      <div style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;background:#f2f4f8;border-radius:10px;padding:18px 0;margin:20px 0;">${code}</div>
      <p style="font-size:13px;color:#666;line-height:1.6;">Esse código expira em 10 minutos. Se você não solicitou isso, pode ignorar este e-mail com segurança.</p>
    </div>
  `;

  if (!RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY não configurada — código de ${purpose} para ${to}: ${code}`);
    return { ok: false, reason: 'no_api_key' };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[email] Falha ao enviar via Resend (status ${res.status}): ${body}`);
      console.log(`[email] Código de ${purpose} para ${to} (fallback log): ${code}`);
      return { ok: false, reason: 'send_failed' };
    }

    return { ok: true };
  } catch (err) {
    console.error('[email] Erro ao chamar a API do Resend:', err.message);
    console.log(`[email] Código de ${purpose} para ${to} (fallback log): ${code}`);
    return { ok: false, reason: 'network_error' };
  }
}

module.exports = { sendVerificationEmail };
