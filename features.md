# FEATURES.md — Roadmap priorizado do Editor (OpenCut Classic / ORUME)

> **Estado:** planejamento técnico; as funcionalidades novas listadas aqui não são implementadas apenas por atualizar este documento.
> **Ordem aprovada em 13/11/2026:** F02 → F03 → F04 → F07 → F05 → F09 → F01 → F08. **F10 (continuar projeto PC ↔ celular)** entra somente depois dessas oito fases como evolução futura de baixa prioridade. Sounds (F06) continua adiado.
> **A numeração Fxx identifica funcionalidades; NÃO indica prioridade.** A seção 10 é a referência obrigatória de fases e dependências.
>
> **Criado em:** 2026-11-10
>
> **Repositório:** https://github.com/GustavoABA/Editor
>
> **Base consultada:** branch main na data indicada. O projeto já inclui Next.js/React, Rust/WASM, processamento e exportação local, MCP, Auto Cut, Ollama, n8n, Stickers, Sounds e controles de proporção de tela. O roadmap propõe **evoluir e corrigir** esses recursos, sem refazê-los desnecessariamente.

## 0. Objetivo, princípios e escopo

### Ordem obrigatória de entrega (13/11/2026)

| Fase | ID | Entrega determinada pelo proprietário |
|---|---|---|
| **1** | **F02** | Normalizar o áudio de todos os clipes e vídeos de maneira uniforme, com LUFS, controle de picos, prévia e exportação |
| **2** | **F03** | NVIDIA e outras IAs por API/token, fallback, **editor de código Node.js completo, executável e salvável**, inclusive scripts com axios/imports |
| **3** | **F04** | HyperFrames conectado à IA, com composição orientada/sincronizada por **trilha de áudio**, exportação horizontal e vertical |
| **4** | **F07** | Aba **Links e mídias** para imagens, GIFs, vídeos, YouTube, Twitch e lives, distinguindo prévia de importação/exportação |
| **5** | **F05** | **Corrigir apenas o scroll dos Stickers**; manter visual, categorias, pesquisa e catálogo atuais |
| **6** | **F09** | MCP externo **exclusivamente via ngrok**, ativação na UI, URLs LAN/remota, autenticação |
| **7 — penúltima** | **F01** | Proteção de camada/clipe e integração com as funções já implementadas |
| **8 — última do ciclo prioritário** | **F08** | Conversão inteligente de proporção/reposicionamento |
| **9 — futuro, sem antecipar** | **F10** | **Salvar projeto no servidor sem renderizar e continuar edição no celular**, via Ctrl+S no PC, salvamento completo de timeline e mídias originais, reabertura autenticada em outro dispositivo | 
| **Adiado, sem fase** | **F06** | **Sounds: não mexer agora**, sem ajustes ou expansão até nova decisão |

**Regra de dependências:** F01 **não é pré-requisito** para F02, F03, F04, F07, F05 ou F09. Até a fase 7, usar seleção de escopo, autorização, prévia, confirmação e Undo/Redo; após implementar F01, adaptar essas funções ao bloqueio. Não adiantar F08 nem F06 para antecipar melhorias opcionais. **F10 é fase futura, subordinada à conclusão das oito prioridades atuais; não bloqueia nenhuma delas.**


Transformar o Editor em um ambiente de edição de vídeo com **operações globais seguras**, automações por IA, animações HTML/HyperFrames, importação de mídias autorizadas, bibliotecas navegáveis e adaptação inteligente de formatos para vídeos horizontais e verticais. **Futuramente (F10)**, oferecer continuidade do mesmo projeto editável entre PC e celular com armazenamento no servidor e sem render antecipado.

Princípios obrigatórios:

1. **Edição não destrutiva:** preservar arquivos de origem e registrar as transformações como estado reversível; oferecer visualização antes de aplicar e Undo/Redo.
2. **A proteção de camadas será implementada somente na fase 7.** Antes disso, operações globais usam escopo/seleção explícitos, validação e reversibilidade; após F01, passam a respeitar bloqueios também em IA, MCP, Auto Cut, áudio e HyperFrames.
3. **Preview = exportação:** não declarar um elemento exportável apenas porque ele aparece no navegador; o render deve produzir o mesmo resultado ou explicar por que não é possível.
4. **Uma única representação de projeto/timeline:** evitar divergência entre preview web, exportação no servidor, Rust/WASM e comandos MCP.
5. **IA assistiva e verificável:** roteador multi-provedor, planos validados, checkpoints, confirmação de alterações e comportamento determinístico.
6. **Segurança, direitos e custos:** credenciais só no backend, permitir apenas fontes autorizadas, proteger acesso de rede, expor custos/limites dos provedores e não presumir acesso gratuito ilimitado.
7. **Acessibilidade e performance:** painéis com rolagem real, busca funcional, navegação por teclado, listas grandes virtualizadas e telas responsivas.
8. **Compatibilidade:** preservar projetos anteriores, carregar corretamente projetos com novos campos e suportar o self-host Docker/LAN.

### Estado atual identificado no código (não confundir com implementação nova)

| Área | Já existe no código | Lacuna proposta |
|---|---|---|
| Áudio | apps/web/src/media/audio-mastering.ts: limitador de picos e tratamento de buffer | **Fase 1:** normalização LUFS de clipes/faixas/mix, sem depender de F01 |
| Stickers | Busca, abas All/Flags/Shapes e contêiner overflow-y-auto | **Fase 5:** corrigir SOMENTE o scroll; NÃO alterar categoria, catálogo ou visual |
| Sounds | Pesquisa, Freesound, ScrollArea, busca paginada e favoritos | **F06 adiado:** manter o recurso inalterado até nova decisão |
| Automação | Ollama, Auto Cut e conexões n8n/MCP | **Fase 2:** NVIDIA preferida, IAs por token e personalizada JS/Node.js; **fase 3:** HyperFrames com áudio |
| MCP remoto | Endpoint Streamable HTTP/LAN na porta 3101 e bearer token | F09: túnel ngrok liga/desliga, URL MCP remota, credenciais configuradas na UI e acesso seguro |
| Proporção | Project info/Settings permite trocar o tamanho do canvas | Reposicionar inteligentemente **todos os elementos editáveis** da composição |
| HyperFrames | Integração dedicada não confirmada na inspeção anterior; revisar e reaproveitar a base existente antes de codificar | **Fase 3:** composição com IA, sincronização por áudio, exportação horizontal/vertical |
| Importação por link | Não foi localizada aba específica de Links na inspeção | Importadores autorizados, embeddings e captura exportável quando tecnicamente possível |

> **Não implementado** significa que a integração nova não foi identificada na inspeção; sempre pesquisar novamente o código antes de abrir PR. **Problema reportado** (como ausência de scroll na prática) não significa que o código correspondente não exista.

---

## F02 — Normalizador global de áudio por loudness (FASE 1 — máxima prioridade)

### UX

- Novo comando **“Normalizar áudio”** no grupo de operações gerais e na aba IA & Automação.
- **Padrão: todo o projeto** (clipes/vídeos/faixas de áudio), buscando loudness percebido consistente entre origens diferentes. Permitir normalização por clipe, por faixa ou pelo mix, com opção de incluir/excluir manualmente clipes e de normalizar apenas a seleção. **Não aguardar F01**: proteção automática de faixa/clipe será integrada na fase 7.
- Perfis iniciais configuráveis (valores sugeridos, não obrigação de plataforma):
  - **Voz/vídeo online:** alvo inicial -16 LUFS integrados, true peak máximo -1,5 dBTP;
  - **Podcast/voz estéreo:** alvo inicial -16 LUFS; mono opcional -19 LUFS;
  - **Personalizado:** LUFS integrado, limite de true peak, loudness range e método.
- Exibir análise **antes/depois**: LUFS integrados, true peak, ganho previsto, faixas incluídas/protegidas e possibilidade de clipping.
- Medir e ajustar **por clipe, por faixa ou pelo mix**; oferecer conferência do mix final. Normalização por elemento isolado não garante volume uniforme quando há várias trilhas sobrepostas.
- Manter música e voz com balanço coerente: prévia A/B, controle de volume, opção futura de ducking de trilha; não comprimir dinâmicas sem avisar.
- Preservar sincronização, fade, mixagem e keyframes de volume sempre que possível.

**Meta de qualidade:** tornar fala e vídeos de origens diferentes perceptualmente consistentes, com limite de true peak e comparação antes/depois. Mesmo LUFS não elimina ruído ou timbres distintos; não prometer 'perfeição' automática sem tratamento adicional.

### Implementação proposta

1. Reaproveitar o pipeline atual de áudio. **audio-mastering.ts implementa limiter/clamping de picos, não medição de LUFS**.
2. Utilizar análise de loudness EBU R128, com opção de cálculo em **duas passagens** via FFmpeg/loudnorm no serviço de render, conferindo suporte real no ambiente Docker.
3. Salvar parâmetros de normalização como efeito/ganho não destrutivo por faixa ou clipe, sem regravar o vídeo original.
4. Definir ponto de aplicação na cadeia: áudio original -> volume/keyframes e efeitos por faixa -> normalização conforme escopo -> mix -> limiter/true peak final (ordem exata validada em testes).
5. Compartilhar as mesmas configurações no **preview** e no **render final**; se a implementação de preview diferir do render, indicar e medir o desvio.
6. Casos especiais: áudio sem sinal, fontes corrompidas, vídeo com múltiplos canais, silêncio, voz muito baixa, arquivos enormes, troca de sample rate.
7. Implementar controles e operação desde a fase 1, com escopo, confirmação e Undo/Redo. Expor às integrações compatíveis quando estáveis; só adicionar a validação de F01 na fase 7, sem bloquear o normalizador.

### Critérios de aceitação

- [ ] Um botão executa a análise e oferece aplicar/cancelar.
- [ ] Clipes/faixas excluídos manualmente do escopo não são alterados; quando F01 existir (fase 7), respeitar também a proteção automática.
- [ ] Resultado respeita alvo e limite de pico dentro de tolerância definida nos testes.
- [ ] Preview e export são coerentes; nenhuma alteração de duração/sincronização.
- [ ] Undo/Redo, persistência e reabertura funcionam.
- [ ] Testes com diálogo, música, silêncio, clipes concatenados e faixas sobrepostas.

**Áreas iniciais:** apps/web/src/media/audio-mastering.ts, apps/web/src/core/managers/audio-manager.ts, apps/web/src/timeline/audio-state.ts, apps/web/src/server-render, apps/web/src/automation.

**Referência técnica:** https://ffmpeg.org/ffmpeg-filters.html#loudnorm

---

## F03 — Settings > IA: provedores, modelos e roteamento com fallback (FASE 2)

### Localização e aparência

- Na **engrenagem/Settings**, adicionar área **IA**, próxima às configurações de integração/MCP. Usar seção dedicada, sem ocultar o MCP existente.
- Listar provedores em cartões configuráveis e ordenáveis:
  - **Ollama (local)**;
  - **NVIDIA NIM / API Catalog**: incluir obrigatoriamente presets individuais **Nemotron 3 Nano Omni**, **Kimi K3** e **Gemma 4 31B**, cada qual com seleção, status, configuração de API key herdada da conta NVIDIA, teste de chamada e botão **Gerar/copiar código Node.js**;
  - **OpenAI API**;
  - **Anthropic (Claude API)**;
  - **DeepSeek API**;
  - **Moonshot AI / Kimi API (Kimi K3.1 Pro)**: provedor oficial separado da NVIDIA, usando token próprio;
  - **IA personalizada (JavaScript/Node.js)**: além de configurar URL/token, permitir **colar/escrever um arquivo JavaScript/Node.js completo, executá-lo de verdade num runner isolado**, visualizar retorno/erros, salvar como provedor e selecioná-lo nas automações HyperFrames. Compatível com `import axios from 'axios'`, `async function main()`, `axios.post(...)`, JSON e streaming mediante runner configurado.
