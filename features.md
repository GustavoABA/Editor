# FEATURES.md — Plano de evolução do Editor (OpenCut Classic / ORUME)

> **Estado:** planejamento técnico; nenhuma funcionalidade abaixo foi implementada por este documento.
>
> **Criado em:** 2026-11-10
>
> **Repositório:** https://github.com/GustavoABA/Editor
>
> **Base consultada:** branch main na data indicada. O projeto já inclui Next.js/React, Rust/WASM, processamento e exportação local, MCP, Auto Cut, Ollama, n8n, Stickers, Sounds e controles de proporção de tela. O roadmap propõe **evoluir e corrigir** esses recursos, sem refazê-los desnecessariamente.

## 0. Objetivo, princípios e escopo

Transformar o Editor em um ambiente de edição de vídeo com **operações globais seguras**, automações por IA, animações HTML/HyperFrames, importação de mídias autorizadas, bibliotecas navegáveis e adaptação inteligente de formatos para vídeos horizontais e verticais.

Princípios obrigatórios:

1. **Edição não destrutiva:** preservar arquivos de origem e registrar as transformações como estado reversível; oferecer visualização antes de aplicar e Undo/Redo.
2. **Respeitar proteção de camadas e clipes** em toda ação automatizada/global (Auto Cut, áudio, conversão de formato, IA, MCP e extensões).
3. **Preview = exportação:** não declarar um elemento exportável apenas porque ele aparece no navegador; o render deve produzir o mesmo resultado ou explicar por que não é possível.
4. **Uma única representação de projeto/timeline:** evitar divergência entre preview web, exportação no servidor, Rust/WASM e comandos MCP.
5. **IA assistiva e verificável:** roteador multi-provedor, planos validados, checkpoints, confirmação de alterações e comportamento determinístico.
6. **Segurança, direitos e custos:** credenciais só no backend, permitir apenas fontes autorizadas, proteger acesso de rede, expor custos/limites dos provedores e não presumir acesso gratuito ilimitado.
7. **Acessibilidade e performance:** painéis com rolagem real, busca funcional, navegação por teclado, listas grandes virtualizadas e telas responsivas.
8. **Compatibilidade:** preservar projetos anteriores, carregar corretamente projetos com novos campos e suportar o self-host Docker/LAN.

### Estado atual identificado no código (não confundir com implementação nova)

| Área | Já existe no código | Lacuna proposta |
|---|---|---|
| Áudio | apps/web/src/media/audio-mastering.ts: limitador de picos e tratamento de buffer | Normalização perceptual em LUFS, seletiva, reversível e consistente no export |
| Stickers | Busca, abas All/Flags/Shapes e contêiner overflow-y-auto | Corrigir scroll efetivo e altura, acrescentar categoria **Stickers**, ampliar catálogo e navegação |
| Sounds | Pesquisa, Freesound, ScrollArea, busca paginada e favoritos | Corrigir scroll observável, filtros, tratamento de licenças e ampliar fontes legalmente integráveis |
| Automação | Ollama, Auto Cut e conexões n8n/MCP | Multi-IA, continuidade por checkpoints e HyperFrames |
| Proporção | Project info/Settings permite trocar o tamanho do canvas | Reposicionar inteligentemente **todos os elementos editáveis** da composição |
| HyperFrames | Não foi localizada uma integração dedicada no projeto na inspeção | Novo painel e pipeline de composição + render |
| Importação por link | Não foi localizada aba específica de Links na inspeção | Importadores autorizados, embeddings e captura exportável quando tecnicamente possível |

> **Não implementado** significa que a integração nova não foi identificada na inspeção; sempre pesquisar novamente o código antes de abrir PR. **Problema reportado** (como ausência de scroll na prática) não significa que o código correspondente não exista.

---

## F01 — Proteção de camada/clipe contra edição geral (P0 — fundação)

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

## F02 — Normalizador global de áudio por loudness (P1)

### UX

