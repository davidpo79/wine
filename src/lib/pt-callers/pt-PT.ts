// Portugal HR callers: every word the rep reads, in European Portuguese
// (pt-PT, not Brazilian), and the call script. The Admin half of the screen
// stays in English like the rest of this admin.
//
// pt-PT, not pt-BR: "contacto", "telemóvel", "equipa", "registar", "ecrã",
// "auscultadores"; never "contato", "celular", "equipe", "registrar",
// "tela", "fone de ouvido", "você". tests/pt-callers-access.test.ts checks it.

export const PT = {
  title: "Contactos de RH em Portugal",
  subtitle: "Responsáveis de recursos humanos em empresas portuguesas com 51 a 500 colaboradores.",
  demoBanner:
    "Modo de demonstração: os contactos são fictícios e nenhuma chamada real é efetuada. As chamadas para Portugal só serão ativadas depois da aprovação jurídica escrita.",
  loading: "A carregar…",
  loadError: "Não foi possível carregar os contactos.",
  noLeads: "Ainda não tem contactos atribuídos.",
  logout: "Terminar sessão",
  password: "Alterar palavra-passe",
  columns: {
    name: "Nome", title: "Cargo", company: "Empresa", employees: "N.º de colaboradores", city: "Cidade",
    phone: "Telefone", email: "Email profissional", status: "Estado", lastCall: "Última chamada", followUp: "Seguimento", actions: "Ações",
  },
  sources: { apollo: "Apollo", demo: "Demonstração" } as Record<string, string>,
  never: "Nunca",
  statuses: {
    new: "Novo", ready: "Pronto a ligar", calling: "Em chamada", no_answer: "Não atendeu", callback: "Ligar mais tarde",
    interested: "Interessado", not_interested: "Sem interesse", wrong_number: "Número errado", opt_out: "Não contactar",
    blocked: "Bloqueado", enrichment_pending: "A aguardar dados", failed: "Falhou",
  } as Record<string, string>,
  actions: {
    call: "Ligar",
    endCall: "Terminar chamada",
    optOut: "Não contactar (opt-out)",
    optOutConfirm: "Confirma que esta pessoa não quer voltar a ser contactada? Esta ação é definitiva.",
    optOutHint: "Pedido de remoção é diferente de \"Sem interesse\". Em caso de dúvida, use \"Não contactar\".",
    details: "Detalhes",
    outcome: "Resultado da chamada",
    chooseOutcome: "Escolher resultado…",
    followUpAt: "Data de seguimento",
    save: "Guardar",
    notes: "Notas curtas (sem dados pessoais)",
    lockedByOther: "Outro comercial está a trabalhar este contacto.",
  },
  panel: {
    heading: "Contacto",
    source: "Origem dos dados",
    checked: "Data de obtenção",
    history: "Histórico de chamadas",
    noHistory: "Ainda sem chamadas.",
    close: "Fechar",
  },
  device: {
    checkHeading: "Antes de começar",
    check: "Testar microfone e auscultadores",
    checking: "Fale agora: deve ver a barra a mexer e ouvir um sinal curto nos auscultadores.",
    checkOk: "Microfone e auscultadores testados.",
    micDenied: "Permita o acesso ao microfone para poder fazer chamadas.",
    activate: "Ativar telefone",
    activating: "A ativar o telefone…",
    ready: "Telefone pronto",
    unavailable: "O telefone não está disponível.",
    needCheck: "Teste primeiro o microfone e os auscultadores.",
    needed: "Ative o telefone antes de ligar.",
  },
  callStatus: {
    dialing_rep: "A ligar para o seu telefone…",
    dialing_customer: "A ligar para o contacto…",
    connected: "Em conversa",
    completed: "Chamada terminada",
    no_answer: "O contacto não atendeu",
    ended: "Chamada terminada",
    refused: "A chamada foi recusada pelo sistema",
    failed: "A chamada falhou",
  } as Record<string, string>,
  refusals: {
    pt_callers_disabled: "As chamadas para Portugal estão desativadas.",
    legal_not_approved: "Ainda falta a aprovação jurídica: não é possível ligar.",
    lead_not_dialable: "Este contacto não pode ser chamado no estado atual.",
    blocked: "Este número está na lista de bloqueio.",
    phone_not_pt_e164: "O número não é um número português válido.",
    not_pilot_number: "Durante o piloto só é possível ligar para números de teste aprovados.",
    eligibility_not_recorded: "Falta confirmar que é uma linha de empresa e o fundamento jurídico. Fale com o administrador.",
    calling_hours_not_set: "O horário de chamadas ainda não foi aprovado.",
    outside_calling_hours: "Fora do horário de chamadas aprovado.",
    max_attempts_reached: "Atingido o número máximo de tentativas para este contacto.",
    dnc_listed: "Este número consta da lista nacional de oposição.",
    dnc_unavailable: "Não foi possível confirmar a lista de oposição. A chamada não foi feita.",
    lead_locked: "Outro comercial está a trabalhar este contacto.",
    budget_exhausted: "Atingiu o limite diário de chamadas.",
    budget_unknown: "Não foi possível confirmar o limite de chamadas. A chamada não foi feita.",
    spend_cap_not_set: "O limite de gastos com chamadas ainda não foi definido.",
    spend_cap_reached: "Atingido o limite diário de chamadas da equipa.",
    block_key_changed: "A lista de bloqueio não pode ser verificada. Fale com o administrador.",
    rep_busy: "Já tem uma chamada em curso.",
    not_found: "Contacto não encontrado.",
    no_device: "Ative primeiro o telefone.",
    device_revoked: "O seu telefone foi desativado. Fale com o administrador.",
    lead_blocked: "Este contacto pediu para não ser contactado.",
    invalid_follow_up: "Escolha uma data de seguimento futura.",
    default: "Não foi possível concluir a ação.",
  } as Record<string, string>,
  script: {
    heading: "Guião da chamada",
    note: "Os campos entre parênteses retos são preenchidos pela empresa antes do arranque, depois da revisão jurídica.",
    steps: [
      { title: "Abertura", text: "Bom dia (ou boa tarde). Fala [o seu nome], da [nome da empresa]. Estou a falar com [nome do contacto]?" },
      { title: "Motivo", text: "Estou a ligar porque é responsável pelos recursos humanos na [empresa do contacto]. Trabalhamos com empresas portuguesas da sua dimensão em [serviço]. Tem dois minutos?" },
      { title: "Origem dos dados", text: "Obtivemos o seu contacto profissional através da Apollo.io, um fornecedor de informação sobre empresas. Posso enviar-lhe a informação completa sobre o tratamento dos seus dados para o seu email profissional." },
      { title: "Direito de oposição", text: "Tem o direito de se opor, a qualquer momento, a ser contactado para fins comerciais. Se não quiser voltar a ser contactado, diga-me agora e registo isso de imediato." },
      { title: "Perguntas", text: "Como é que a sua equipa trata hoje de [tema]? O que gostariam de melhorar?" },
      { title: "Próximo passo", text: "Faz sentido marcarmos uma reunião curta? Posso também enviar-lhe informação para o seu email profissional." },
      { title: "Se não quiser ser contactado", text: "Compreendo perfeitamente. Vou registar já que não voltaremos a contactá-lo. Obrigado pelo seu tempo. (Carregue em \"Não contactar\".)" },
      { title: "Fecho", text: "Muito obrigado pelo seu tempo. Bom resto de dia." },
    ],
  },
};

const DATE = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Lisbon" });
const DATE_TIME = new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
export const ptDate = (ms: number | null | undefined) => (typeof ms === "number" && ms > 0 ? DATE.format(new Date(ms)) : PT.never);
export const ptDateTime = (ms: number | null | undefined) => (typeof ms === "number" && ms > 0 ? DATE_TIME.format(new Date(ms)) : PT.never);
export const ptRefusal = (code: string | null | undefined) => (code && PT.refusals[code]) || PT.refusals.default;