- **Outros** por adaptador que atenda contrato do roteador.
- Cada item deve oferecer: habilitar/desabilitar, modelo, status de conexão, configuração de chave no servidor, teste de conexão, prioridade de fallback, capacidade suportada, limite de custo/tokens e indicação se o serviço é local ou em nuvem.
- Modelo padrão **por tipo de tarefa** (planejamento de edição, entendimento de texto, visão/análise visual, geração de composição HyperFrames, revisão de resultados); não presumir que todos suportam imagens/áudio.
- Modos: automático por prioridade/capacidade, preferir modelos locais, menor custo e manual. **NVIDIA deve ser o provedor preferido por padrão**, se autenticação, capacidade e quota estiverem válidas; os demais e as IAs personalizadas podem ser ordenados pelo usuário. **Kimi K3.1 Pro é priorizado para análise visual, programação e composição HyperFrames quando houver API funcional**, mas sua entrada por NVIDIA ou Moonshot é configurada **por provedor**, sem supor que chaves de um funcionem no outro.
- Mostrar provedor efetivamente utilizado e eventos de troca (“NVIDIA indisponível; retomado no Ollama a partir do checkpoint 3”).
- Sem cobrança surpresa: sinalizar quando um modelo pode consumir créditos ou ter cobrança; permitir exigir confirmação para uso pago.

### Acesso às credenciais na interface (obrigatório, sem editar arquivos manualmente)

- **Todas as credenciais necessárias a recursos opcionais devem ter campo próprio na interface**: NVIDIA NIM, **Moonshot (MOONSHOT_API_KEY para Kimi K3.1 Pro)**, OpenAI API (ChatGPT não equivale automaticamente a créditos da API), Anthropic/Claude, DeepSeek, ngrok quando aplicável e provedores futuros. Campos devem trazer o nome exato do segredo, link para documentação oficial, opção **Salvar / Testar / Alterar / Remover**, status e mensagem de erro útil.
- Para **NVIDIA**, apresentar um campo **NVIDIA_API_KEY** compartilhado pelos três modelos (e demais modelos da mesma conta), com opção de usar credencial/perfil alternativo por preset, sem exigir três chaves diferentes. Todos os três modelos devem aparecer na interface mesmo quando a API de um estiver indisponível; nesse caso desabilitar apenas sua chamada e mostrar motivo, nunca ocultar o preset.
- Para Ollama, oferecer **URL do servidor e modelo**, com credenciais somente se o endpoint configurado realmente exigir autenticação. Não presumir API key obrigatória para Ollama local.
- O campo pode aparecer em **Settings > IA** e, por atalho contextual, em **HyperFrames > Gerar com IA**. Os dois lugares usam a **mesma configuração persistida no backend**, sem duplicar segredos nem armazená-los no projeto.
- Ordenação padrão de fallback para geração HyperFrames: **NVIDIA (somente modelos com API funcional) -> Moonshot/Kimi K3.1 Pro (se habilitado e com créditos) -> OpenAI -> Anthropic/Claude -> DeepSeek -> Ollama (último recurso)**, sujeita a disponibilidade, credenciais, modalidade da tarefa, capacidade do modelo e confirmação dos custos. Permitir prioridade manual. **A seleção por tarefa é obrigatória:** modelos de texto não podem receber diretamente vídeo/áudio se não oferecerem essa capacidade; usar transcrição e quadros extraídos como alternativa autorizada.
- **Modelo e provedor escolhidos aparecem perto do botão Gerar**, juntamente com status de conexão, indicação local/nuvem, seletor de modo (automático/manual) e atalho **Configurar API**. Sem chave válida, mostrar configuração necessária e nunca prometer que uma chamada será realizada.
- Credenciais são enviadas somente por HTTPS (exceto loopback confiável), ficam criptografadas/armazenadas no servidor por mecanismo apropriado, são mascaradas após salvar e **nunca retornam em respostas de leitura para o navegador**. Os campos UI servem para cadastrar/substituir/remover; requests de geração usam configuração server-side.

### Presets NVIDIA obrigatórios + criador de chamadas Node.js copiáveis

**Requisito do proprietário, 13/11/2026: a tela de IA deve aceitar os três modelos abaixo explicitamente, não depender de campo genérico ou de código editado à mão.**

| Nome exibido na interface | ID exato para `model` | Entrada anunciada | Status encontrado na documentação em 13/11/2026 |
|---|---|---|---|
| **Nemotron 3 Nano Omni** | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | texto, imagem, vídeo, áudio | `Free Endpoint: Available` |
| **Kimi K3** (não confundir com K3.1 Pro) | `moonshotai/kimi-k3` | texto, imagem; saída texto | A **página individual** exibe `Free Endpoint: Deprecated`; documentação de chamada ainda existe. Manter o preset, mas **não prometer uso gratuito nem disponibilidade** até teste real com chave |
| **Gemma 4 31B** | `google/gemma-4-31b-it` | texto, imagem, vídeo anunciados | `Free Endpoint: Available`; testar payload real de vídeo antes de habilitar esse formato |

**Endpoint padrão dos três presets:** `POST https://integrate.api.nvidia.com/v1/chat/completions`, `Authorization: Bearer <NVIDIA_API_KEY>`, `Content-Type: application/json`. Para uma mesma conta NVIDIA, reutilizar **uma chave compartilhada**, com status **por modelo** (a chave válida para a conta não garante modelo liberado).

**Experiência de interface em Settings > IA > NVIDIA:**
1. Campo único e seguro **API key NVIDIA** com Salvar / Alterar / Remover / Testar, sem mostrar o segredo salvo; permitir credenciais distintas opcionais por perfil.
2. Três cartões visíveis, habilitar/desabilitar, modelo/ID, modalidade suportada, status **Disponível / Indisponível / Descontinuado / Sem acesso / Não testado**, e botão **Testar chamada** (real, não apenas validar formato da chave).
3. **Aba "Chamada API (Node.js)"** para cada cartão: usuário pode escrever/editar o **prompt**, parâmetros compatíveis (`max_tokens`, temperatura, `stream`), selecionar modelo, montar mensagens JSON e visualizar **código Node.js completo**, com ações **Copiar código**, **Copiar cURL** (opcional), **Testar com backend** e **Copiar resultado**. Mostrar erros HTTP 401, 403, 404, 410, 429, 5xx sem falsos sucessos.
4. **Suporte a código Node personalizado**: além dos presets, permitir ao usuário colar/editar o formato de uma chamada customizada para outra IA, salvar como preset e testar sem gravar chave no snippet. Não executar JS arbitrário no navegador; funções personalizadas somente em executor backend isolado conforme seção seguinte.
5. **O código copiado nunca contém token real**: usar `process.env.NVIDIA_API_KEY` e indicar como defini-la no ambiente Node. O Editor faz chamadas internas pelo backend usando o cofre de credenciais. Nunca inserir chave em `localStorage`, commit, log, histórico MCP ou HTML HyperFrames.
6. Compatibilidade mínima do gerador: **Node.js 18+**, `fetch` nativo, JSON sem streaming por padrão (`stream: false`). Só exibir parâmetros particulares de cada modelo depois de validar a documentação; testes de conteúdo multimodal por modalidade, sem confundir `image_url` com upload de vídeo/áudio.
7. Na automação/HyperFrames, deixar escolher **Nemotron Omni para análise audiovisual**, **Kimi K3 para análise de imagens e geração de código** (somente se endpoint disponível), **Gemma 4 31B para texto/imagens e tarefas compatíveis**, com escolha manual ou fallback baseado em **capabilities realmente testadas**. Nunca afirmar que Kimi K3 lê vídeo diretamente.

**Modelo de código Node copiável:** `docs/nvidia-api-node.md` contém a referência de implementação e os três identificadores. O gerador na interface deve preencher automaticamente `model`, `messages` e parâmetros com base na escolha do usuário, sem expor credenciais.

**Testes obrigatórios deste recurso**
- [ ] Três cartões aparecem mesmo quando uma rota está descontinuada ou sem API.
- [ ] Uma mesma NVIDIA API key é armazenada com segurança e pode ser usada nos três, **se** autorizado pelo serviço.
- [ ] Teste de texto individual com cada ID registra status HTTP e erro real; no Kimi K3 `Deprecated`, mostrar status/alternativa, sem rotular falsamente como grátis.
- [ ] Botão **Copiar código Node.js** produz programa sintaticamente válido com `fetch`, variável de ambiente e modelo escolhido, sem segredo real.
- [ ] Usuário edita prompt e parâmetros, copia código atualizado e pode testar a mesma chamada pelo backend sem colocar chave no frontend.
- [ ] Modelos são selecionáveis em HyperFrames conforme capacidade documentada/testada; falha faz fallback ou erro compreensível, nunca edição fictícia.
- [ ] Gerador não afirma entrada de áudio/vídeo onde apenas texto/imagem foi verificado.

**Fontes primárias consultadas (a disponibilidade pode mudar):**
- Nemotron: https://build.nvidia.com/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
- Kimi K3: https://build.nvidia.com/moonshotai/kimi-k3
- Kimi K3 API Reference (documentação ≠ disponibilidade): https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3-infer
- Gemma 4: https://build.nvidia.com/google/gemma-4-31b-it
- Políticas de prototipagem NVIDIA NIM: https://docs.api.nvidia.com/nim/docs/product

### Requisito OBRIGATÓRIO: opção "Personalizada" com editor e executor real de código Node.js COMPLETO

**Correção de escopo solicitada pelo proprietário:** "Personalizada" **NÃO é apenas um formulário URL/modelo/headers, um gerador de snippets, um template limitado nem um código para executar fora do Editor.** O usuário precisa **colar um script Node.js inteiro na caixa de texto e clicar em EXECUTAR**, como o exemplo fornecido com `import axios from 'axios'`, `headers`, `payload`, `async function main()`, `axios.post`, `console.log`, tratamento de erros e `stream`. O Editor deve realmente executar o código em backend/runner controlado, exibir o resultado e poder aproveitar a chamada como provedor IA para o HyperFrames.

#### Interface — Settings > IA > Chamada API > **Personalizada**