- Novo comando **“Normalizar áudio”** no grupo de operações gerais e na aba IA & Automação.
- Escopo padrão: **todo o projeto, exceto faixas/clipes protegidos**; opção para “somente selecionados” e escolha explícita de faixas.
- Perfis iniciais configuráveis (valores sugeridos, não obrigação de plataforma):
  - **Voz/vídeo online:** alvo inicial -16 LUFS integrados, true peak máximo -1,5 dBTP;
  - **Podcast/voz estéreo:** alvo inicial -16 LUFS; mono opcional -19 LUFS;
  - **Personalizado:** LUFS integrado, limite de true peak, loudness range e método.
- Exibir análise **antes/depois**: LUFS integrados, true peak, ganho previsto, faixas incluídas/protegidas e possibilidade de clipping.
- Modos: normalizar **cada faixa elegível** ou **o mix elegível**; informar que normalizar cada elemento isoladamente não garante nível uniforme do mix final.
- Manter música e voz com balanço coerente: prévia A/B, controle de volume, opção futura de ducking de trilha; não comprimir dinâmicas sem avisar.
- Preservar sincronização, fade, mixagem e keyframes de volume sempre que possível.

### Implementação proposta

1. Reaproveitar o pipeline atual de áudio. **audio-mastering.ts implementa limiter/clamping de picos, não medição de LUFS**.
2. Utilizar análise de loudness EBU R128, com opção de cálculo em **duas passagens** via FFmpeg/loudnorm no serviço de render, conferindo suporte real no ambiente Docker.
3. Salvar parâmetros de normalização como efeito/ganho não destrutivo por faixa ou clipe, sem regravar o vídeo original.
4. Definir ponto de aplicação na cadeia: áudio original -> volume/keyframes e efeitos por faixa -> normalização conforme escopo -> mix -> limiter/true peak final (ordem exata validada em testes).
5. Compartilhar as mesmas configurações no **preview** e no **render final**; se a implementação de preview diferir do render, indicar e medir o desvio.
6. Casos especiais: áudio sem sinal, fontes corrompidas, vídeo com múltiplos canais, silêncio, voz muito baixa, arquivos enormes, troca de sample rate.
7. Expor operação via MCP e roteador IA apenas após a política F01 estar pronta.

### Critérios de aceitação

- [ ] Um botão executa a análise e oferece aplicar/cancelar.
- [ ] Faixas protegidas não recebem ganho nem alteração de seus parâmetros.
- [ ] Resultado respeita alvo e limite de pico dentro de tolerância definida nos testes.
- [ ] Preview e export são coerentes; nenhuma alteração de duração/sincronização.
- [ ] Undo/Redo, persistência e reabertura funcionam.
- [ ] Testes com diálogo, música, silêncio, clipes concatenados e faixas sobrepostas.

**Áreas iniciais:** apps/web/src/media/audio-mastering.ts, apps/web/src/core/managers/audio-manager.ts, apps/web/src/timeline/audio-state.ts, apps/web/src/server-render, apps/web/src/automation.

**Referência técnica:** https://ffmpeg.org/ffmpeg-filters.html#loudnorm

---

## F03 — Settings > IA: provedores, modelos e roteamento com fallback (P1)

### Localização e aparência

- Na **engrenagem/Settings**, adicionar área **IA**, próxima às configurações de integração/MCP. Usar seção dedicada, sem ocultar o MCP existente.
- Listar provedores em cartões configuráveis e ordenáveis:
  - **Ollama (local)**;
  - **NVIDIA NIM / API Catalog**;
  - **OpenAI API**;
  - **Anthropic (Claude API)**;
  - **DeepSeek API**;
  - **Outros** por adaptador que atenda contrato do roteador.
