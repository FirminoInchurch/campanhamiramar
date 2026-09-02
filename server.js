/**
 * Backend de exemplo — recebe o webhook de doação da inChurch e expõe
 * o total arrecadado para a landing page consumir.
 *
 * IMPORTANTE — antes de usar isto de verdade:
 * A documentação pública da inChurch (docs.inchurch.com.br) confirma que a API
 * tem autenticação por API Key/Secret e menciona webhooks, mas NÃO deixa claro,
 * na parte que consegui acessar, qual é o nome do evento de doação nem o formato
 * exato do payload. Antes de colocar isso em produção:
 *   1. Fale com o suporte/dev da inChurch e peça a especificação do webhook de
 *      doação (nome do evento, campos do payload, como validar a origem/assinatura).
 *   2. Ajuste a função `extractDonationAmount` abaixo com os nomes de campo reais.
 *   3. Configure a URL pública deste endpoint (ex.: https://seu-dominio.com/webhook/inchurch)
 *      no painel da inChurch, na seção de Webhooks.
 *
 * Deploy sugerido: Render, Railway ou Fly.io (qualquer um roda isso de graça
 * no plano básico). Troque o armazenamento em arquivo por um banco de verdade
 * (Postgres, Redis, etc.) assim que sair do protótipo — arquivo local não
 * sobrevive a reinícios em muitos provedores serverless.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();

// Guarda o corpo bruto (raw) da requisição também — o cálculo do HMAC
// precisa dos bytes originais, não do JSON já interpretado.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const DATA_FILE = path.join(__dirname, 'total-arrecadado.json');
const GOAL_BAGS = 1200;
const BAG_PRICE = 44;

// O segredo vem de uma variável de ambiente — NUNCA escreva o valor aqui no código.
const WEBHOOK_SECRET = process.env.INCHURCH_WEBHOOK_SECRET;

// TODO: confirmar com a inChurch o nome exato do header que carrega a assinatura
// (aqui assumi "x-inchurch-signature", um padrão comum, mas pode ser diferente —
// ex.: "x-hub-signature-256", "x-webhook-signature" etc.) e o algoritmo (assumi sha256).
function isValidSignature(req) {
  if (!WEBHOOK_SECRET) {
    console.warn('INCHURCH_WEBHOOK_SECRET não configurado — recusando por segurança.');
    return false;
  }

  const signatureHeader = req.get('x-inchurch-signature');
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac('sha256', WEBHOOK_SECRET)
    .update(req.rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signatureHeader),
      Buffer.from(expected)
    );
  } catch {
    // tamanhos diferentes de buffer, por exemplo — assinatura inválida
    return false;
  }
}

function readTotal() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')).total || 0;
  } catch {
    return 0;
  }
}

function writeTotal(total) {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ total }));
}

// TODO: ajustar conforme o payload real do webhook da inChurch.
// Este é um formato hipotético — troque pelos nomes de campo corretos
// assim que tiver a documentação/exemplo de payload confirmado.
function extractDonationAmount(payload) {
  // Exemplos de onde o valor pode vir, dependendo do formato real:
  // payload.amount, payload.data.value, payload.donation.value_cents / 100, etc.
  const amount = payload?.data?.amount ?? payload?.amount ?? 0;
  return Number(amount);
}

// Só contamos doações do tipo/campanha configurado abaixo (ex.: "Mutirão do Cimento").
// Defina o valor exato (nome, id ou slug da campanha) na variável de ambiente
// INCHURCH_DONATION_TYPE no Railway.
// TODO: ajustar o campo `payload?.data?.type` para o nome real do campo que a
// inChurch usa (pode ser "campaign", "fund", "category", "designation" etc.) —
// isso vem do exemplo de payload real que você conseguir no histórico de entregas.
function isTargetDonationType(payload) {
  const allowedType = process.env.INCHURCH_DONATION_TYPE;
  if (!allowedType) {
    console.warn('INCHURCH_DONATION_TYPE não configurado — aceitando todos os tipos por enquanto.');
    return true;
  }

  const receivedType = payload?.data?.type ?? payload?.type ?? payload?.data?.campaign ?? '';
  return String(receivedType).trim().toLowerCase() === allowedType.trim().toLowerCase();
}

// Endpoint que a inChurch vai chamar a cada doação
app.post('/webhook/inchurch', (req, res) => {
  if (!isValidSignature(req)) {
    console.warn('Webhook recebido com assinatura inválida ou ausente — ignorado.');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  if (!isTargetDonationType(req.body)) {
    console.log('Doação de outro tipo/campanha recebida — ignorada.');
    return res.status(200).json({ ok: true, ignored: true });
  }

  const amount = extractDonationAmount(req.body);

  if (!amount || amount <= 0) {
    return res.status(400).json({ error: 'Payload sem valor de doação reconhecível' });
  }

  const newTotal = readTotal() + amount;
  writeTotal(newTotal);

  console.log(`Doação recebida: R$ ${amount} — total acumulado: R$ ${newTotal}`);
  res.status(200).json({ ok: true });
});

// Endpoint que a landing page consulta para desenhar a barra
app.get('/api/progress', (req, res) => {
  const totalArrecadado = readTotal();
  const sacosDoados = Math.floor(totalArrecadado / BAG_PRICE);

  res.json({
    totalArrecadado,
    sacosDoados,
    metaSacos: GOAL_BAGS,
    metaReais: GOAL_BAGS * BAG_PRICE,
    percentual: Math.min(1, sacosDoados / GOAL_BAGS),
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