1. Manter dois modos distintos e visíveis: **Gerar código (Node.js)** para presets prontos e **Personalizada — colar/executar código Node.js**. Nenhum substitui o outro.
2. Área grande de edição com **código completo**, quebra de linha, realce de sintaxe JavaScript, número de linhas, scroll, colar código da documentação de fornecedores, erros por linha e autosave de rascunho seguro. **Não exigir que o usuário reescreva seu exemplo num formulário declarativo.**
3. **Campo Nome do provedor** e opção **Salvar como provedor personalizado**, com lista de scripts salvos, editar, duplicar, remover e escolher como destino de tarefas/HyperFrames.
4. Botões reais: **Validar sintaxe**, **Executar / Testar chamada**, **Cancelar execução**, **Salvar**, **Copiar código**, **Copiar resposta** e, quando aplicável, **Usar esta IA no HyperFrames**.
5. Painel de execução: status (não testado/executando/êxito/erro/cancelado), **stdout/stderr**, resultado JSON/texto, erro HTTP e status, tempo de resposta, início/fim, resposta de streaming progressiva; não marcar como conectado só porque código foi salvo.
6. **Scripts com `import axios from 'axios'` (ES modules) são requisito de aceitação**. Runner deve ter uma versão de Node.js documentada (Node 20+ recomendado), com o pacote `axios` previamente incluído e outras dependências apenas se explicitamente aprovadas/instaladas de modo controlado. Suportar `fetch` nativo e `async/await`. Não executar instalação de pacotes automaticamente ao colar código.
7. **Segredos**: interface para cadastrar `NVIDIA_API_KEY` e tokens dos demais serviços; runner recebe SOMENTE variáveis de ambiente autorizadas para aquele script. No código do usuário, preferir `process.env.NVIDIA_API_KEY`, nunca inserir segredo no texto salvo ou copiado. **Atenção: a string literal `"Bearer $NVIDIA_API_KEY"` do exemplo não expande variáveis em Node.js**. Exibir aviso e sugerir interpolação via template literal usando `process.env.NVIDIA_API_KEY` (exemplo completo em `docs/custom-node-api-runner.md`), com confirmação antes de ajustar o código; jamais substituir segredo no editor em texto claro.
8. **Entrada/saída para automação:** além do teste manual, estabelecer um contrato mínimo para usar o script como conector IA: entrada estruturada (prompt, mensagens, contexto visual/áudio autorizado, parâmetros), envio por parâmetros/variáveis controladas, e saída normalizada para o roteador. Aceitar retorno da função exportada ou capturar/parsear a saída declarada, **sem presumir que qualquer `console.log` seja uma resposta IA válida**. Quando o script só faz teste solto, pedir mapeamento da resposta antes de habilitar HyperFrames.
9. **Streaming**: suportar tanto `stream: false` e resposta JSON quanto `responseType: 'stream'` com processamento de chunks, cancelamento e limites. Não afirmar que todo provedor suporta streaming.
10. **Segurança necessária para executar código arbitrário**: executar apenas com autorização explícita, em **processo/contêiner isolado descartável**, sem permissões de administrador, sem volume/arquivos do host, sem Docker socket, sem execução de comandos de sistema, com CPU/RAM/tempo limitados, rede restrita a endpoints externos aprovados e proteção SSRF/DNS/redirecionamento. Não usar a mesma execução/processo do backend de credenciais ou do renderizador. Expor apenas os segredos autorizados por execução, redigir logs, limitar tamanho de saída, proteger contra abuso e impedir execução de scripts por clientes MCP/remotos sem autorização específica.
11. Mostrar erros de importação de dependência, sintaxe, token ausente, 401/403/404/429/5xx, bloqueio de rede e timeout **com mensagens compreensíveis**, sem mascarar como sucesso.
12. Persistir script/versionamento, escopo, variáveis permitidas e adaptador de resposta no backend; informar se o script salvo está testado e disponível para fallback do roteador IA.

#### Exemplo real de comportamento esperado

Usuário cola o exemplo NVIDIA `import axios from 'axios'; ... main().catch(...);` exatamente como um arquivo `.mjs`. Seleciona a credencial NVIDIA já salva, autoriza `integrate.api.nvidia.com`, valida/corrige o placeholder literal `$NVIDIA_API_KEY` para leitura segura de `process.env`, clica **Executar**, vê resposta ou erro HTTP real e pode salvar a chamada como **"Nemotron customizado"**. Se a saída puder ser adaptada a `AI Provider Router`, pode escolher essa IA para criar planos de edição/animações HyperFrames.

**Referência de UX, contrato e exemplo completo:** `docs/custom-node-api-runner.md`.

#### Critérios de aceitação obrigatórios (não basta gerador/copiar)

- [ ] O editor aceita **o código Node completo do exemplo do proprietário**, inclusive `axios`, `import`, `async/await`, JSON, `console.log` e `catch`.
- [ ] Botão **Executar** dispara execução REAL num runner isolado e mostra saída, erro e status HTTP; o código não fica meramente armazenado nem apenas copiável.
- [ ] Chave cadastrada na UI chega ao script como `process.env.NVIDIA_API_KEY` sem ser exibida no código ou logs; snippet literal `$NVIDIA_API_KEY` recebe aviso de que não é expansão automática.
- [ ] Modo **Personalizada** funciona para outros fornecedores, com endpoint e credenciais próprios, sem restringir o usuário a NVIDIA.
- [ ] Scripts podem ser salvos, reabertos, testados, duplicados e usados como provedores HyperFrames **quando saída/capacidade forem compatíveis**.
- [ ] Testes cobrem resposta JSON, streaming, importação de `axios`, falta de chave, dependência não permitida, timeout, cancelamento, URLs internas bloqueadas e isolamento do host.
- [ ] Gerador Node.js dos três presets NVIDIA **continua existindo separadamente** da caixa de código executável.



### Arquitetura

- Serviço **AI Provider Router** exclusivamente backend; interface padronizada de capabilities, modelos, invocação, limites, erro e cancelamento.
- Credenciais em cofre/variáveis protegidas no servidor, mascaradas na UI, nunca incluídas no projeto, no browser bundle, nos logs ou na timeline.
- Distinguir falhas **retriáveis** (timeout/5xx/429, com backoff e respeito ao Retry-After) de falhas **não retriáveis** (sem permissão, parâmetros inválidos, custo bloqueado); circuit breaker e cooldown.
- Persistir **jobs estruturados**, checkpoints e eventos: job ID, snapshot/revisão do projeto, etapa executada, entrada saneada, saída validada, ações já confirmadas e ações pendentes.
- **Fallback não “continua magicamente” uma geração interrompida.** A transferência acontece no último checkpoint validado; o novo modelo recebe um resumo de estado, dados necessários e o contrato de saída. Respostas parciais inválidas são descartadas.
- JSON/schema de plano com validação estrita, operação idempotente quando aplicável, limite de tentativas, prevenção de duplicidade e aprovação antes de mutação da timeline; **revalidar F01 quando a proteção existir (fase 7)**.
- Concorrência: fila por projeto, lock de versão/revisão otimista, interrupção/cancelamento, persistência após reload; não deixar duas IAs editarem o mesmo projeto simultaneamente sem isolamento.
- Verificar privacidade: arquivos de mídia NÃO devem ser enviados à nuvem por padrão; solicitar opt-in por tipo de mídia.
- Observabilidade sem vazamento: métricas de latência, quantidade de tokens/custo quando fornecidos, motivo do fallback e logs redigidos.

### Kimi K3.1 Pro — NVIDIA vs. Moonshot (verificação documental em 13/11/2026)

**Modelo:** `kimi-k3.1-pro` (Moonshot) / `moonshotai/kimi-k3.1-pro` (identificador indicado pela referência NVIDIA). Usar IDs exatos da rota escolhida, **não trocar prefixes indiscriminadamente**.

**ATENÇÃO — endpoint NVIDIA ainda não é integrável por API programática:** apesar da página Build oferecer playground/indicar "Free Endpoint", o exemplo da própria página https://build.nvidia.com/moonshotai/kimi-k3_1-pro declara: **"API access for this model is not available yet"**, e diz que nenhuma chave autoriza acesso programático. A referência técnica da NVIDIA descreve o modelo, mas **não comprova acesso liberado**. Portanto, mostrar NVIDIA/Kimi como **"aguardando API"**, sem fazer chamadas fictícias ou marcá-lo como conectado; liberar somente após **smoke test autenticado real e atualização da disponibilidade**.

**Alternativa concreta já documentada: Moonshot API oficial**
- Plataforma/chave: https://platform.kimi.ai/ (campo `MOONSHOT_API_KEY` na interface).
- Base URL: `https://api.moonshot.ai/v1`.
- Endpoint de chat: `POST https://api.moonshot.ai/v1/chat/completions`.
- Model ID: `kimi-k3.1-pro` (e `kimi-k3.1-pro-highspeed` opcional, se habilitado pelo plano).
- Autenticação no servidor: `Authorization: Bearer <MOONSHOT_API_KEY>`.
- **Entende vídeo como entrada e produz texto, NÃO renderiza vídeo:** a API oficial documenta upload de vídeo com `purpose: "video"`, depois envio de `{ type: "video_url", video_url: { url: "ms://<id-do-arquivo>" } }` dentro de `messages[].content`; `ms://` é **exclusivo do armazenamento Moonshot**, não uma URL genérica da NVIDIA.
- A documentação oficial aceita MP4/WebM e vários outros formatos na **Moonshot**; vídeo e imagens podem consumir muitos tokens. Fazer estimativa de custo/quota, perguntar antes de upload, mostrar progresso e limpar arquivos remotos após o job se possível.
- **Kimi K3.1 Pro requer liberação da conta e cobrança por uso**; o quickstart oficial informa recarga mínima de US$ 1 para liberar esse modelo (verificar regras vigentes na ativação). Não prometer API gratuita para uso contínuo.
- **Checagem de vídeo:** se a rota NVIDIA suportar futuramente vídeo, validar **formato real do payload** e upload da NVIDIA; a referência atual `integrate.api.nvidia.com/v1/chat/completions` documenta `image_url`, mas não demonstra o `video_url` da Moonshot. Não presumir equivalência.
- **Áudio:** a documentação de entrada visual não confirma que Kimi transcreva/entenda o áudio do vídeo. Para sincronização de HyperFrames, manter análise de trilha, batidas/energia e transcrição **por ferramentas próprias/autorizadas**, fornecendo os resultados com timestamps. Não alegar compreensão de áudio nativa até teste/documentação específicos.

**Referências verificadas**
- NVIDIA Build/Playground: https://build.nvidia.com/moonshotai/kimi-k3_1-pro
- NVIDIA model card: https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3_1-pro
- NVIDIA endpoint de referência (disponibilidade não garantida): https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3_1-pro-infer
- Moonshot guia K3.1 Pro e endpoint: https://platform.kimi.ai/docs/guide/kimi-k3-1-pro-quickstart
- Moonshot envio de vídeo e imagens: https://platform.kimi.ai/docs/guide/use-kimi-vision-model

**Critérios de aceitação extras para F03**
- [ ] UI distingue claramente **"Kimi via NVIDIA: indisponível"** de **"Kimi via Moonshot: não configurado / testado / conectado"** e mostra endpoint/modelo reais.
- [ ] Adicionar chave Moonshot, testar inferência de texto com `kimi-k3.1-pro` e exibir custo/erro sem mostrar segredo; não considerar sucesso apenas ao salvar chave.
- [ ] Testar, **com autorização explícita**, upload de um MP4 curto e solicitação multimodal `video_url` pela Moonshot, incluindo limpeza posterior do arquivo; marcar capacidade `video_input=true` só após teste do provedor.
- [ ] Fallback não manda vídeo bruto para um modelo só textual; em falta de visão, usar frames/transcrição autorizados ou informar limitação.

### NVIDIA: condição real, não promessa

A NVIDIA documenta acesso gratuito a endpoints NIM para **prototipagem** mediante Developer Program, o que **não equivale** a APIs irrestritas, disponibilidade para qualquer modelo ou uso gratuito ilimitado em produção. Conferir elegibilidade, quotas, termos, modelos e tarifas atuais antes de ativar.

Fonte oficial: https://docs.api.nvidia.com/nim/docs/product

### Critérios de aceitação

