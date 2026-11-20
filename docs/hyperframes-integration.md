# Integração HyperFrames oficial — `teste/implementacao`

> **Status: implementação experimental na branch de teste; o código de integração existe, mas a execução real do worker HyperFrames, o WebM transparente e o fluxo ponta a ponta exigem homologação.** Não mergear para `main` sem aprovação do proprietário.

## Por que usar o HyperFrames oficial?

O framework open source [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) renderiza HTML/CSS em WebM ou MP4 com Chrome + FFmpeg e tem uma CLI dedicada. A integração anterior do Editor apenas criava textos por batidas. Esta implementação adiciona **composição livre de HTML/CSS (sem JavaScript arbitrário)**, transcrição semântica e renderização pelo mecanismo oficial.

Documentação técnica da CLI: https://hyperframes.app/docs/5-packages/cli.

## Iniciar no servidor self-hosted

1. Gere e configure **dois segredos diferentes** no `.env`: `OPENCUT_LAN_SYNC_TOKEN` (já usado pelo Editor LAN, pelo menos 16 caracteres) e `HYPERFRAMES_INTERNAL_TOKEN` (novo, pelo menos 16 caracteres).
2. Para compreensão de áudio por CPU, configure também `PARAKEET_INTERNAL_TOKEN` e suba o perfil opcional transcription:
   `docker compose --profile transcription up -d --build parakeet`.
3. Para renderizar HTML/CSS com o HyperFrames oficial:
   `docker compose --profile hyperframes up -d --build hyperframes-render web`.
   O renderer usa Node 22, Chromium e FFmpeg, instala a CLI oficial do npm no **build** e roda em um contêiner isolado. O build inicial precisa de rede para instalar dependências; o worker **não tem acesso de saída à internet em execução**.
4. Entre no Editor LAN e configure o token no painel de sincronização. Abra **IA & Automação → HyperFrames oficial · HTML/CSS + IA**.
5. A API `GET /api/hyperframes/render`, com cabeçalho `x-lan-sync-token`, informa disponibilidade do worker. `POST /api/hyperframes/render` devolve um WebM renderizado. O worker é interno; **não há porta pública exposta**.

**Compatibilidade:** o overlay é WebM VP9 com alfa, suportado para preview sobretudo por Chromium. Em Safari e em alguns pipelines de exportação, a transparência pode falhar; valide o formato final antes de concluir a feature.

## Fluxo no editor

1. Selecione um projeto e defina posição e duração (0,3 a 12 segundos).
2. Clique em **Analisar fala e música da timeline**. O Editor lê a trilha local, identifica picos sonoros e transcreve com **Parakeet CPU** (Docker) ou **Whisper no navegador**. Você também pode colar e corrigir a transcrição manualmente.
3. Digite o briefing e clique em **Gerar HTML/CSS com IA e contexto do áudio**. O modelo recebe apenas o resumo dos elementos da timeline, transcrição textual/timestamps e picos de volume. **O arquivo de áudio não é enviado à IA externa**; o texto da transcrição pode ser transmitido ao provedor configurado no cofre, somente após a ação explícita do usuário.
4. Revise o HTML e o CSS em campos editáveis. A prévia usa iframe **sandbox sem scripts** e CSP que bloqueia rede e fontes externas.
5. Clique em **Renderizar e inserir/atualizar na timeline**. O web encaminha um JSON limitado ao worker, que valida e higieniza os elementos e renderiza WebM com a CLI oficial. O navegador registra o arquivo no mesmo armazenamento de mídias e insere uma faixa de vídeo de sobreposição.
6. O HTML/CSS e resumo ficam armazenados como parâmetros do clipe, e podem ser reabertos com **Carregar HTML/CSS do clipe selecionado**. Re-renderizar um clipe selecionado atualiza a mídia daquela instância (o arquivo anterior permanece na biblioteca para não quebrar referências).

## Isolamento e limites

- Nenhum JavaScript, script remoto, iframe, SVG, form, CSS `url()`, `@import`, `@font-face` ou recursos externos do código gerado é aceito no renderizador.
- HTML permitido: div, section, headings, spans, tables, listas e texto; estilos devem ser inseridos no campo CSS. Não há execução de HTML diretamente no DOM privilegiado do Editor.
- Worker sem credenciais de IA, banco ou armazenamento, rede Docker interna, usuário sem privilégios, filesystem read-only e tmpfs; uma renderização por vez.
- Duração máx. 12s, FPS 24/30, resolução máx. 1920 e cerca de 2 megapixels, arquivo de saída máx. 55MiB, HTML/CSS individual máx. 26KB, limite de execução 210s.
- **Limite atual:** o código-fonte da composição é recuperável e editável no painel, mas **não há edição gráfica individual de cada elemento HTML diretamente na tela da timeline**. Alterações em HTML/CSS requerem re-render. Não há bibliotecas de imagens remotas nem execução livre de JavaScript gerado.
- Transcrição e reconhecimento de tópicos são fases distintas: Parakeet/Whisper produzem palavras/timestamps; a **interpretação semântica** é feita por um LLM configurado. Sem fala detectada, não afirmar que a IA entendeu conteúdo verbal.

## Matriz de validação obrigatória

- [ ] `node --check services/hyperframes/server.mjs` no CI.
- [ ] Next build e testes automatizados Linux; Windows/macOS devem ser verificados separadamente.
- [ ] `docker compose --profile hyperframes build hyperframes-render` e `docker compose --profile hyperframes up -d hyperframes-render web` com segredos válidos.
- [ ] GET health com token correto, sem token, token errado e worker desligado.
- [ ] Render de composição 16:9 e 9:16 (com HTML/CSS de vários elementos); checar saída, alfa e FPS.
- [ ] Projetos de vídeo com timeline existente: sobreposição não altera a mídia original, exporta sincronizada.
- [ ] Editar fonte do clipe selecionado, re-renderizar, salvar projeto, reabrir via LAN no segundo dispositivo.
- [ ] Confirmar ausência de acesso a arquivos internos e recursos externos com HTML/CSS malicioso; testar payload acima do limite.
- [ ] Parakeet PT-BR e Whisper: confirmar timestamps; verificar falas rápidas, silêncio e ruído.
- [ ] Validar tema, números citados e cortes de assunto com LLM local e externo; verificar alucinações e dados de legenda.
- [ ] Comparar prévia com vídeo final frame a frame e conferir navegador Chromium/Safari e render de servidor.

Não afirmar `F04 concluído` antes dessa matriz e da revisão de segurança. A versão da CLI npm deve ser fixada após teste de compatibilidade do build (o `package.json` usa versão disponível no npm, não foi homologada).
