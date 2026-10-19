# CAD-R2-021 — pacote para análise administrativa e jurídica

**MINUTA — TODAS AS APROVAÇÕES PENDENTES.** Preparação em 19/10/2026, para encaminhamento humano. Não é parecer, termo aprovado, designação de encarregado ou autorização de processamento. Não foi enviada comunicação a terceiros pelo agente.

## 1. Objeto e distinção de finalidades

| Tratamento | Necessidade a demonstrar | Decisão |
| --- | --- | --- |
| Cadastro operacional de Cliente | Quais campos são necessários ao atendimento e às obrigações efetivamente aplicáveis? Evitar exigir todos os campos opcionais. | Base jurídica/retentiva do cadastro: PENDENTE de formalização pela administração/jurídico, conforme 020. |
| Capturar voz e produzir transcrição para preencher campos | Justificar por que captar fala é adequado e proporcional frente à alternativa manual; listar pessoas e dados incidentais. | Finalidade específica e fundamento de voz: PENDENTES. Uso anterior do cadastro não autoriza voz. |
| Telemetria, suporte e eventual tratamento do fornecedor | Separar métricas técnicas de conteúdo e justificar cada finalidade adicional. | Não transmitir bruto na telemetria; fornecedores/uso adicional: PENDENTES. |

A assessoria deverá avaliar as hipóteses pertinentes dos arts. 7º e 11 da LGPD, necessidade, transparência, direitos e segurança. Consentimento, execução contratual e legítimo interesse são hipóteses a analisar, não fundamentos selecionados. Se consentimento for cogitado, definir informação, liberdade, prova e revogação; o checkbox de revisão do formulário não o registra. Se execução contratual for cogitada, demonstrar necessidade do tratamento específico, não mera conveniência. [LGPD, arts. 5º–11, 18, 37–39 e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm).

Se legítimo interesse for cogitado, exigir análise documentada de finalidade, necessidade, legítima expectativa, balanceamento e salvaguardas; essa hipótese não alcança dados pessoais sensíveis. [Guia da ANPD sobre legítimo interesse](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_hipoteses_legais_tratamento_de_dados_pessoais_legitimo_interesse).

Áudio pode identificar atendente/cliente e carregar saúde, religião, dados de terceiros ou documentos ditados. Voz não será usada para identificação biométrica, autenticação, perfilamento ou criação de voiceprints nesta proposta. A qualificação de conteúdo sensível e de eventual dado biométrico requer análise contextual; não classificar automaticamente toda fala como sensível nem presumir ausência de dados sensíveis. Prever tratamento de menores/representantes e recusa da captura quando o cenário não estiver abrangido pela autorização.

## 2. Matriz de agentes — hipóteses sujeitas à operação real

As funções dependem de quem decide finalidades/meios e de instruções/contratos efetivos, não apenas do nome no contrato. [ANPD: guia dos agentes de tratamento](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-para-definicoes-dos-agentes-de-tratamento-de-dados-pessoais-e-do-encarregado).

| Participante | Papel a confirmar | Obrigações/entregáveis propostos | Identificação/aprovação |
| --- | --- | --- | --- |
| Pessoa jurídica que opera a loja | Possível controlador do cadastro/voz; avaliar estruturas multiempresa. | Finalidades, base, instruções, atendimento ao titular, retenção, aprovações e suspensão. | Razão social/CNPJ/responsável: PENDENTES. |
| Prestador OmniGestão/hosting | Possível operador para finalidades instruídas; avaliar eventuais finalidades próprias separadamente. | Segregação, segurança, suporte, contratos e inventário real de fornecedores. | Qualificação jurídica/contrato: PENDENTES. |
| Atendente | Pessoa autorizada sob instruções; não presumir controlador/operador autônomo por usar o sistema. Também pode ser titular de sua voz. | Iniciar/parar conscientemente, ambiente adequado, revisão, não captar terceiros/sensíveis sem cobertura. | Procedimento, treinamento e informação ao trabalhador: PENDENTES. |
| Cliente e pessoas próximas | Titulares, inclusive terceiros captados acidentalmente. | Informação acessível, alternativa manual, canal e procedimento de direitos. | Público, menores/representantes e cenário permitido: PENDENTES. |
| Navegador/SO/pacotes | Software local e possível cadeia de serviços; qualificação depende da arquitetura selecionada. | Provar modo local ou identificar os destinatários remotos/telemetria. | Tecnologia/versões e contratos: PENDENTES. |
| Fornecedor de reconhecimento | Possível operador/suboperador; finalidades próprias precisam ser examinadas. | DPA, países, subcontratados, instruções, segurança, retenção, exclusão e incidentes. | NÃO SELECIONADO; PENDENTE. |
| Suboperadores e suporte | Hipóteses detalhadas no comparativo técnico. | Lista aplicável, países, acessos, notificações de mudança e garantias contratuais. | PENDENTES. |
| Responsável jurídico e canal de privacidade | Assessoria/referência de governança; encarregado depende de designação válida. | Revisar riscos, fundamento, avisos, direitos e transferência. | Nome, canal oficial e mandato: PENDENTES. |

