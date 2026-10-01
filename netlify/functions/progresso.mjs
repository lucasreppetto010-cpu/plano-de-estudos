// Função do servidor (roda na Netlify, não no navegador).
// Guarda o progresso de cada código de sincronização no Netlify Blobs,
// um "banco de dados" simples de chave → valor que já vem com a Netlify.

import { getStore } from "@netlify/blobs";

// Código aceito: letras minúsculas, números e hífen, de 12 a 40 caracteres
const CODIGO_VALIDO = /^[a-z0-9-]{12,40}$/;

const json = (dados, status = 200) =>
  new Response(JSON.stringify(dados), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
  });

// Junta dois progressos: para cada item, vence o que foi alterado por último.
// É isso que permite marcar no celular e no PC sem um apagar o outro.
function juntar(a, b) {
  const progresso = { ...a.progresso };
  const tempos = { ...a.tempos };

  for (const id of Object.keys(b.progresso)) {
    const tempoB = b.tempos[id] || 0;
    if (!(id in progresso) || tempoB > (tempos[id] || 0)) {
      progresso[id] = b.progresso[id];
      tempos[id] = tempoB;
    }
  }
  return { progresso, tempos };
}

// Aceita só { progresso: { id: true/false }, tempos: { id: número } }
function limpar(dados) {
  const progresso = {};
  const tempos = {};
  const entrada = dados && typeof dados.progresso === "object" ? dados.progresso : {};
  const temposEntrada = dados && typeof dados.tempos === "object" ? dados.tempos : {};

  for (const [id, valor] of Object.entries(entrada)) {
    if (!/^[a-z0-9-]{1,40}$/.test(id) || typeof valor !== "boolean") continue;
    progresso[id] = valor;
    tempos[id] = Number(temposEntrada[id]) || 0;
  }
  return { progresso, tempos };
}

// POST { codigo, progresso, tempos }
// Junta o que veio do aparelho com o que já estava salvo e devolve o resultado.
// O código vai no corpo (e não no link) para não aparecer em histórico e logs.
export default async (req) => {
  if (req.method !== "POST") {
    return json({ erro: "Método não permitido" }, 405);
  }

  const texto = await req.text();
  if (texto.length > 100_000) return json({ erro: "Dados grandes demais" }, 413);

  let corpo;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return json({ erro: "JSON inválido" }, 400);
  }

  const codigo = typeof corpo?.codigo === "string" ? corpo.codigo : "";
  if (!CODIGO_VALIDO.test(codigo)) {
    return json({ erro: "Código de sincronização inválido" }, 400);
  }

  const store = getStore({ name: "progresso", consistency: "strong" });
  const salvo = limpar(await store.get(codigo, { type: "json" }));
  const final = juntar(salvo, limpar(corpo));

  await store.setJSON(codigo, final);
  return json(final);
};

export const config = { path: "/api/progresso" };