- Cada item deve oferecer: habilitar/desabilitar, modelo, status de conexão, configuração de chave no servidor, teste de conexão, prioridade de fallback, capacidade suportada, limite de custo/tokens e indicação se o serviço é local ou em nuvem.
- Modelo padrão **por tipo de tarefa** (planejamento de edição, entendimento de texto, visão/análise visual, geração de composição HyperFrames, revisão de resultados); não presumir que todos suportam imagens/áudio.
- Modos: automático por prioridade/capacidade, preferir modelos locais, menor custo e manual.
- Mostrar provedor efetivamente utilizado e eventos de troca (“NVIDIA indisponível; retomado no Ollama a partir do checkpoint 3”).
- Sem cobrança surpresa: sinalizar quando um modelo pode consumir créditos ou ter cobrança; permitir exigir confirmação para uso pago.

### Arquitetura

- Serviço **AI Provider Router** exclusivamente backend; interface padronizada de capabilities, modelos, invocação, limites, erro e cancelamento.
- Credenciais em cofre/variáveis protegidas no servidor, mascaradas na UI, nunca incluídas no projeto, no browser bundle, nos logs ou na timeline.
- Distinguir falhas **retriáveis** (timeout/5xx/429, com backoff e respeito ao Retry-After) de falhas **não retriáveis** (sem permissão, parâmetros inválidos, custo bloqueado); circuit breaker e cooldown.
- Persistir **jobs estruturados**, checkpoints e eventos: job ID, snapshot/revisão do projeto, etapa executada, entrada saneada, saída validada, ações já confirmadas e ações pendentes.
- **Fallback não “continua magicamente” uma geração interrompida.** A transferência acontece no último checkpoint validado; o novo modelo recebe um resumo de estado, dados necessários e o contrato de saída. Respostas parciais inválidas são descartadas.
- JSON/schema de plano com validação estrita, operação idempotente quando aplicável, limite de tentativas, prevenção de duplicidade, revalidação F01 e aprovação antes de mutação da timeline.
- Concorrência: fila por projeto, lock de versão/revisão otimista, interrupção/cancelamento, persistência após reload; não deixar duas IAs editarem o mesmo projeto simultaneamente sem isolamento.
- Verificar privacidade: arquivos de mídia NÃO devem ser enviados à nuvem por padrão; solicitar opt-in por tipo de mídia.
- Observabilidade sem vazamento: métricas de latência, quantidade de tokens/custo quando fornecidos, motivo do fallback e logs redigidos.

### NVIDIA: condição real, não promessa

A NVIDIA documenta acesso gratuito a endpoints NIM para **prototipagem** mediante Developer Program, o que **não equivale** a APIs irrestritas, disponibilidade para qualquer modelo ou uso gratuito ilimitado em produção. Conferir elegibilidade, quotas, termos, modelos e tarifas atuais antes de ativar.

Fonte oficial: https://docs.api.nvidia.com/nim/docs/product

### Critérios de aceitação

- [ ] Usuário cadastra e testa individualmente ao menos Ollama, NVIDIA NIM, OpenAI, Anthropic e DeepSeek (quando há credenciais e endpoints válidos).
- [ ] Ranking e escolha de modelo persistem por usuário/servidor, com configuração clara.
- [ ] Em falha retriável, um segundo provedor compatível recebe somente o estado validado e conclui o próximo passo.
- [ ] Erros de autenticação, custo ou capacidade inadequada produzem mensagens compreensíveis sem loop infinito.
- [ ] Nunca expor chaves no navegador, código-fonte, logs ou histórico MCP.
- [ ] A IA não consegue modificar item protegido nem aplicar plano não validado.
- [ ] Job pode ser retomado após reiniciar a interface sem repetir ações já aplicadas.

**Áreas iniciais:** apps/web/src/automation, apps/web/src/app/api/automation, apps/web/src/server-automation, apps/web/src/env, apps/mcp/src/server.ts, componentes da área de Settings.

---

## F04 — HyperFrames dentro de IA & Automação (P2)

### Posição exigida

Na aba **IA & Automação**, manter Assistente e Auto Cut. **Depois do bloco Auto Cut**, ao rolar para baixo, mostrar uma seção expansível ou subaba **HyperFrames**; a lista deve permitir rolagem independente quando necessário.

### Fluxos pretendidos