## 3. Minimização e retenção — evidência e proposta separadas

| Camada | Comprovado no caminho atual | Proposta para voz / pendências |
| --- | --- | --- |
| Áudio | Não há construção/início de motor, getUserMedia ou upload de áudio por Clientes. | Não armazenar áudio na aplicação. Proibir gravação/attachments/URLs de áudio; validar futura implementação. |
| Descrição manual/sugestão | Estado React temporário; descrição enviada à Action da própria aplicação; parser sem fornecedor externo. Descarte, fechamento e troca de loja invalidam respostas. | Transcrição temporária, limite de sessão/texto, limpar em cancelamento, erro, troca de contexto e fim. Nenhum registro bruto em storage, cache, URL, auditoria ou telemetria. |
| Campos revisados | DTO allowlist; confirmação explícita; ClientWriteService preserva identidade, metadados e histórico. | Persistir somente os campos corrigidos/necessários; guardar bruto não faz parte da proposta. Retenção do cadastro/histórico e backups continua pendente no 020. |
| Runtime/infraestrutura | Ausência de código aplicativo de persistência da captura não é garantia de apagamento físico de RAM nem de todos os logs externos. | Inventariar proxies, APM, session replay, crash dumps, navegadores geridos e backups; configurar/redigir conteúdo antes de liberar. |
| Reconhecimento externo | Nenhum fornecedor integrado ao caminho de Clientes. | Obter evidência específica de retenção, treinamento, suporte, exclusão e backups; não declarar retenção zero com base em memória efêmera da UI. |

O teste de storage vazio cobre o harness e o código auditado; não audita todo o sistema operacional, extensões ou fornecedores. Não importar dados reais para evidências de teste. Nomes/documentos de teste são sintéticos e usados apenas como vetores dos algoritmos.

## 4. Segurança e riscos que a decisão deverá cobrir

| Risco | Medida/proposta verificável | Situação |
| --- | --- | --- |
| Remoto silencioso ou API genérica confundida com local | Exigir API/idioma/pacote local e proibir fallback; alternativa manual. | Contrato de arquitetura preparado; integração NÃO implementada. |
| Escuta involuntária de atendente, cliente ou pessoas próximas | Uma ação explícita para iniciar, indicador persistente de escuta, botão parar/cancelar acessível, orientação de ambiente reservado e alternativa manual. | PENDENTE para voz; atual não escuta. |
| Captura prolongada ou eventos tardios | Proposta de 30 s/2000 caracteres; abort/timeout, uma sessão; descartar eventos de loja/modal/sessão anterior. | Texto e gate testados; áudio futuro PENDENTE. |
| Dados sensíveis/terceiros/minores | Não solicitar relatos livres desnecessários; interromper/desconsiderar bruto, seguir procedimento aprovado para incidentes e dados fora do escopo. | Procedimento e autorização PENDENTES. |
| Isolamento/autoridade | Sessão e membership da loja no servidor; origem não-text rejeitada antes do parser; payload não define ator/loja/financeiro. | Implementado e coberto por regressões. |
| Erro de reconhecimento/deduplicação | Correção humana, confirmação e submit separados; writer e UNIQUE canônicos; nenhum merge automático. | Texto publicado preservado; validação de reconhecimento PENDENTE. |
| Exposição em métricas/erros | Códigos constantes, sem áudio, transcript, documento, telefone ou corpo de requisição em logs/analytics. | Aplicação auditada; contratos/configuração de infraestrutura PENDENTES. |
| Autorização confundida com permissão do navegador | Decisão administrativa/jurídica fora do app; gate fechado em UI/servidor; permissão ou checkbox não autoriza liberação. | Implementado. |

## 5. Minutas de transparência — não publicadas como termos

### Aviso ao atendente, se e somente se houver futura aprovação

> Você pode preencher manualmente. Se a captura de voz estiver autorizada para esta loja e dispositivo, inicie somente quando todos souberem da captura e o ambiente estiver adequado. Fale apenas os dados necessários ao cadastro. A escuta será indicada e poderá ser interrompida ou cancelada. Revise e corrija os campos antes de confirmar o cadastro. Não dite dados sensíveis nem informações de terceiros fora do procedimento autorizado.

Antes de usar essa minuta, completar e revisar a modalidade aprovada, o nome do fornecedor, o processamento local/remoto, países, retenção externa, limite efetivo, procedimento de descarte e informação ao trabalhador. Não mostrar uma promessa de funcionamento ainda não implementada.

### Informação ao titular — campos obrigatórios de revisão

> [CONTROLADOR — PENDENTE] pretende usar captura e transcrição de voz para auxiliar o preenchimento do seu cadastro em [ESCOPO — PENDENTE]. A alternativa manual permanece disponível. O processamento será feito por [TECNOLOGIA E DESTINATÁRIOS — PENDENTES], em [PAÍSES — PENDENTES], com [REGRAS DE RETENÇÃO E DESCARTE — PENDENTES]. Serão salvos os campos revisados necessários a [FINALIDADE E BASE JURÍDICA — PENDENTES]. Para informações e direitos, use [CANAL OFICIAL E PROCEDIMENTO — PENDENTES].