- [ ] Usuário cadastra e testa Ollama, **presets NVIDIA Nemotron 3 Nano Omni, Kimi K3 e Gemma 4 31B**, **Moonshot/Kimi K3.1 Pro** (rota independente), OpenAI, Anthropic, DeepSeek e pelo menos **uma IA personalizada por adaptador JS/Node**, com token quando necessário e disponibilidade real do endpoint.
- [ ] Ranking e escolha de modelo persistem por usuário/servidor, com configuração clara.
- [ ] Em falha retriável, um segundo provedor compatível recebe somente o estado validado e conclui o próximo passo.
- [ ] Erros de autenticação, custo ou capacidade inadequada produzem mensagens compreensíveis sem loop infinito.
- [ ] Nunca expor chaves no navegador, código-fonte, logs ou histórico MCP.
- [ ] A IA não aplica plano não validado; após F01 (fase 7), também deve respeitar itens protegidos.
- [ ] Job pode ser retomado após reiniciar a interface sem repetir ações já aplicadas.

**Áreas iniciais:** apps/web/src/automation, apps/web/src/app/api/automation, apps/web/src/server-automation, apps/web/src/env, apps/mcp/src/server.ts, componentes da área de Settings.

---

## F04 — HyperFrames dentro de IA & Automação (FASE 3)

**Prioridade imediata após o roteador IA:** confirmar e reaproveitar o que já estiver construído de HyperFrames, conectá-lo aos provedores da fase 2 e colocá-lo para funcionar na edição e na exportação. **Não depender de F01**, F09 ou F08.

### Posição exigida

Na aba **IA & Automação**, manter Assistente e Auto Cut. **Depois do bloco Auto Cut**, ao rolar para baixo, mostrar uma seção expansível ou subaba **HyperFrames**; a lista deve permitir rolagem independente quando necessário.

### Fluxos pretendidos

1. Criar uma **composição animada** com HTML/CSS/JS e/ou por instrução textual à IA.
2. Escolher duração, resolução, FPS, fundo transparente quando disponível e **orientação horizontal/vertical** com presets **16:9 e 9:16** mais formato personalizado.
3. Editar/visualizar propriedades e templates: títulos, lower thirds, anúncios, stickers animados, contadores, banners, composição de GIF/HTML, overlays para vídeo.
4. Pré-visualizar com controles Play/Pause/Seek e inserir a composição como um **clipe temporizado na timeline** do Editor.
5. Movimentar, cortar duração, organizar sobre outras faixas, pré-compor, alterar escala e parâmetros; **após a fase 7**, respeitar também F01.
6. **Usar a camada de áudio da timeline para criar e sincronizar animações**: leitura de waveform/energia, batidas e marcações temporais; opcionalmente fala/transcrição com consentimento, para orientar a geração de elementos por IA.
7. **Exportar vídeo e áudio sincronizados**, incluindo o som da timeline e eventual áudio próprio da composição sem duplicação, com alinhamento de início/fim, FPS e offset.
8. Garantir reprodução e exportação em **horizontal (16:9) e vertical (9:16)** com o mesmo enquadramento visto no preview.
9. Permitir que IA gere/edite **uma representação declarativa de composição** e solicite renderização; sempre exigir revisão e permitir desfazer.
10. Guardar templates reutilizáveis locais, com miniaturas e metadados de versão. Criar no futuro biblioteca ORUME para anúncios de live.

**Integração com scripts personalizados de F03:** o seletor IA do HyperFrames deve listar os **provedores personalizados salvos e testados**, não só NVIDIA/Moonshot/OpenAI. Ao usar o script, enviar ao runner parâmetros da tarefa e contexto de vídeo/áudio explicitamente autorizado, normalizar a resposta num plano de edição validável e permitir prévia/aprovação. Se o script apenas imprime informação sem contrato de saída, avisar que ele serve para teste manual até configurar o adaptador.

### Configuração da IA no próprio bloco HyperFrames

- Dentro da seção **HyperFrames**, imediatamente abaixo dos controles de **Gerar com IA**, incluir painel compacto **IA conectada** com seletor de provedor/modelo, estado **Conectado / Não configurado / Indisponível**, botão **Configurar API** e **Testar conexão**.
- No primeiro uso, permitir cadastrar o segredo diretamente em um modal dessa seção, reutilizando o armazenamento e as validações de **F03**. Nunca obrigar o usuário a abrir `.env`, Docker ou código-fonte para adicionar uma chave.
- Permitir escolher entre **Automático (NVIDIA disponível -> Moonshot/Kimi -> OpenAI -> Claude -> DeepSeek -> Ollama)** e **Manual**, com mensagens claras para falha/limites/quotas, aprovação de custos e compatibilidade de modelo com geração de composição. O modelo específico **Kimi K3.1 Pro via NVIDIA** fica indisponível enquanto não existir API liberada; selecionar o Kimi via Moonshot quando configurado.
- Geração de HTML/CSS/JS e planos de alteração passam por backend F03, sanitização, prévia e aprovação; **na fase 7**, integrar também as proteções F01. **A chave jamais deve ser interpolada no HTML/JS gerado**.

### Plano de edição automática com Kimi K3.1 Pro e HyperFrames

**Objetivo funcional:** botão **"Analisar vídeo e criar animações com IA"** na seção HyperFrames, com modelo/provedor configurável. A IA **propõe** edições; o Editor valida, pré-visualiza, aplica à timeline e renderiza. O Kimi não modifica MP4 diretamente, não gera vídeo como saída e não executa HTML no cliente com credenciais.

Fluxo:
1. Usuário seleciona vídeo/clipe(s), escopo, orientação (16:9 ou 9:16) e estilo de edição (ex.: memes, legendas, transições, overlays). Exibir estimativa de custo antes de enviar mídia.
2. No backend, extrair metadados, duração, FPS, dimensões e **trilha de áudio**. Detectar batidas/energia, obter transcrição com timestamps quando disponível e selecionar quadros relevantes. **Não assumir que a entrada de vídeo carrega áudio interpretável pelo Kimi**.
3. Com consentimento explícito para enviar mídia a serviço externo, usar Moonshot `kimi-k3.1-pro`: upload permitido de MP4/WebM, referência `ms://<file-id>`, contexto com transcrição/tempos e instrução de edição. Se vídeo não for suportado pela rota atualmente configurada, recorrer a frames autorizados e texto estruturado. **NVIDIA/Kimi só é opção quando sua API for comprovadamente liberada.**
4. Solicitar ao modelo **plano estruturado** por intervalos de tempo (start/end/asset/tipo de overlay/duração/posição/ritmo e transcrição vinculada) e **composições HTML/CSS/JS HyperFrames** ou representação declarativa compatível. Validar JSON Schema/contrato, limites, assets, permissões e sincronização em servidor; nunca executar código arbitrário gerado sem sandbox.
5. Mostrar prévia/diff e pedir confirmação antes de criar clipes HyperFrames, textos, stickers ou ações de timeline. Preservar reversibilidade, escopo e projeto original.
6. Renderizar no pipeline próprio do Editor/HyperFrames com áudio original/mix correto em **horizontal e vertical**, comparando preview e export. Salvar checkpoint para fallback de IA e limpeza de arquivos remotos.
7. Permitir ajuste manual e replanejamento de um trecho sem pagar/processar todo o vídeo de novo; exibir custos, tokens e motivo de falhas.

**Separação de responsabilidades:**
- **Kimi (Moonshot/NVIDIA se disponível):** compreensão visual, identificação de momentos, planejamento temporal, geração de instruções/código HyperFrames e, quando compatível, chamadas estruturadas de ferramentas.
- **Serviços locais ou modelos adequados:** separação de áudio, transcrição, detecção de beats, metadados, cortes de frame e cálculo de timestamps.
- **Editor + HyperFrames:** aplicação de alterações, criação dos clipes, preview, sincronização, composição e exportação final de vídeo/áudio.

**Critérios de aceitação extras para F04**
- [ ] Um vídeo autorizado curto gera proposta de pelo menos um clipe HyperFrames com **start/end** verificáveis e áudio alinhado; usuário pode aprovar ou rejeitar antes de alterar timeline.
- [ ] Mesmo projeto testa **16:9 e 9:16** com preview/export consistentes.
- [ ] Execução sem acesso à NVIDIA funciona com **Kimi via Moonshot** quando configurado e aprovado; falha de API retorna mensagem legível, não uma animação fictícia.
- [ ] Envio de MP4 à nuvem exige consentimento explícito e sinalização de custos; não incluir chaves no HTML da composição.
- [ ] Falha de análise visual não inviabiliza edição manual nem corrompe projeto, e serviço não presume análise de áudio nativa.

### Integração técnica proposta

- Validar licença/versão da distribuição HyperFrames e compatibilidade com Node/Bun e ambiente Docker.
- Pesquisar uso combinado dos pacotes documentados:
  - **@hyperframes/studio**: editor/preview incorporável;
  - **@hyperframes/core**: parsing, validação e composição estruturada;
  - **@hyperframes/player**: reprodução de composições;
  - **@hyperframes/producer** ou CLI: conversão HTML -> MP4/WebM via FFmpeg.
- Não simplesmente colocar outro editor desconectado: criar **HyperFramesClip** ou objeto de composição associado a assets/versionamento e timeline.
- Mapeamento temporal: frame rate, início/fim, keyframes, transições, trilhas de áudio, sincronização A/V, waveform/beat markers, dimensões **16:9/9:16**, offset de tempo.
- Estratégia de render: composição HTML segura -> serviço isolado/captura determinística -> asset cacheado com hash -> compositor da timeline -> export final.
- Pré-renderizar quando a renderização interativa ficar pesada. Invalidar cache quando composição, fonte, duração, tamanho ou parâmetros mudarem.
- Isolar HTML/JS de terceiros em sandbox, com allowlist de recursos e sem acesso à rede interna, tokens ou filesystem do host. Definir política CSP; proibir scripts arbitrários não confiáveis por padrão.
- Quando uma composição tiver assets remotos, exigir resolução prévia ou mostrar dependência externa e seus efeitos na exportação.

### Critérios de aceitação

- [ ] HyperFrames aparece abaixo de Auto Cut com rolagem funcional.
- [ ] Composição HTML pode ser criada, editada, pré-visualizada e adicionada à timeline em **16:9 e 9:16**.
- [ ] Render e preview exibem mesmos elementos, tempos e posições em testes determinísticos.
- [ ] Render final em **horizontal ou vertical** funciona sem gravar a tela e preserva sincronismo de áudio da timeline.
- [ ] Undo/Redo funciona para composições; integração à proteção de F01 será feita depois, na **fase 7**.
- [ ] Conteúdo malicioso e URLs internas não obtêm acesso à infraestrutura.

**Referências oficiais:**
- https://hyperframes.app/docs/5-packages/studio
- https://hyperframes.app/docs/5-packages/core
- https://hyperframes.app/docs/5-packages/producer
- https://hyperframes.app/docs/3-guides/4-rendering

---

## F07 — Links: YouTube, Twitch, Pinterest/GIF, arquivos externos e iframe (FASE 4 — essencial)

**Objetivo imediato:** carregar fotos, GIFs e vídeos diretamente de links permitidos; permitir prévia de **vídeos YouTube, Twitch e lives** dentro do editor. A aba é parte central do fluxo de edição, **não depende de F01**. Distinguir claramente `visualizável`, `importável` e `exportável`: embeds de players podem funcionar como prévia mas não podem ser presumidos exportáveis ou baixáveis.

### Nova aba **Links**

