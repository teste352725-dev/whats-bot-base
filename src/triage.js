const TENANTS = {
  efcol: {
    name: "EFCOL",
    welcome:
`Olá! 👋 Sou o atendimento da EFCOL.
Pra te direcionar certinho, escolha uma opção:
1) Cursos / Seminários
2) Retiros
3) Libertação e Cura (informações)
Responda com 1, 2 ou 3.`,
    rules: [
      { match: ["1", "curso", "cursos", "semin", "seminário", "seminarios"], tag: "cursos" },
      { match: ["2", "retiro", "retiros"], tag: "retiros" },
      { match: ["3", "cura", "libert", "libertação"], tag: "cura-libertacao" }
    ]
  },

  alef: {
    name: "Alef",
    welcome:
`Olá! 👋 Sou o atendimento do Alef.
O que você precisa?
1) Seminários
2) Cursos / Ensino
3) Consultoria
Responda 1, 2 ou 3.`,
    rules: [
      { match: ["1", "semin"], tag: "seminarios" },
      { match: ["2", "curso", "ensino", "grupo", "grupos"], tag: "cursos-ensino" },
      { match: ["3", "consult", "mentoria"], tag: "consultoria" }
    ]
  },

  sejaprofeta: {
    name: "Seja Profeta",
    welcome:
`Olá! 🕯️ Seja bem-vindo(a)!
Você quer:
1) Comprar Velas Kosher (Shabat)
2) Dúvidas sobre entrega/pagamento
Responda 1 ou 2.`,
    rules: [
      { match: ["1", "vela", "velas", "kosher", "shabat", "shabbat"], tag: "vendas-velas" },
      { match: ["2", "entrega", "frete", "pag", "pagamento"], tag: "suporte-vendas" }
    ]
  }
};

function normalize(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function decideTenantForNewContact(text) {
  const t = normalize(text);
  if (t.includes("efcol")) return "efcol";
  if (t.includes("alef")) return "alef";
  if (t.includes("vela") || t.includes("kosher") || t.includes("shabat")) return "sejaprofeta";
  return "efcol";
}

export function getTenantConfig(tenant) {
  return TENANTS[tenant] || TENANTS.efcol;
}

export function triageTag(tenant, text) {
  const cfg = getTenantConfig(tenant);
  const t = normalize(text);
  for (const r of cfg.rules) {
    for (const m of r.match) {
      if (t.includes(normalize(m))) return r.tag;
    }
  }
  return null;
}
