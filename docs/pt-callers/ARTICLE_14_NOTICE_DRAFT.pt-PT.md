# RASCUNHO PARA REVISÃO JURÍDICA — NÃO PUBLICAR

Informação prestada ao abrigo do artigo 14.º do RGPD
(dados pessoais não recolhidos junto do titular)

**Responsável pelo tratamento:** W.O.P Wines of Portugal, Unipessoal Lda., NIPC 519629914, com sede em Lisboa (morada completa a confirmar). Contacto: [endereço de e-mail de privacidade a definir].

**Encarregado de proteção de dados:** [a confirmar se aplicável].

**Finalidade do tratamento:** contacto comercial por telefone com profissionais da área de Recursos Humanos, para apresentar uma proposta de cabazes de vinho português para oferta empresarial (por exemplo, oferta de Natal a colaboradores).

**Fundamento jurídico:** [a definir pelo advogado: interesse legítimo (artigo 6.º, n.º 1, alínea f), do RGPD) ou consentimento, tendo em conta a Lei n.º 41/2004 (artigos 13.º-A e 13.º-B) e as orientações da CNPD].

**Categorias de dados:** nome, cargo, empresa, dimensão da empresa, localidade, número de telefone profissional, identificador na plataforma Apollo.io, data de recolha e histórico de contactos (data, resultado da chamada). Não são tratados endereços de e-mail pessoais nem dados sensíveis. As chamadas não são gravadas.

**Origem dos dados:** a plataforma Apollo.io (Apollo.io, Inc.), a partir de informação profissional que esta disponibiliza.

**Destinatários:** os colaboradores da nossa equipa comercial e os subcontratantes que prestam serviços técnicos: o fornecedor de telefonia (Telnyx), o alojamento da aplicação e a base de dados. [Confirmar lista e acordos de subcontratação.]

**Transferências internacionais:** a Apollo.io e a Telnyx estão sediadas nos Estados Unidos da América. [Indicar o mecanismo de transferência aplicável: decisão de adequação / EU-US Data Privacy Framework / cláusulas contratuais-tipo.]

**Prazo de conservação:** 90 dias a contar da recolha, salvo se manifestar interesse na proposta. O registo da sua oposição é conservado de forma permanente e mínima (apenas um código derivado do número e do identificador), para garantir que não volta a ser contactado/a.

**Os seus direitos:** acesso, retificação, apagamento, limitação, portabilidade (quando aplicável) e reclamação junto da CNPD (www.cnpd.pt).

**Direito de oposição (artigo 21.º do RGPD):** pode opor-se a qualquer momento a ser contactado/a para fins de marketing, durante a chamada ou através de [contacto]. A oposição é registada de imediato e não voltaremos a contactá-lo/a.

**Momento da informação:** esta informação é prestada no primeiro contacto (a chamada indica a origem dos dados e o direito de oposição) e fica disponível em [página do sítio a definir].

---

*Notas para o advogado (não fazem parte do texto final):*
- O guião da chamada está em `src/lib/pt-callers/strings-pt.ts` (`PT.script`).
- Pontos a decidir:
  - fundamento jurídico;
  - classificação dos números como "linha profissional" (assinante pessoa coletiva) vs pessoal;
  - consulta da lista de oposição da DGC;
  - horários e número de tentativas;
  - texto e momento desta informação.
- Sem aprovação escrita, a aplicação não faz chamadas nem obtém dados reais (`PT_CALLERS_LEGAL_APPROVED`).
