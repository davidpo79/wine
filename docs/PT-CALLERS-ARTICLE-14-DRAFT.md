# RASCUNHO PARA REVISÃO JURÍDICA. NÃO PUBLICAR.

> **Status: DRAFT for the Portuguese lawyer's review (Portugal HR callers, 19/10/2026).**
> Not published anywhere, not linked from any page, not sent to anyone.
> Every bracketed item is a fact David or the lawyer must supply or confirm.
> Written in European Portuguese (pt-PT). An English summary for David is at the end.
> A notice is not a permission to call: it does not make an otherwise unlawful contact lawful.

---

## Informação sobre o tratamento dos seus dados pessoais

**(Artigo 14.º do Regulamento Geral sobre a Proteção de Dados, RGPD: dados não recolhidos junto do titular)**

### 1. Quem é o responsável pelo tratamento

[Denominação social da empresa], com sede em [morada], NIPC [número], contactável através de [endereço de correio eletrónico] e [telefone].

[Encarregado da proteção de dados, se designado: nome e contacto.]

### 2. Que dados tratamos

Apenas dados de contacto profissional:

- nome e apelido;
- cargo ou função;
- empresa onde trabalha, dimensão aproximada da empresa e cidade;
- número de telefone profissional;
- endereço de correio eletrónico profissional;
- o identificador do registo no fornecedor (Apollo.io), a origem e a data de obtenção;
- o estado do contacto e notas curtas sobre o seguimento comercial.

Não tratamos endereços de correio eletrónico pessoais, perfis completos, dados sensíveis nem notas de natureza pessoal. As chamadas não são gravadas nem transcritas.

### 3. De onde vêm os dados

Os dados foram obtidos através da Apollo.io ([denominação e sede da entidade, a confirmar]), um fornecedor de informação comercial sobre empresas e profissionais. Registamos a origem e a data de obtenção de cada contacto.

### 4. Para que fins e com que fundamento

**Finalidade:** contactá-lo(a) por telefone, enquanto responsável de recursos humanos da sua empresa, para apresentar [descrição do serviço] e saber se tem interesse.

**Fundamento jurídico:** [a confirmar pelo advogado: por exemplo, interesse legítimo, artigo 6.º, n.º 1, alínea f), do RGPD, com a respetiva avaliação de ponderação documentada; a conformidade com a Lei n.º 41/2004, em especial os artigos 13.º-A e 13.º-B, incluindo a distinção entre assinantes pessoas singulares e pessoas coletivas e a lista nacional de oposição; e as orientações da CNPD sobre marketing direto por telefone, que exigem consentimento prévio expresso quando não existe relação anterior com pessoas singulares].

### 5. Quem recebe os dados

- [Fornecedor de alojamento da aplicação, a confirmar];
- Telnyx ([entidade e sede, a confirmar]), fornecedor do serviço telefónico usado para efetuar a chamada;
- Apollo.io, enquanto fonte dos dados.

Não vendemos nem cedemos os seus dados a terceiros para fins próprios destes.

### 6. Transferências para fora do Espaço Económico Europeu

[A confirmar: a Apollo.io e a Telnyx podem tratar dados nos Estados Unidos da América. Indicar o mecanismo aplicável, por exemplo a decisão de adequação do Quadro de Privacidade de Dados UE-EUA, se a entidade estiver certificada, ou cláusulas contratuais-tipo, e como obter uma cópia.]

### 7. Durante quanto tempo guardamos os dados

Até 90 dias após o último contacto ou atividade relativa ao seu registo [prazo a confirmar], seguido de apagamento ou revisão. Se nos pedir para não voltar a contactá-lo(a), conservamos apenas um identificador técnico protegido (não legível) na nossa lista de oposição, com a data e o âmbito, para garantir que não voltamos a contactá-lo(a).

### 8. Direito de oposição (artigo 21.º do RGPD)

**Tem o direito de se opor, a qualquer momento e sem custos, ao tratamento dos seus dados para fins de comercialização direta.** Basta dizê-lo durante a chamada ou escrever para [endereço de correio eletrónico]. A partir desse momento deixamos de tratar os seus dados para esse fim e não voltamos a contactá-lo(a).

### 9. Os seus outros direitos

Pode também, gratuitamente:

- pedir acesso aos seus dados, a sua retificação ou o seu apagamento;
- pedir a limitação do tratamento;
- apresentar reclamação à Comissão Nacional de Proteção de Dados (CNPD), www.cnpd.pt.

### 10. Quando lhe damos esta informação

Num prazo razoável após a obtenção dos dados e, no máximo, no prazo de um mês, ou o mais tardar na primeira comunicação consigo (artigo 14.º, n.º 3, do RGPD). O direito de oposição é-lhe explicado de forma explícita e separada, o mais tardar no primeiro contacto. [A confirmar pelo advogado: o meio, por exemplo leitura de um resumo no início da chamada e envio desta informação por correio eletrónico profissional.]

---

## English summary for David (not part of the notice)

- **What this is:** the notice GDPR Article 14 requires when data comes from a third party (here Apollo.io), with the Article 21 right to object explained explicitly and separately (section 8), as the spec asks. Draft only, for the lawyer.
- **What the lawyer must fill or confirm:** the legal entity; the legal basis; how Law 41/2004 (Articles 13-A, 13-B) and the CNPD guidance apply to each number (a corporate subscriber versus a person; whether prior express consent is needed); the national opposition list (DGC) and how often it is refreshed; calling hours and attempts; the script; the recipients and transfer mechanisms; the retention period; how and when this notice is delivered.
- **What the code already does to match it:** business contact data only, personal emails never requested; source and fetch date on every lead; no recording or transcription; opt-out on every row and in the side panel, immediate and permanent (a keyed-hash block list nothing deletes); a lead is dialable only after an Admin records it as a corporate line with a legal basis; retention field of 90 days after last activity (the deletion job is NOT enabled); an access log of who viewed and who called each lead.