A forma de informação e eventual manifestação de vontade dependerá da análise jurídica. Preencher campos não constitui aprovação; não publicar a minuta com placeholders nem convertê-la em aceite geral.

## 6. Transferência internacional e diligência de fornecedor

Se houver destinatário/acesso no exterior, registrar exportador/importador, categorias de dados/pessoas, finalidade, frequência, países, subcontratados e transferências posteriores. A avaliação jurídica deverá indicar o mecanismo aplicável da LGPD e as garantias pertinentes; localização de datacenter e um DPA estrangeiro não substituem essa decisão. A Resolução CD/ANPD 19/2024 contém o regulamento e cláusulas padrão; usar o texto vigente, inclusive retificações, e avaliar sua incorporação quando pertinente. Não inventar instrumento assinado nem presumir que SCC europeia resolve o mecanismo brasileiro. [ANPD: Resolução 19/2024](https://www.gov.br/anpd/pt-br/acesso-a-informacao/institucional/atos-normativos/regulamentacoes_anpd/resolucao-cd-anpd-no-19-de-23-de-agosto-de-2024), [ANPD: transferências internacionais](https://www.gov.br/anpd/pt-br/assuntos/assuntos-internacionais/transferencia-internacional-de-dados).

O comparativo [VOICE-ARCHITECTURE.md](VOICE-ARCHITECTURE.md) registra fontes e países conhecidos dos candidatos. A administração deve obter proposta, contrato/DPA aplicável à modalidade e região, lista de suboperadores, política de retenção e treinamento, processo de exclusão, acessos de suporte e evidências de segurança. Todos esses documentos do contrato real continuam **PENDENTES**. Não enviar uma amostra de áudio real para obter respostas.

## 7. Registro da decisão — manter todos os campos de aprovação pendentes

| Campo | Responsável pela informação/decisão | Estado |
| --- | --- | --- |
| Responsável administrativo, cargo e entidade | Administração | PENDENTE |
| Responsável jurídico e referência do parecer/validação | Assessoria jurídica | PENDENTE |
| Referência documental da aprovação, versão, data e validade/revisão | Administração + jurídico | PENDENTE |
| Finalidade, titulares, campos e base jurídica por tratamento | Administração + jurídico | PENDENTE |
| Lojas/empresas, perfis autorizados e situações excluídas | Administração | PENDENTE |
| Tecnologia, fornecedor, modalidade, endpoints/regiões e suboperadores | Administração + jurídico + técnica | PENDENTE |
| Navegadores, SO, versões, pt-BR e dispositivos homologados | Técnica, após autorização de testes apropriada | PENDENTE |
| Retenção, treinamento, descarte, backups, suporte e logs | Administração + jurídico + operações | PENDENTE |
| Mecanismo de transferência internacional e documentos assinados, se pertinente | Jurídico + administração | PENDENTE |
| Avisos aprovados, canal de privacidade e procedimento de direitos | Administração + jurídico | PENDENTE |
| Limites de duração/caracteres, condições de segurança e piloto | Administração + jurídico + técnica | PENDENTE |
| Responsável, contato, gatilhos e prazo de suspensão | Administração + operações | PENDENTE |
| Aprovação administrativa para ativar | Administração | **PENDENTE — NÃO CONCEDIDA** |
| Aprovação jurídica para ativar | Jurídico | **PENDENTE — NÃO CONCEDIDA** |

## 8. Liberação futura e suspensão

1. A administração encaminha este pacote e as lacunas à assessoria, identifica responsáveis reais e registra a decisão documental. A revisão técnica/CI desta PR não cumpre esse ato.
2. Só depois de decisão aplicável poderá haver implementação separada, revisão e piloto expressamente autorizado. A aprovação, sozinha, não torna seguro mudar apenas `enabled`; ainda faltam motor, lifecycle, limites, compatibilidade e controles aprovados.
3. Prever suspensão por revogação/expiração da autorização, mudança de fornecedor/país/retentiva, incidente, falha de isolamento, perda de suporte local ou descumprimento dos avisos. Responsável e canal de acionamento: **PENDENTES**.
4. O procedimento técnico futuro deve bloquear novos inícios em UI e servidor, encerrar sessões/callbacks ativos e descartar bruto sem apagar campos/históricos sujeitos a retenção. Reabilitar exige nova verificação da decisão e gates técnicos. No estado atual, o gate já está fechado e não há sessão de áudio a encerrar.
5. Solicitações de direitos seguem a governança 020; registro interno não significa cumprimento. Não exportar/eliminar dados ou alterar histórico fiscal/financeiro para atender uma solicitação sem procedimento específico.

**Próximo ato humano indispensável:** decisão documentada da administração e assessoria jurídica, com identificação de responsáveis, fundamento, tecnologia/escopo/condições e tratamento das lacunas acima. Até lá: `VOICE_CAPTURE=DISABLED`, `LEGAL_APPROVAL=PENDING`, `CAD_R2_021_STATUS=PARTIAL_BLOCKED`.