1. Criar uma **composição animada** com HTML/CSS/JS e/ou por instrução textual à IA.
2. Escolher duração, resolução, FPS e fundo transparente quando houver suporte.
3. Editar/visualizar propriedades e templates: títulos, lower thirds, anúncios, stickers animados, contadores, banners, composição de GIF/HTML, overlays para vídeo.
4. Pré-visualizar com controles Play/Pause/Seek e inserir a composição como um **clipe temporizado na timeline** do Editor.
5. Movimentar, cortar duração, organizar sobre outras faixas, pré-compor, alterar escala e parâmetros; respeitar F01.
6. Exportar o projeto com o clipe renderizado corretamente, incluindo áudio quando compatível.
7. Permitir que IA gere/edite **uma representação declarativa de composição** e solicite renderização; sempre exigir revisão e permitir desfazer.
8. Guardar templates reutilizáveis locais, com miniaturas e metadados de versão. Criar no futuro biblioteca ORUME para anúncios de live.

### Integração técnica proposta

- Validar licença/versão da distribuição HyperFrames e compatibilidade com Node/Bun e ambiente Docker.
- Pesquisar uso combinado dos pacotes documentados:
  - **@hyperframes/studio**: editor/preview incorporável;
  - **@hyperframes/core**: parsing, validação e composição estruturada;
  - **@hyperframes/player**: reprodução de composições;
  - **@hyperframes/producer** ou CLI: conversão HTML -> MP4/WebM via FFmpeg.
- Não simplesmente colocar outro editor desconectado: criar **HyperFramesClip** ou objeto de composição associado a assets/versionamento e timeline.
- Mapeamento temporal: frame rate, início/fim, keyframes, transições, áudio, dimensões, offset de tempo.
- Estratégia de render: composição HTML segura -> serviço isolado/captura determinística -> asset cacheado com hash -> compositor da timeline -> export final.
- Pré-renderizar quando a renderização interativa ficar pesada. Invalidar cache quando composição, fonte, duração, tamanho ou parâmetros mudarem.
- Isolar HTML/JS de terceiros em sandbox, com allowlist de recursos e sem acesso à rede interna, tokens ou filesystem do host. Definir política CSP; proibir scripts arbitrários não confiáveis por padrão.
- Quando uma composição tiver assets remotos, exigir resolução prévia ou mostrar dependência externa e seus efeitos na exportação.

### Critérios de aceitação

- [ ] HyperFrames aparece abaixo de Auto Cut com rolagem funcional.
- [ ] Composição HTML simples pode ser criada, editada, pré-visualizada e adicionada à timeline.
- [ ] Render e preview exibem mesmos elementos, tempos e posições em testes determinísticos.
- [ ] Render final funciona sem usuário precisar gravar a tela.
- [ ] Proteções F01 e Undo/Redo funcionam para composições.
- [ ] Conteúdo malicioso e URLs internas não obtêm acesso à infraestrutura.

**Referências oficiais:**
- https://hyperframes.app/docs/5-packages/studio
- https://hyperframes.app/docs/5-packages/core
- https://hyperframes.app/docs/5-packages/producer
- https://hyperframes.app/docs/3-guides/4-rendering

---

## F05 — Stickers: categoria visível, busca e rolagem (P1 — UX)

### Comportamento desejado

- No cabeçalho das subcategorias existentes (All, Flags, Shapes), incluir **Stickers** **ao lado de Shapes**; a área já tem busca: melhorar, não duplicar.
- Separar visualmente **Stickers** (adesivos/emojis/figuras) de **Shapes** (formas) e **Flags**. “All” agrega todas as fontes disponíveis.
- Barra de pesquisa fixa ao topo do painel, filtragem por nome/tags/categoria; resultados rápidos e feedback quando não há itens.
- Lista/grade **com scroll vertical próprio**, sem ficar encoberta por abas inferiores ou por container pai. Rolagem com mouse, touchpad, toque e teclado.
- Abas horizontais não devem sobrepor a lista, nem desaparecer. Controlar overflow e min-height em todos os ancestrais flex.
- Layout responsivo, lazy loading, paginação/virtualização quando houver catálogo grande, preview nítido e indicação de falha de carregamento.
- Considerar importação de pack de stickers pelo usuário, observando licença/atribuição.