Adicionar seção de mídia **Links** no painel de assets, com input para URL, identificação do tipo, validação, preview e modalidades distintas:

| Tipo | Comportamento proposto | Exportabilidade |
|---|---|---|
| URL direta de arquivo MP4/WebM/MP3/WAV/GIF/PNG etc. | Importar asset autorizado (servidor ou upload) e adicionar à timeline | Sim, se arquivo obtido e decodificado legalmente |
| YouTube | Player incorporado oficial para consulta/prévia; opção de obter arquivo original por **canal de entrega autorizado** pelo titular | Não prometer capturar vídeo do player incorporado no render |
| Twitch | Player/clip embed conforme SDK e termos; para mídia própria, usar método oficial/autorizado de obtenção | Somente com asset exportável autorizado |
| Pinterest | Link externo/pin/preview, resolver GIF/mídia quando existir URL do arquivo com permissão de uso | Sim somente com asset local válido e direitos adequados |
| Redes sociais/posts | Prévia incorporada se permitida pelo site | Não garantida; fallback visual autorizado/estático |
| Iframe/website | Elemento “Web embed” com URL/tempo/escala/posição, avisos de suporte | Apenas se captura server-side autorizada, segura e reprodutível |

### Interface e fluxo

1. Usuário cola URL.
2. O backend classifica fonte com **adaptadores por provedor**, valida URL e direitos declarados, consulta metadados permitidos.
3. O UI informa explicitamente: **“Visualizável”**, **“Importável”**, **“Exportável”** ou **“Não suportado”** (atributos independentes).
4. Usuário escolhe **Adicionar ao projeto** ou **Inserir na timeline**; item visual tem início, duração, dimensões, crop, posição e opções de refresh.
5. GIF deve se comportar como mídia animada (loop, velocidade, duração e transparência quando disponível), não como imagem estática.
6. Para iframe, disponibilizar campo URL e modos: visualização interativa; snapshot estático quando autorizado; captura determinística de página **somente** quando suportada.
7. Projetos salvos devem preservar URL, licença/declaração de direitos, tipo de origem e asset resolvido; ao reabrir, não depender silenciosamente de URL que expirou.

### Limitações técnicas e jurídicas inegociáveis

- **Iframe não é arquivo de vídeo.** Nem todo site permite incorporação (CSP frame-ancestors / X-Frame-Options), e um iframe visível na UI **não será automaticamente renderizável** num MP4 local.
- Conteúdos cross-origin e embeds podem impor CORS, DRM, cookies, autenticação, anúncios, navegação, bloqueio de autoplay e conteúdo variável. Nunca remover restrições por artifício.
- **YouTube:** a API oficial de embed serve para reprodução; políticas de API restringem baixar/importar/armazenar conteúdo audiovisual sem aprovação. Não implementar um “baixar qualquer link” baseado em extractor para contornar regras.
- O mesmo cuidado vale para Twitch, Pinterest e demais plataformas: verificar termos e direitos de cada caso e fornecer caminho para importar **arquivo próprio/fornecido legalmente**.
- Para páginas de terceiros, capturas no servidor só quando houver autorização, isolamento, recursos acessíveis e tempo de render previsível; se não, o item permanece somente prévia, com aviso antes de exportar.
- Segurança: proteção anti-SSRF (bloquear localhost, IPs privados/metadata e redirects perigosos), tamanho/duração máximo, MIME real, quotas, antivírus quando necessário, sandbox do render, sanitização de links e rate limits.

### Critérios de aceitação

- [ ] Aba Links com input e detecção do tipo de URL.
- [ ] URLs diretas de **foto/imagem (PNG/JPEG/WebP), MP4 e GIF** autorizado são importadas para a timeline e renderizam.
- [ ] GIF animado com loop, timing e transparência compatíveis.
- [ ] **YouTube, vídeos/lives Twitch** abrem em embed oficial quando permitido; informar que visualização não significa que o vídeo possa ser exportado no MP4 sem asset e direitos válidos.
- [ ] Link Pinterest não promete GIF caso o pin não exponha arquivo permitido.
- [ ] Iframe retorna aviso quando o site bloqueia incorporação; render não produz vídeo vazio silenciosamente.
- [ ] Falhas de URL, permissão, CORS, timeout e export mostram diagnóstico claro.
- [ ] Testes de SSRF, URLs encurtadas/redirects e embeds maliciosos passam.

**Referências:** 
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/developer-policies
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

---

## F05 — Stickers: apenas corrigir scroll (FASE 5)

**Decisão:** não modificar categorias, catálogo, aparência, busca nem organização do painel Stickers. A única mudança solicitada é **corrigir a rolagem vertical**: ao ter muitos itens, a lista cresce, mas não permite rolar até o fim.

### Investigação e correção restrita

- Reproduzir bug com muitos stickers e viewport pequeno.
- Corrigir altura e overflow do contêiner correto; inspecionar `min-h-0`, layout flex, barras de abas e sobreposição.
- Permitir rolar por mouse, touchpad, toque e teclado; manter busca e categorias visíveis.
- Não introduzir nova aba Stickers, bibliotecas extras, redesign, imagens ou filtros além do necessário para solucionar o bug.

### Critérios de aceitação

- [ ] Scroll chega do primeiro ao último sticker.
- [ ] Abas, catálogo, busca, drag-and-drop e visual existentes permanecem iguais.
- [ ] Sem regressão em telas menores.

**Áreas iniciais:** `apps/web/src/stickers/components/assets-view.tsx` e ancestrais do layout.

---

## F09 — MCP externo via ngrok, controlado pela interface (FASE 6)

**Ordem:** executar depois de F05 e antes de F01 e F08. A fase 6 reaproveita o cofre de credenciais de F03 e aplica permissões atuais sem esperar o sistema de bloqueio de camadas. Atualizar política de proteção quando F01 for implementada.

### Objetivo e restrição obrigatória

Permitir que clientes MCP externos autorizados (incluindo agentes de IA em outra rede) se conectem ao **MCP Streamable HTTP já existente** para ler o projeto e aplicar edições no editor aberto. **Não substituir o endpoint LAN, não criar ponte MCP de outro fornecedor e não usar Cloudflare, Tailscale ou outro túnel: o único provedor de túnel remoto nesta feature é o ngrok.** O túnel não significa, por si só, disponibilizar a interface web completa do editor em outra rede: isso seria outro escopo, com autenticação própria.

### Localização e experiência de uso

- Na aba existente **MCP**, inserir no topo um controle visível **Acesso pela rede / ngrok**. Preservar status atual do servidor, URL MCP LAN, bearer token e bloco de configuração copiável.
- Apresentar **dois endereços distintos**, cada um com botão Copiar e com sua configuração MCP pronta:
  1. **MCP local (LAN):** URL atual `http://IP_DA_REDE:3101/mcp`, sempre disponível enquanto o serviço local estiver ativo.
  2. **MCP externo (ngrok):** `https://DOMINIO_REAL_GERADO_PELO_NGROK/mcp`, exibido **somente depois que o túnel estiver realmente ativo e testado**. Nunca inventar uma URL ou mostrar o endereço LAN como se fosse externo.
- Botões **Iniciar túnel**, **Desligar túnel**, **Copiar URL externa**, **Copiar configuração MCP remota** e **Testar conexão**; estado visível: Desligado, Iniciando, Online, Desligando, Erro. Mostrar último erro e opção Tentar novamente.
- Área recolhível **Configurar ngrok** dentro da própria aba: **Authtoken do agente** (necessário para abrir o túnel), **API Key ngrok** (somente quando for necessária para gerenciar recursos da conta; não exigir para o túnel simples), domínio reservado opcional **se a conta permitir**, Salvar / Testar credenciais / Trocar / Remover e indicação de limites/plano. Incluir links oficiais para obtenção de cada segredo.
- Exibir o **caminho /mcp**, transporte **Streamable HTTP**, indicador de autenticação, origem do serviço e aviso de que o editor/sessão deve permanecer aberto para comandos interativos. O fluxo de cópia deve usar a URL efetivamente retornada pelo ngrok, sem adivinhar subdomínio.
- Diferenciar explicitamente **acesso ao MCP por IA remota** de **acesso ao editor web por navegador**. O túnel padrão expõe apenas o MCP da porta 3101, **não** o frontend na porta 3100 nem endpoints n8n.

### Implantação e comportamento do túnel

- O backend administra o agente ngrok (SDK oficial ou processo gerenciado verificado na plataforma/contêiner), direcionando o tráfego HTTPS externo ao serviço MCP interno na **porta 3101**. No Docker Compose, resolver corretamente os endereços internos; no Windows, documentar a opção de execução e sua persistência.
- O botão liga/desliga deve iniciar ou encerrar **efetivamente a sessão ngrok**, com idempotência, mutex/controle de processo e limpeza após falha. Desligar deve derrubar o acesso externo sem interromper o MCP LAN nem o editor.
- Consultar o ngrok para recuperar **URL pública real e status atual**. Ao reiniciar o serviço, reconciliar o estado; não mostrar “Online” por haver processo vivo sem teste do encaminhamento. Reconexões não devem criar túneis duplicados.
- Permitir definir se o túnel volta ativo após reiniciar (padrão **desligado**), persistindo somente a preferência; nunca ligar o túnel silenciosamente após reset/erro de autenticação.
- Preservar transporte MCP Streamable HTTP, métodos, headers, requisições longas e streaming conforme comportamento do servidor. Verificar compatibilidade do cliente MCP remoto com autenticação por Bearer/custom headers; alguns clientes podem exigir transporte ou autenticação específica.
- Configurações copiáveis para **LAN** e **Remoto** não devem conter segredos por padrão: oferecer ação separada e explícita **Copiar com token** com alerta de confidencialidade. Em caso de troca/revogação de token, as configurações copiáveis devem refletir a nova credencial apenas após autenticação.

### Credenciais e segurança obrigatória

- **Authtoken ngrok não é API Key ngrok.** O authtoken autentica o agente que cria o túnel; a API Key administra recursos via API. Campos independentes e opcionais conforme necessidade, nunca solicitar uma API Key para substituir indevidamente o authtoken.
- Reutilizar o cofre de credenciais backend de F03, com escopo de administrador, masking, rotação, remoção, redaction de logs e sem retornar valores em GET. Não guardar chaves em localStorage, payload do projeto, bundles, logs, erros, MCP outputs ou GitHub.
- **Pré-requisito de exposição pública:** bearer token MCP próprio, forte e rotacionável, desvinculado de `BETTER_AUTH_SECRET`. O Compose atual deriva `OPENCUT_AUTOMATION_TOKEN` de `BETTER_AUTH_SECRET`; separar esses valores antes de publicar o túnel. Não usar credencial administrativa genérica como chave pública.
- Aplicar autenticação e autorização em **todas as ferramentas MCP e endpoints relevantes**, não apenas na interface. Impedir acesso anônimo, reforçar controles contra brute force, limitar taxa, validar Origin/Host quando pertinente e reduzir superfície de rede. Em caso de credencial ausente/segurança falha, **bloquear o botão Iniciar** com orientação para resolver.
- Separar, quando viável, token de leitura de token com permissão de **editar/exportar** e oferecer revogar/rotacionar sessões. Alterações remotas exigem validação de plano, confirmação de ações sensíveis e auditoria; **após a fase 7**, passam a respeitar também F01.
- Exibir alerta ao ativar: **“O MCP ficará acessível pela internet para quem possuir as credenciais autorizadas.”** Não divulgar link e token juntos em prompts, vídeos, prints ou repositório.
- Encerramento do túnel deve invalidar rota remota ativa; um domínio reservado pode permanecer reservado na conta, mas não deve estar encaminhando para a aplicação após desligar.
- Tratar limites, disponibilidade e custos ngrok de acordo com a conta real; não pressupor domínio estático ou recursos pagos no plano gratuito.

