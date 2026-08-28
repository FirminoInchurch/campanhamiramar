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

const app = express();
app.use(express.json());

const DATA_FILE = path.join(__dirname, 'total-arrecadado.json');
const GOAL_BAGS = 1200;
const BAG_PRICE = 44;

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

// Endpoint que a inChurch vai chamar a cada doação
app.post('/webhook/inchurch', (req, res) => {
  // TODO: validar a assinatura/origem da requisição aqui, se a inChurch fornecer
  // um header de assinatura (comum em webhooks — ex.: HMAC com o API Secret).

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