### Diagnóstico guiado pelo código

- apps/web/src/stickers/categories.ts lista All, Flags e Shapes; acrescentar categoria Stickers e adequar tipos/provider/registry.
- apps/web/src/stickers/components/assets-view.tsx **já tem Input e overflow-y-auto**. Reproduzir em viewport pequeno com centenas de itens; inspecionar altura dos contêineres, tab bar, z-index, roda do mouse, flex-1/min-h-0 e seletor de scroll correto.
- Conferir que a busca atual não perde categoria, resultados e posição ao alternar abas.

### Critérios de aceitação

- [ ] Aba Stickers posicionada ao lado de Shapes.
- [ ] Centenas de itens podem ser acessados do primeiro ao último.
- [ ] Busca retorna itens corretos por nome e mantém filtragem selecionada.
- [ ] Drag-and-drop para timeline continua funcional.
- [ ] Sem sobreposição, vazamento de scroll ou regressão em tela pequena.
- [ ] Acessível via teclado, com labels e loading.

---

## F06 — Sounds: consertar scroll, pesquisa e catálogo ampliado (P1/P2)

### Comportamento desejado

- Corrigir rolagem vertical do painel Sounds e da aba Saved, mantendo a pesquisa/filtros visíveis.
- Manter a busca existente e adicionar filtros progressivos: duração, tipo (efeito/música/ambiente), licença, uso comercial, fonte e favoritos.
- Paginação/infinite scroll confiável, indicação de carregamento, fim de resultados e preservação de posição ao voltar à aba.
- Biblioteca de efeitos, música e áudio ambiente **com origem e licenças visíveis por asset**; botão ouvir e inserir na timeline.
- Aumentar fontes públicas **quando o serviço permitir integração em editor**. Prioridade: aprimorar Freesound já existente; avaliar bibliotecas com API/licença adequada antes de integrar.
- Criar biblioteca **local de sons do usuário** com categorias e tags e importação de arquivos autorizados.
- Nunca presumir que “grátis para usar em um vídeo” significa “grátis para redistribuir dentro de uma biblioteca ou app”. Validar licença de conteúdo, API e termos individualmente.

### Diagnóstico do código

- apps/web/src/sounds/components/assets-view.tsx **já usa ScrollArea, busca, saved e useInfiniteScroll**.
- apps/web/src/app/api/sounds/search/route.ts **já usa Freesound**. Investigar integração, validade da chave, paginação, filtragem de licenças e erros.
- Há um alerta de revisão: verificar se **commercial_only** foi realmente repassado do query parsing ao backend e se a consulta jamais inclui material não comercial no filtro de uso comercial. Não assumir que o filtro atual é suficiente sem teste.
- Diagnosticar scroll da ScrollArea e containers TabsContent/parent com pequeno viewport.

### Critérios de aceitação

- [ ] Scroll funciona com resultados e favoritos em desktop/mobile.
- [ ] Busca, paginação e troca de abas preservam estado correto.
- [ ] Cada arquivo mostra título, origem, licença e, quando necessário, atribuição.
- [ ] Filtro “uso comercial” exclui licenças incompatíveis nos testes.
- [ ] Upload de áudio próprio e inserção na timeline funcionam.
- [ ] Novos catálogos entram somente após checagem documentada de API/licença.

**Fonte para avaliar, não incorporar automaticamente:** https://freesound.org/

---