### Critérios de aceitação

- [ ] Aba MCP exibe URL LAN e, após ativação bem-sucedida, URL pública ngrok HTTPS distinta, ambas com ações Copiar/Configuração.
- [ ] Usuário configura **Authtoken** e, se realmente necessário, **API Key ngrok** diretamente na UI; segredos nunca retornam em leitura.
- [ ] Botões Iniciar/Desligar executam operações reais, são idempotentes e exibem status/erros confiáveis.
- [ ] MCP remoto autenticado lê a sessão e executa comandos permitidos, inclusive após atravessar o ngrok, sem alterar o comportamento LAN.
- [ ] Sem token MCP dedicado ou com autenticação mal configurada, o túnel **não inicia**.
- [ ] Desligar encerra o acesso externo mas preserva serviços/URLs LAN; reinício respeita a política de não reativação automática.
- [ ] O frontend web, a API geral e os webhooks n8n **não** ficam expostos acidentalmente pelo túnel MCP.
- [ ] MCP remoto, IA e ações globais exigem confirmação, autorização e logs sanitizados; respeitarão também F01 após a fase 7.
- [ ] Testes de URL dinâmica/reservada, perda de conexão, troca de chaves, 401/403, vários cliques, reinício Docker/Windows e streaming MCP.
- [ ] Guia PT-BR de configuração e revogação, com aviso de custos e segurança, acompanhado de teste real cliente externo.

**Áreas iniciais:** componentes da aba MCP atualmente utilizada pelo editor (reidentificar no código antes de implementar), `apps/mcp/src/server.ts`, transporte HTTP do MCP, `docker-compose.yml`, serviços/backend de integrações e credenciais, `docs/lan-automation.md`.

**Fontes primárias para implementação:**
- https://ngrok.com/docs/start
- https://ngrok.com/docs/gateway/endpoints/http
- https://ngrok.com/docs/gateway/endpoints/agent-cli-quickstart

---

## F01 — Proteção de camada/clipe contra edição geral (FASE 7 — penúltima do ciclo prioritário)

**Regra:** implementar este recurso **somente após F02, F03, F04, F07, F05 e F09**. Não é dependência para nenhum deles. Ao adicionar bloqueio, integrar retroativamente com comandos de edição, IA, MCP e HyperFrames já existentes, preservando compatibilidade e Undo/Redo.

### Experiência de uso

- Na lateral de cada **layer/faixa** da timeline, adicionar botão com cadeado/escudo e tooltip **“Não afetar por edição geral”**.
- Oferecer mesma ação no menu contextual do clipe ou seleção de clipes.
- Estados claros: **Livre**, **Protegido contra edição geral** e **Proteção herdada da faixa**; ícone visível mesmo com painel compacto.
- Quando protegido, o item deve permanecer **inalterado** diante de comandos globais: normalizar, Auto Cut, ajuste de proporção, efeitos em massa, IA, MCP, transições em massa, alinhamento automático, exclusões gerais etc.
- A proteção de **faixa** tem precedência e protege todos os seus clipes; desmarcar clipe isolado não pode ultrapassar faixa protegida.
- Edição manual explícita de item protegido deve solicitar **desbloqueio antes de alterar**; não remover proteção silenciosamente.
- A opção “proteger seleção”, com indicador de quantidade, deve ficar disponível no menu de contexto.

### Semântica obrigatória

- Modelar proteção persistente no documento para faixa e elemento (ex.: globalEditProtected; nome final sujeito à modelagem).
- Definir um serviço/predicado central de permissão para alterações com contexto: origem (manual/global/IA/MCP), alvos, tipo de comando e estado de proteção.
- **Não basta desativar botões de UI:** validar novamente no command handler e na aplicação dos planos IA/MCP. Backend e render não devem ignorar os flags.
- Antes de executar operações globais, criar snapshot dos alvos elegíveis e dos protegidos; exibir quantidade: “X elementos serão modificados; Y protegidos serão ignorados”.
- Auto Cut exige atenção adicional: **não encurtar, mover, dividir ou desalinhar** elementos protegidos. Em cortes de silêncio que alteram a duração da timeline, não deslocar material protegido sem autorização. Se houver conflito estrutural, bloquear o corte específico, informar o motivo e permitir ajustar a seleção; não prometer que basta “pular” o clipe.
- Em operações de resize de canvas, a cena/projeto pode mudar, mas posição, tamanho, keyframes e transform dos elementos protegidos devem permanecer matematicamente inalterados; avisar sobre possível perda de enquadramento.
- Preservar status na duplicação, salvamento, importação/exportação do projeto, undo/redo e reconstrução do histórico.
- Proteções não são DRM: servem para garantir comportamento do editor, não para impedir que o proprietário altere o arquivo de origem.

### Critérios de aceitação

- [ ] Botão visível por faixa e ação por clipe/seleção.
- [ ] Uma faixa protegida permanece bit a bit igual em suas propriedades após ações gerais (exceto dados voláteis de UI).
- [ ] Auto Cut não altera nem desloca mídia protegida e informa conflito.
- [ ] Chamadas MCP e planos IA respeitam exatamente as mesmas regras.
- [ ] A edição individual de item protegido exige desbloqueio.
- [ ] Flag persiste após salvar, fechar e reabrir e passa por Undo/Redo corretamente.
- [ ] Testes unitários da matriz de permissões e testes de integração com múltiplas faixas.

**Áreas iniciais:** apps/web/src/commands/timeline, apps/web/src/timeline, apps/web/src/core/managers/timeline-manager.ts, apps/web/src/automation, apps/mcp/src/server.ts, modelos de projeto.

---

## F08 — Project Info > **Auto-converter formato** (FASE 8 — última entrega do ciclo prioritário)

### UX

- Em **Settings > Project info**, manter o seletor manual de Aspect ratio que já existe e acrescentar botão **“Auto-converter”**.
- Clicar abre modal com:
  - Origem atual (ex.: 1920x1080).
  - Destino **16:9, 9:16, 1:1, 4:3** ou **Personalizado** (largura, altura, orientação).
  - Estratégia: **Inteligente (IA)**, **Centralizar**, **Conter (sem cortes)**, **Preencher (com crop)**.
  - Opções: preservar itens protegidos, preservar relação de aspecto do conteúdo, respeitar margens seguras para TikTok/Reels/Shorts, duração/FPS inalterados por padrão.
  - Contador de elementos protegidos, previsão de itens que precisam de recorte e orçamento de processamento estimado quando possível.
- Mostrar **prévia lado a lado antes/depois** com navegação por trechos, indicadores de crop e botão **Aplicar conversão**.
- O resultado transforma a **composição inteira**, não apenas troca o tamanho de fundo.

### Modelo geométrico e comportamento

- Converter transformações de todos os elementos elegíveis: vídeos, imagens, texto, stickers, shapes, máscaras, legendas, posições, âncoras, transições, grupos, keyframes e composições HyperFrames quando compatíveis.
- Cada elemento possui transform normalizado (posição relativa ao canvas, escala, rotação, âncora, crop, constraints) para facilitar remapeamento.
- Algoritmo determinístico primeiro: adaptar a área útil com regras de contenção/preenchimento, preservar âncoras, impedir corte de textos e respeitar **safe areas**.
- Em vez de assumir que “centro em um formato sempre é centro no outro”, detectar importante conteúdo visual (face/objeto/texto) e inferir focal point; manter contexto quando possível.
- **IA é sugestão, não coordenada sem validação**: solicitar lista estruturada de deslocamentos/crops com confiança e motivo; validar limites de canvas, manter aspecto e permitir ajustes manuais.
- Diferenciar:
  1. **Reflow de elementos editáveis** (textos, overlays, stickers);
  2. **Reframing de pixels dentro de um clipe de vídeo** (tracking/crop de rostos e objetos ao longo do tempo);
  3. **Reframing da composição/cena**.
- Para vídeo em movimento, preparar trajetória suavizada por keyframes (interpolação/easing, limites de velocidade/acceleração), evitando saltos de câmera. Detectar troca de plano e reavaliar foco por cena.
- Se IA de visão não estiver disponível ou não houver confiança, aplicar fallback geométrico e avisar onde ocorreu crop não ideal.
- Não alterar itens protegidos; como a tela muda, avisar que item protegido pode ficar parcialmente fora do novo quadro. Não violar proteção para “consertá-lo”.
- Compatibilizar com resoluções fora do padrão e múltiplos aspect ratios por projeto; garantir estabilidade na conversão reversa quando possível.
- Preservar áudio, duração, sincronização e FPS por padrão. A escolha de resolução do destino deve ser independente do aspect ratio quando possível.
- Gerar uma única transação reversível para toda a conversão e registrar transform de origem, de destino e decisões tomadas.

### Exemplos de comportamento esperado

- **16:9 -> 9:16:** acompanhar sujeito principal do vídeo; reorganizar texto para linhas legíveis e inserir legendas em região segura; elementos sobrepostos deixam de se cobrir.
- **9:16 -> 16:9:** manter sujeito em enquadramento adequado, usar fundo estendido/blur opcional quando não há imagem suficiente, redistribuir overlays horizontalmente.
- **16:9 -> 1:1:** cortar laterais apenas quando inevitável, com prévia clara.
- **Qualquer formato -> Custom:** respeitar dimensões específicas sem deformar faces, fontes ou adesivos.

### Etapas técnicas

1. Extrair regras de transform/canvas atuais e criar inventário dos tipos de elemento suportados.
2. Implementar conversão **sem IA** com constraints determinísticas e testes geométricos.
3. Adicionar heurísticas de centro de interesse e saliência/rostos/objetos por solução aprovada, priorizando processamento local quando viável.
4. Criar contrato de roteador IA para propostas de layouts e validação; sem depender de um provedor específico.
5. Adicionar tracking temporal + suavização e editor de ajustes manuais.
6. Conectar preview, serviço de render e MCP, respeitando F01 e histórico.
7. Medir visualmente em cenas reais: pessoas, gameplay, textos longos, vários elementos, movimentos e mudanças de plano.

### Critérios de aceitação

- [ ] Modal com 16:9, 9:16, 1:1, 4:3 e Custom.
- [ ] Altera o tamanho do canvas **e** rearranja elementos elegíveis, não apenas crop global.
- [ ] Foco central e sujeito principal permanecem corretamente posicionados nos exemplos de referência, ou há aviso de baixa confiança.
- [ ] Elementos protegidos mantêm transform original.
- [ ] Textos e legendas respeitam margens seguras, sem deformação.
- [ ] Preview antes/depois e desfazer integral funcionam.
- [ ] Export final corresponde à prévia; não altera sincronização nem mixagem.
- [ ] Conversão funciona mesmo sem IA (fallback geométrico).
- [ ] Tracking não provoca deslocamentos bruscos entre quadros em testes de vídeo.

**Áreas iniciais:** apps/web/src/components/editor/panels/assets/views/settings/index.tsx, apps/web/src/commands/project/update-project-settings.ts, apps/web/src/commands/timeline, apps/web/src/preview, apps/web/src/animation, apps/web/src/rendering, apps/web/src/server-render, apps/web/src/services/renderer.

---

