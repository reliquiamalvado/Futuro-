#!/usr/bin/env node
// Simula um equipamento DigitalControl conectado à API real, para testar o
// sistema de ponta a ponta antes de instalar o ESP32.
//
// Uso (Node 18+), com as credenciais exibidas ao cadastrar o dispositivo:
//   DC_API_URL=https://xxxx.supabase.co/functions/v1/device-api \
//   DC_DEVICE_ID=... DC_SECRET=... node tools/simulador-dispositivo.mjs
//
// Cada comando recebido "abre" ou "fecha" o portão simulado (leva 4 s) e é
// confirmado para a plataforma, como o firmware faria.

const { DC_API_URL, DC_DEVICE_ID, DC_SECRET } = process.env;
if (!DC_API_URL || !DC_DEVICE_ID || !DC_SECRET) {
  console.error("Defina DC_API_URL, DC_DEVICE_ID e DC_SECRET.");
  process.exit(1);
}

const estados = { 1: "fechado", 2: "fechado", 3: "fechado", 4: "fechado" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(rota, corpo, timeoutMs) {
  const r = await fetch(`${DC_API_URL}/${rota}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Device-Id": DC_DEVICE_ID,
      Authorization: `Device ${DC_SECRET}`,
    },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(timeoutMs),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}

function mover(canal, destino) {
  estados[canal] = "movendo";
  setTimeout(() => { estados[canal] = destino; console.log(`  canal ${canal}: ${destino}`); }, 4000);
}

async function executar(cmd) {
  console.log(`> ${cmd.action} no canal ${cmd.channel} (${cmd.mode}, ${cmd.pulse_ms} ms)`);
  if (cmd.mode === "pulso") {
    mover(cmd.channel, estados[cmd.channel] === "aberto" ? "fechado" : "aberto");
  } else {
    mover(cmd.channel, cmd.action === "abrir" ? "aberto" : "fechado");
  }
  await sleep(cmd.pulse_ms ?? 500);
  const r = await post("ack", { command_id: cmd.id, success: true, states: estados }, 10000);
  console.log(`  confirmado (HTTP ${r.status})`);
}

console.log(`Simulador conectado como ${DC_DEVICE_ID}. Ctrl+C para sair.`);
let espera = 2000;
while (true) {
  try {
    const r = await post("poll", { states: estados, info: { firmware: "simulador-1.0", ip: "127.0.0.1", rssi: -50 } }, 30000);
    if (r.status === 401) { console.error("Credenciais recusadas."); process.exit(1); }
    if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
    espera = 2000;
    for (const cmd of r.body.commands ?? []) await executar(cmd);
  } catch (e) {
    console.error("Erro:", e.message);
    await sleep(espera);
    espera = Math.min(espera * 2, 30000);
  }
}