## F07 — Links: YouTube, Twitch, Pinterest/GIF, arquivos externos e iframe (P2/P3)

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
- [ ] Link direto de MP4 e GIF autorizado é importado e renderiza.
- [ ] GIF animado com loop, timing e transparência compatíveis.
- [ ] YouTube e Twitch abrem embed oficial quando permitido e indicam status real de exportação.
- [ ] Link Pinterest não promete GIF caso o pin não exponha arquivo permitido.
- [ ] Iframe retorna aviso quando o site bloqueia incorporação; render não produz vídeo vazio silenciosamente.
- [ ] Falhas de URL, permissão, CORS, timeout e export mostram diagnóstico claro.
- [ ] Testes de SSRF, URLs encurtadas/redirects e embeds maliciosos passam.

**Referências:** 
- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/terms/developer-policies
- https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

---

## F08 — Project Info > **Auto-converter formato** (P2 — recurso principal)

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

## 9. Contratos transversais entre recursos

### Timeline e comandos

Definir **global-edit transaction** com:
- idempotency key, job ID, versão do projeto e timestamp;
- conjunto de faixas/clipes permitidos e protegidos calculado antes da operação;
- tipo de ação, parâmetros validados, prévia/diff e rollback;
- ações atômicas para Undo/Redo (ou rollback explícito ao falhar);
- validação em UI + command handler + servidor, aplicando política F01.

Criar comandos MCP **apenas após implementação estável**, por exemplo: normalize_audio, set_global_edit_protection, convert_aspect_ratio, import_link_asset, create_hyperframes_composition e route_ai_job. Estes nomes são **propostas**, não ferramentas já existentes.

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

## 10. Roadmap de implementação e dependências

| Fase | Entregas | Dependências | Prioridade |
|---|---|---|---|
| **0 — Fundação e testes** | Auditoria dos modelos de projeto, contratos de comandos, testes de preview/export, diagnóstico de scroll | Base atual | P0 |
| **1 — Proteções** | F01 por layer/clipe, políticas para comandos, Undo/Redo e MCP | Fase 0 | P0 |
| **2 — UX e áudio** | F05 Stickers, F06 scroll/pesquisa/licenças, F02 normalizador LUFS | F01 para normalizador | P1 |
| **3 — IA roteada** | F03 provedores, Settings IA, checkpoints e fallback real | F01 + infraestrutura de jobs | P1 |
| **4 — Geometria inteligente** | F08 modal e conversão geométrica, depois visão/tracking IA | F01 e F03 para modo IA | P2 |
| **5 — HyperFrames** | F04 painel, composição, clipe, render server e IA | F01 + pipeline de assets + F03 opcional para geração | P2 |
| **6 — Links e embeds** | F07 URLs diretas/GIF, previews oficiais e iframe com diagnósticos | Pipeline de assets + render isolado | P2/P3 |
| **7 — Polimento** | Performance, regressão, mobile, docs, observabilidade, licenças | Todas anteriores | P2 |

**Ordem de valor rápido:** primeiro corrigir scroll/categorias, implantar proteção e normalização; depois roteador IA; em seguida conversão inteligente; por fim HyperFrames e importação externa complexa. Dependências permitem entregar UX em paralelo à fundação.

### Subtarefas sugeridas para PRs pequenos

- **PR-01:** testes de regressão e auditoria do modelo de projeto.
- **PR-02:** proteção persistida + ícones/toggles de faixa/clipe.
- **PR-03:** enforcement F01 em todos os comandos globais/Auto Cut/MCP.
- **PR-04:** Stickers category + scroll/catálogo.
- **PR-05:** Sounds scroll + revisão de licenças/filtro e busca.
- **PR-06:** análise LUFS e preview de aplicação.
- **PR-07:** efeitos não destrutivos de normalização e integração com render.
- **PR-08:** Settings > IA + armazenamento seguro e modelos de capability.
- **PR-09:** adaptadores e teste de NVIDIA/OpenAI/Anthropic/DeepSeek/Ollama.
- **PR-10:** jobs/checkpoints/fallback e testes de injeção de falhas.
- **PR-11:** Auto-converter geométrico com preview/diff e Undo.
- **PR-12:** reframing de vídeo e IA por keyframes suavizados.
- **PR-13:** HyperFrames studio/player/producer em ambiente isolado.
- **PR-14:** clipe HyperFrames na timeline e export real.
- **PR-15:** Links: importação de arquivos diretos/GIF permitidos.
- **PR-16:** YouTube/Twitch/Pinterest embeds e status de exportabilidade.
- **PR-17:** Web/iframe com sandbox/captura autorizada e testes anti-SSRF.
- **PR-18:** documentação de operação, compatibilidade e checklist release.