## F10 — Salvar e continuar projetos entre PC e celular (FASE 9 — FUTURO, baixa prioridade)

> **Decisão do proprietário (13/11/2026):** implementar **somente depois de F02 → F03 → F04 → F07 → F05 → F09 → F01 → F08**, sem alterar a ordem delas. F10 não é pré-requisito para outras melhorias. **F06 Sounds permanece adiado.**
>
> **Objetivo:** iniciar a edição no computador, pressionar **Ctrl+S** e salvar no **servidor o projeto ainda editável com todas as mídias necessárias**, sem gerar um MP4 final. Mais tarde, abrir pelo navegador do celular, continuar a **editar de verdade** e concluir o trabalho no celular ou voltar ao PC.

### Experiência de uso esperada

1. **No PC**, abrir um projeto existente e pressionar **Ctrl+S** (no Mac, **Cmd+S**); também oferecer botão visível **Salvar projeto no servidor**. Exibir `Alterações não salvas`, `Enviando mídias (X/Y)`, `Salvo e sincronizado` ou `Falha/pendente`. Capturar o atalho somente quando o editor está ativo, sem quebrar atalhos de outros campos.
2. O comando salva uma **versão não destrutiva da edição**: timeline com cortes, trims, faixas, posicionamento, efeitos, transições, keyframes, legendas, áudio, parâmetros de normalização, composições/HTML/arquivos HyperFrames e referências a assets. **Guardar também os arquivos de origem** (vídeo, áudio, imagens, GIFs e outros assets exportáveis) que ainda só existam no PC, **no armazenamento do servidor**. Não basta salvar paths como `C:\\...`, `blob:` ou `file:`; o celular não pode acessá-los.
3. Fazer **upload resumível por partes**, verificação de integridade/hash, deduplicação quando possível, limite/quota configurável e controle de espaço. O projeto só recebe status **Sincronizado** após confirmar **metadados e todas as mídias indispensáveis**; antes disso, permitir reenvio sem perder o trabalho e mostrar quais arquivos faltam. Não renderizar/achatá-lo para sincronizar.
4. **No celular**, acessar a versão web responsiva do Editor no mesmo servidor, fazer login, abrir a lista **Meus projetos** e escolher **Continuar edição**. Restaurar clipes e seus tempos, fontes, overlays, efeitos, HyperFrames e áudio com as mesmas posições/ajustes; oferecer preview e interação touch com timeline (selecionar, mover, cortar, ajustar, salvar). **Não entregar um player somente leitura.**
5. Botão **Salvar** acessível no celular (sem exigir teclado); mudanças persistem no mesmo projeto do servidor, para poder retornar ao PC. Autosave opcional/rascunhos ou checkpoints de recuperação são desejáveis; Ctrl+S/save manual continua obrigatório.
6. Separar **Salvar projeto** de **Exportar/renderizar vídeo**: salvar nunca deve exigir MP4 final, apenas armazenar estado editável e assets; exportar acontece por pedido do usuário e pode ser feito pelo serviço de render do servidor quando disponível.
7. Permitir armazenamento self-hosted persistente (volume/objeto) e configuração de capacidade, limpeza de órfãos, backup e restauração. Proxies de baixa resolução/miniaturas/ondas de áudio no celular **podem** otimizar preview, mas **originais permanecem no servidor** para edição/exportação de qualidade.
8. O acesso do celular pela **mesma LAN** pode usar URL privada protegida. Em outra rede, exigir rota HTTPS autenticada e explicitamente configurada para **frontend + mídia**. **Não confundir o túnel ngrok da F09, que expõe apenas MCP, com acesso web/mobile.** Não abrir portas publicamente sem autenticação/autorização, proteção de upload e TLS.
9. Se PC e celular abrirem o mesmo projeto simultaneamente, implementar **revisões/versionamento**, lock por projeto ou detecção explícita de conflitos e escolha de versão; não sobrescrever mudanças silenciosamente. Registrar último salvamento, dispositivo e erros de sincronização.
10. Mídias externas de URLs/embeds (F07): salvar o asset completo **somente quando o usuário tiver acesso e permissão de obtenção**; caso contrário guardar referência e explicar que visualização, disponibilidade offline e exportação podem ser limitadas. Nunca prometer download universal de YouTube/Twitch.
11. Preservar a proposta de privacidade do Editor: **armazenamento central no servidor escolhido pelo proprietário, não envio automático a serviços de terceiros**; ativar sincronização explicitamente, esclarecer consumo de disco/banda, autenticar por usuário/projeto e **não colocar tokens de IA, chaves da NVIDIA/ngrok ou segredos no projeto sincronizado**.
12. Diferenciar o que já existe do que será desenvolvido: a branch atual possui componentes de projeto, mas **não foi comprovado um fluxo completo de persistência remota de todos os originais com edição mobile**; realizar auditoria antes do primeiro PR de F10. Não declarar F10 implementado por existência de `Save` local.

### Critérios de aceitação de F10

- [ ] Um projeto com **vídeo original + música + GIF + textos/legendas + cortes + HyperFrames** salva com Ctrl+S no PC, incluindo todos os assets indispensáveis, sem renderização.
- [ ] Status `Salvo e sincronizado` só aparece após confirmar upload e integridade dos originais; teste com vídeo grande, interrupção de rede e retomada.
- [ ] Celular abre o projeto com os mesmos cortes, tempos, faixas e efeitos e pode **editar** (não apenas assistir), salvar e retomar o mesmo projeto no PC.
- [ ] Preview/proxy mobile não reduz qualidade dos originais usados na renderização.
- [ ] Projeto, assets e histórico continuam presentes após reiniciar browser/PC/servidor, com volumes persistentes e política de backup.
- [ ] Outro dispositivo não depende de `file:`/`blob:`/caminho local do PC para carregar mídias.
- [ ] Duas sessões concorrentes não causam perda silenciosa de alterações.
- [ ] Acesso LAN/externo exige autenticação; a rota do MCP F09 não é reutilizada como acesso web sem configuração independente.
- [ ] Funciona com interface touch no celular para operações fundamentais de edição e sem upload involuntário a nuvem pública.
- [ ] Nenhuma chave de API ou segredo fica exposto no projeto salvo, mídias ou logs.

**Plano detalhado:** [docs/cross-device-project-sync.md](docs/cross-device-project-sync.md).
**Áreas para auditoria inicial:** persistência/modelos de projeto em `apps/web/src/project`, gerenciamento de timeline e assets em `apps/web/src`, armazenamento Docker/volumes, autenticação em `apps/web/src/app/api/auth`, render server e UI responsiva. **Caminhos indicativos; confirmar componentes reais antes de codificar.**

---

## F06 — Sounds (ADIADO: NÃO MODIFICAR AGORA)

**Decisão de 13/11/2026:** a aba Sounds fica **inteiramente fora deste ciclo de trabalho**. Não alterar pesquisa, rolagem, favoritos, layout, filtros, catálogo ou fontes. A expansão planejada anteriormente permanece apenas como ideia de backlog, **sem prioridade, implementação ou PR nesta etapa**.

**Retomada:** somente após nova solicitação do proprietário. F06 não é pré-requisito de F02 (normalização) nem de F04 (HyperFrames).

---

## 9. Contratos transversais entre recursos

### Timeline e comandos

Definir **global-edit transaction** com:
- idempotency key, job ID, versão do projeto e timestamp;
- conjunto de faixas/clipes explicitamente incluídos/excluídos antes da operação; na fase 7, acrescentar conjunto de elementos protegidos;
- tipo de ação, parâmetros validados, prévia/diff e rollback;
- ações atômicas para Undo/Redo (ou rollback explícito ao falhar);
- validação em UI + command handler + servidor para autorização e escopo desde a fase 1; integrar política de proteção F01 na fase 7.

Criar comandos MCP assim que cada recurso estiver estável, sem aguardar F01 para áudio/IA/HyperFrames/Links. Comando ilustrativo de proteção apenas na fase 7 e conversão apenas na fase 8. Nomes exemplificativos (normalize_audio, set_global_edit_protection, convert_aspect_ratio, import_link_asset, create_hyperframes_composition, route_ai_job), **não ferramentas já existentes**.

### Render e assets

- Serviço de assets central com checksum, origem, licença, MIME, metadados, duração, disponibilidade offline e cache invalidável.
- Render offline em fila com status/progresso/cancelamento, observabilidade e segurança contra execução de páginas externas arbitrárias.
- Resolver áudio e gráficos com presets reprodutíveis; exportar usando um caminho de composição coerente com preview.
- Preservar funcionalidades n8n: mídia recebida, webhook de export, MCP e Docker/LAN.

### IA e continuidade

Pipeline sugerido:

**Solicitação -> Planejamento estruturado -> Validação de política/credenciais/capacidade -> Prévia -> Aprovação -> Execução por etapas -> Checkpoint -> Export ou conclusão.**

Em falha: registrar etapa idempotente concluída -> escolher outro modelo compatível -> reconstruir o contexto a partir do checkpoint -> validar a saída -> continuar. Não tentar transportar estado interno de streaming ou “pensamento” proprietário entre provedores.

### Segurança e privacidade

- Segredos nunca no frontend, commits ou export do projeto.
- URLs remotas processadas no backend sob allowlist, DNS revalidation, proteção anti-SSRF, quotas e limitação de rede.
- HTML/HyperFrames isolado de credenciais e rede interna.
- Usuário deve poder desligar processamento em nuvem e manter IA local.
- Direitos de mídia devem ser visíveis e auditáveis; não criar promessa de download universal.

---

## 10. Roadmap de implementação e dependências — ORDEM OBRIGATÓRIA

**Esta tabela substitui as prioridades P0/P1/P2 antigas. F01 não é fundação; Sounds está congelado.**

| Fase | ID | Entrega | Dependências obrigatórias |
|---|---|---|---|
| **1** | F02 | Normalização LUFS uniforme de clipes, faixas e mix; preview A/B e exportação | Áudio/render existentes; **sem F01** |
| **2** | F03 | **Presets NVIDIA obrigatórios Nemotron 3 Nano Omni, Kimi K3 e Gemma 4 31B**, com API key, teste real, **gerador de chamadas Node.js copiáveis**; Moonshot/Kimi K3.1 Pro independente, outros provedores e fallback | Backend de credenciais/roteador; **sem F01** |
| **3** | F04 | HyperFrames: edição assistida por Kimi com análise de vídeo, contexto de áudio/transcrição, clipes e render sincronizado horizontal/vertical | F03 para IA; pipeline de composição; **sem F01** |
| **4** | F07 | Links para imagens, GIFs, vídeos e prévia YouTube/Twitch/lives | URLs/autorização/assets; **sem F01** |
| **5** | F05 | Somente bug de rolagem dos Stickers; não alterar aparência/catálogo | Painel atual; **sem F01** |
| **6** | F09 | MCP via ngrok, URLs LAN/remota e controles de acesso na UI | MCP atual e credenciais F03; **sem F01** |
| **7 (penúltima)** | F01 | Proteção persistente de camadas/clipes, aplicada aos recursos anteriores | Áudio, IA, HyperFrames, Links, MCP já prontos |
| **8 (última do ciclo prioritário)** | F08 | Conversão inteligente com geometria, IA, tracking e proteção | F01 + F03 |
| **9 (futuro, baixa prioridade)** | F10 | **Ctrl+S salva projeto editável + mídias originais no servidor; reabrir/editar pelo celular e continuar no PC, sem renderizar** | Auditoria de persistência, armazenamento de originais, login, UI mobile, sincronização/concorrência. **Só depois das fases 1–8** |
| **Adiado** | F06 | Sounds: não alterar nada neste ciclo | Nenhuma |