---

## 11. Estratégia de testes e definição de pronto

Um recurso só é considerado **concluído** quando:

1. Há testes unitários dos modelos, restrições e transformações.
2. Há testes de integração que percorrem UI -> estado do projeto -> ação -> preview -> render final.
3. Proteção F01 foi verificada contra ação manual, global, IA, MCP, Auto Cut e conversão de formato quando aplicável.
4. Persistência após save/reload, histórico Undo/Redo e projetos antigos foram verificados.
5. Há testes com timeline complexa, mídias ausentes, áudios em múltiplas faixas e dimensões diferentes.
6. Há testes de performance e memória com dezenas/centenas de clips e centenas/milhares de stickers/sounds no catálogo; limites definidos na fase 0.
7. A exportação final não ignora silenciosamente nenhum elemento; se um embed não for exportável, erro pré-exportação é explícito.
8. Segurança do render, das URLs e dos tokens está coberta; falhas não deixam servidor/container acessível externamente.
9. Existe documentação de uso em PT-BR, migração de projeto e configuração Docker/LAN.
10. Passam lint, typecheck, testes automatizados e build compatíveis com o projeto; nenhuma regressão nos fluxos atuais de n8n/Ollama/MCP.

### Cenários de teste prioritários

- 3 faixas de áudio, uma protegida, com normalization em massa; conferir LUFS e integridade da faixa protegida.
- Auto Cut remove silêncio ao lado de faixa protegida: deve preservar sincronização ou bloquear trecho conflitante.
- Roteamento IA: modelo A responde 429 na etapa 3; modelo B recebe checkpoint 2, conclui só a etapa 3 sem repetir alterações.
- 1.000 stickers: buscar item distante e chegar ao fim por scroll sem encobrir abas.
- Sounds: buscas longas com filtro de licença comercial, paginação, favoritos e scroll.
- Converter gameplay 16:9 para short 9:16 com webcam, legenda e overlay protegido; verificar centro de interesse e não sobreposição.
- HyperFrames HTML animado em clip sobreposto; comparação visual de frames selecionados entre preview e render.
- GIF local animado com transparência; iframe de site bloqueador deve mostrar erro claro.
- Tentativa de link em endereço privado/loopback redirecionado: importador bloqueia e registra erro seguro.

---

## 12. Questões técnicas a decidir durante a implementação

Essas decisões **não impedem o planejamento**, mas precisam ser documentadas em PR/ADR antes do código correspondente:

- A proteção do clipe prevalece sobre desbloqueio de faixa? **Padrão proposto:** faixas protegidas prevalecem e ações manuais exigem desbloqueio.
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
- HyperFrames studio: https://hyperframes.app/docs/5-packages/studio
- HyperFrames producer: https://hyperframes.app/docs/5-packages/producer
- HyperFrames core: https://hyperframes.app/docs/5-packages/core
- YouTube official IFrame Player API: https://developers.google.com/youtube/iframe_api_reference
- YouTube API developer policies: https://developers.google.com/youtube/terms/developer-policies
- MDN CSP frame-ancestors: https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/frame-ancestors

---

## 14. Histórico e status

- **2026-11-10:** criada primeira especificação consolidada a partir dos requisitos do proprietário e inspeção dos arquivos da branch main. **Somente documentação planejada; nenhum recurso implementado, instalação iniciada ou teste executado nesta etapa.**
- Os próximos PRs devem atualizar este arquivo com status de cada Fxx: Planejado / Em andamento / Testado / Concluído / Bloqueado, link para PR/commit, data e evidência de teste.