### Lotes de trabalho sugeridos, na mesma ordem

1. **F02:** medidor LUFS e true peak, operação global/por clipe, seleção manual, preview, ajustes reversíveis e export.
2. **F03:** Settings IA, três presets NVIDIA (Nemotron 3 Nano Omni, Kimi K3 e Gemma 4 31B), chave NVIDIA compartilhada, gerador Node para copiar **E opção Personalizada com editor livre de código Node completo e EXECUÇÃO real isolada**, suporte a `axios`/`import`, output JSON/stream, armazenamento de scripts e integração como provedor no HyperFrames, Moonshot/Kimi K3.1 Pro por rota própria, outros provedores e fallback. Verificar disponibilidade de cada endpoint, sem prometer Kimi K3 descontinuado ou Kimi K3.1 Pro por NVIDIA.
3. **F04:** confirmar/reaproveitar base HyperFrames, **permitir selecionar também provedor Node personalizado testado na fase F03**, análise visual via Kimi/Moonshot com consentimento, transcrição e beats por serviço adequado, geração de plano de animação com timestamps, clipe na timeline, formatos 16:9/9:16 e render sincronizado.
4. **F07:** aba Links, importação permitida de imagens/GIFs/vídeos e previews YouTube/Twitch/lives, com status real de exportação.
5. **F05:** corrigir apenas o scroll dos Stickers e executar testes de não regressão.
6. **F09:** gestão ngrok, segurança, token MCP dedicado, URL LAN/remota e controles de iniciar/desligar.
7. **F01:** proteção de faixa/clipe e integração retroativa ao que já funciona; testes de comandos, IA e MCP.
8. **F08:** auto-conversão por regras geométricas, depois IA/tracking e suavização, com preview/export consistente.
9. **F10 (somente depois):** auditoria de projetos/mídias atuais; Ctrl+S + snapshot no servidor; upload persistente, retomável e verificável de todos os originais; autenticação/Meus projetos; mobile editor touch; salvar/retomar no PC; testes de interrupção, concorrência e acesso remoto seguro.

**F10 é backlog futuro após o ciclo prioritário**, sem implementações antecipadas nem bloqueios das fases anteriores. **F06 Sounds: NÃO criar tarefas, PRs ou dependências neste ciclo.** Adiar até uma instrução posterior explícita.

---

## 11. Estratégia de testes e definição de pronto

Um recurso só é considerado **concluído** quando:

1. Há testes unitários dos modelos, restrições e transformações.
2. Há testes de integração que percorrem UI -> estado do projeto -> ação -> preview -> render final.
3. Nas fases 1–6, validar escopo manual, autorização e reversibilidade **sem exigir F01**. Na fase 7 em diante, verificar também proteção F01 nas edições globais, IA, MCP, Auto Cut e conversão.
4. Persistência após save/reload, histórico Undo/Redo e projetos antigos foram verificados.
5. Há testes com timeline complexa, mídias ausentes, áudios em múltiplas faixas e dimensões diferentes.
6. Há testes de performance/memória dos recursos efetivamente modificados; testar stickers na fase 5, **sem exigir testes de expansão de Sounds** (adiado). Definir limites ao iniciar cada fase.
7. A exportação final não ignora silenciosamente nenhum elemento; se um embed não for exportável, erro pré-exportação é explícito.
8. Segurança do render, das URLs e dos tokens está coberta; falhas não deixam servidor/container acessível externamente.
9. Existe documentação de uso em PT-BR, migração de projeto e configuração Docker/LAN.
10. Passam lint, typecheck, testes automatizados e build compatíveis com o projeto; nenhuma regressão nos fluxos atuais de n8n/Ollama/MCP.

### Cenários de teste (executar por fase; os testes F01 só passam a ser exigidos na fase 7)

- **Fase 1:** 3 faixas de áudio com loudness desigual e clipes excluídos manualmente; conferir LUFS/true peak e integridade da exclusão. **Após fase 7**, repetir com uma faixa protegida.
- Auto Cut remove silêncio ao lado de faixa protegida: deve preservar sincronização ou bloquear trecho conflitante.
- Roteamento IA: modelo A responde 429 na etapa 3; modelo B recebe checkpoint 2, conclui só a etapa 3 sem repetir alterações.
- **Fase 5:** 1.000 stickers: chegar ao fim por scroll sem encobrir abas e sem alterar layout/catálogo.
- **Sounds adiado:** não executar alterações de pesquisa, filtros, scroll ou catálogo neste ciclo.
- Converter gameplay 16:9 para short 9:16 com webcam, legenda e overlay protegido; verificar centro de interesse e não sobreposição.
- **Fase 3:** HyperFrames HTML animado sincronizado ao áudio, em 16:9 e 9:16, comparando quadros da prévia/exportação e sincronismo A/V.
- Sem NVIDIA disponível, HyperFrames exibe a falha, retoma do checkpoint validado via OpenAI, depois Claude e somente por último Ollama compatível; todas as chaves são cadastradas pela UI.
- MCP remoto: entrar com token próprio por URL ngrok, executar leitura/edição autorizada, desligar túnel e confirmar inacessibilidade externa sem interromper a LAN.
- GIF local animado com transparência; iframe de site bloqueador deve mostrar erro claro.
- Tentativa de link em endereço privado/loopback redirecionado: importador bloqueia e registra erro seguro.

---

## 12. Questões técnicas a decidir durante a implementação

Essas decisões **não impedem o planejamento**, mas precisam ser documentadas em PR/ADR antes do código correspondente:

- **Decisão somente para fase 7:** a proteção do clipe prevalece sobre desbloqueio de faixa? **Padrão proposto:** faixas protegidas prevalecem e ações manuais exigem desbloqueio.
- O normalizador atua na faixa individual ou no mix completo? **Padrão proposto:** usuário escolhe; preview e metering deixam o escopo explícito.
- Quais modelos NVIDIA e provedores suportam os recursos visuais realmente necessários? **Validar capabilities, preço e quota antes de listar como disponíveis.**
- O HTML HyperFrames será guardado como fonte por projeto ou asset versionado? **Preferir fonte versionada + render cacheado.**
- Embeds externos suportam reprodução sem export; o que fazer ao renderizar? **Padrão:** impedir export silencioso e oferecer substituição por asset autorizado/snapshot quando permitido.
- Reframing de vídeo será totalmente local ou usará modelos remotos? **Priorizar local + opt-in remoto**, sempre com fallback geométrico.
- Licenças de terceiros e obras importadas: registrar por asset, bloquear redistribuição automatizada quando incompatível.

---

## 13. Fontes verificáveis e caminhos de referência

### Arquivos atuais do repositório

- apps/web/src/media/audio-mastering.ts
- apps/web/src/stickers/categories.ts
- apps/web/src/stickers/components/assets-view.tsx
- apps/web/src/sounds/components/assets-view.tsx
- apps/web/src/app/api/sounds/search/route.ts
- apps/web/src/automation/components/assets-view.tsx
- apps/web/src/automation/components/ollama-assistant.tsx
- apps/web/src/automation/components/connections.tsx
- apps/web/src/components/editor/panels/assets/views/settings/index.tsx
- apps/web/src/project/components/project-info-dialog.tsx
- apps/mcp/src/server.ts
- docs/lan-automation.md

### Documentação externa (revalidar versões no começo de cada fase)

- FFmpeg loudnorm/EBU R128: https://ffmpeg.org/ffmpeg-filters.html#loudnorm
- NVIDIA NIM Developer FAQ: https://docs.api.nvidia.com/nim/docs/product
- ngrok Quickstart (authtoken x API Key): https://ngrok.com/docs/start
- ngrok HTTP Agent Endpoints e segurança: https://ngrok.com/docs/gateway/endpoints/http
- HyperFrames studio: https://hyperframes.app/docs/5-packages/studio
- HyperFrames producer: https://hyperframes.app/docs/5-packages/producer
- HyperFrames core: https://hyperframes.app/docs/5-packages/core
- YouTube official IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube API developer policies: https://developers.google.com/youtube/terms/developer-policies
- MDN CSP frame-ancestors: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

---

## 14. Histórico e status

- **2026-11-13 (continuidade PC ↔ celular):** adicionada **F10**, após todas as oito prioridades existentes. Planejado **Ctrl+S salva estado editável e todos os arquivos originais no servidor sem render**, status de sincronização, reabertura e edição real por celular, retorno ao PC, autenticação, versionamento, upload resumível, armazenamento persistente e preview/proxy mobile; detalhes em `docs/cross-device-project-sync.md`. **Apenas documentação; nenhuma implementação.**
- **2026-11-13 (execução Node personalizada):** esclarecimento do requisito: usuário deve poder **colar um arquivo Node.js inteiro e executar de verdade no Editor**, com `axios`, imports, streaming, credenciais por variáveis de ambiente, logs, salvar como provedor e usar no HyperFrames. Apenas gerar/copiar código **não atende**. Planejado runner isolado com segurança; referência `docs/custom-node-api-runner.md`. **Somente documentação, sem implementação.**
- **2026-11-13 (presets NVIDIA e código Node):** estabelecida inclusão obrigatória de **Nemotron 3 Nano Omni**, **Kimi K3** e **Gemma 4 31B** nos cartões NVIDIA; um token NVIDIA configurado na UI, teste real e **gerador/copiador de chamadas Node.js** com prompt editável. Página individual Kimi K3 indica **Free Endpoint Deprecated**, portanto modelo fica listado sem promessas até teste autenticado. Criada referência `docs/nvidia-api-node.md`. **Somente documentação, nenhum editor/integração implementado.**
- **2026-11-13 (integração Kimi):** verificada documentação oficial de **Kimi K3.1 Pro**, suporte a entrada de vídeo e texto como saída. A página NVIDIA Build ainda declara API programática indisponível para esse modelo; incluído **adaptador Moonshot API** com token pela UI, endpoint/modelo verificados, e plano F04 para análise visual + transcrição/áudio separado + geração/execução de HyperFrames. **Somente documentação, sem código, credenciais ou chamadas pagas.**
- **2026-11-13:** **reorganização de planejamento conforme proprietário:** F02 > F03 > F04 > F07 > F05 > F09 > F01 > F08; F06 (Sounds) adiado. F01 não bloqueia as primeiras seis fases. F03 ganhou IA personalizada em JavaScript/Node.js e preferência NVIDIA; F04 ganhou áudio sincronizado e 16:9/9:16; F05 limitado a scroll; F07 priorizado para mídias e links. **Somente documentação: nenhum código de funcionalidade alterado.**
- **2026-11-12:** adicionado **F09** (MCP externo por **ngrok exclusivamente**, com ativação/desativação pela aba MCP, URLs LAN/remota, gestão de Authtoken/API Key, segurança e testes); detalhados F03/F04 para configuração de IA por interface e fallback de HyperFrames NVIDIA -> OpenAI -> Claude -> Ollama. **Somente documentação; código não alterado.**
- **2026-11-10:** criada primeira especificação consolidada a partir dos requisitos do proprietário e inspeção dos arquivos da branch main. **Somente documentação planejada; nenhum recurso implementado, instalação iniciada ou teste executado nesta etapa.**
- Os próximos PRs devem atualizar este arquivo com status de cada Fxx: Planejado / Em andamento / Testado / Concluído / Bloqueado, link para PR/commit, data e evidência de teste.
