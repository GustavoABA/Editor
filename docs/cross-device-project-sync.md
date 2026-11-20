# F10 — Arquitetura híbrida LAN e continuidade da edição PC ↔ celular

> **TRABALHO ATIVO — BRANCH `teste/implementacao` / [PR #2](https://github.com/GustavoABA/Editor/pull/2).** Codex e outras IAs devem **validar, corrigir e implementar exclusivamente nesta branch**, não na `main`; verificar `git branch --show-current` antes de qualquer commit. Ler `features.md`, `AGENTS.md` e `docs/lan-hybrid-implementation.md`.
> **Implementação experimental já existente:** endpoints de projetos, armazenamento no host, upload assíncrono em partes, salvamento/checkpoints, aviso ⚠️, importação de projetos remotos e integração de exportação a originais persistidos. **A F10 ainda não está concluída:** faltam proxies para vídeos grandes, UX mobile, autenticação granular e testes reais PC/celular na LAN. Não duplicar funções já escritas sem auditoria.

> **Status (19/11/2026): IMPLEMENTAÇÃO EXPERIMENTAL PARCIAL na branch de teste; NÃO CONCLUÍDO.**
> **Decisão atualizada:** cliente deve editar **imediatamente** usando arquivo local e preview leve; o **upload do original ocorre em segundo plano** ao host. O servidor mantém o projeto editável e faz **snapshots a cada 3 minutos (180 s)**, além de aceitar Ctrl+S / botão Salvar agora. Mídias faltantes são sinalizadas com **⚠️**, sem apagar clipes da timeline.
> **Execução atualizada:** a F10 foi iniciada experimentalmente por solicitação posterior do proprietário; validar e terminar o trabalho somente na branch `teste/implementacao`. A ordem anterior F02 → F03 → F04 → F07 → F05 → F09 → F01 → F08 continua registrada como histórico de planejamento, não como ordem de descartar a F10 já implementada. F06 Sounds permanece adiado.
> **Fonte principal:** [features.md](../features.md), F10, auditoria e roadmap.

## 1. Objetivo e escopo

A LAN tem **um host** (servidor self-hosted com armazenamento persistente e render final) e **um ou mais clientes** (navegadores PC/celular). O cliente recebe a interface e participa de processamento **leve e sensível à latência** para que o usuário veja a edição imediatamente, sem esperar a transferência de gigabytes. O host concentra originais, metadados autoritativos, histórico, backups e processamento pesado quando adequado.

**Salvar projeto não significa renderizar vídeo.** Uma revisão salva deve conter timeline editável e referências a todos os assets, inclusive os que ainda não terminaram de subir. O host não pode fingir possuir um arquivo pendente. Um projeto só recebe `Sincronizado` quando *todas* as mídias indispensáveis e o estado editável estão confirmados no servidor.

### Componentes já existentes no código da branch main (não reimplementar)

- [x] Web Next.js + Docker Compose com porta 3100 exposta à LAN.
- [x] Editor de timeline e prévia feitos no navegador usando `CanvasRenderer`; preservar a interação instantânea.
- [x] Salvar projeto local com `IndexedDB`, originais via `OPFS` (fallback IndexedDB) e autosave com debounce aproximado de 800 ms.
- [x] Render no host via endpoint que recebe manifest + assets, inicia Chromium headless e entrega arquivo exportado.
- [x] Fluxos existentes de n8n, MCP LAN e Ollama; reutilizar apenas onde apropriado.

**Na branch atual de teste, já existe implementação experimental** de armazenamento de projetos no servidor, importação/upload em segundo plano, checkpoints, upload por partes, placeholders ⚠️ e tentativa de reabertura em outro aparelho. **Ainda faltam testes reais e conclusão de proxies, UX mobile, segurança/autorização e operações avançadas.** Detalhes em [implementação F10](lan-hybrid-implementation.md).

> Os itens marcados [x] acima são **evidência de código**, não uma afirmação de que o sistema foi testado de ponta a ponta.

## 2. Fluxo de importação, edição e sincronização

### Cliente com original (ex.: arrastar foto para timeline)

1. O usuário arrasta/solta uma foto, vídeo, áudio ou GIF; ela aparece **naquele instante** na biblioteca e na timeline, com miniatura/prévia local (sem aguardar upload). Cortes, posicionamentos, textos, efeitos e Undo/Redo seguem disponíveis.
2. Criar `assetId` local estável, guardando metadados, arquivo original e estado de edição. Manter referência local (`File`/`blob:`) somente como **cache transitório**, nunca como referência definitiva do projeto compartilhado.
3. Iniciar fila de upload **assíncrono** do original ao host. A transferência não pode bloquear drag, seek nem ações na timeline. Mostrar indicador discreto de fila, progresso, falha e reenvio.
4. Enviar em chunks com retry limitado, pausa/retomada após perda de rede, limite/cota, hash de integridade e associação idempotente entre `assetId` e `serverAssetId` retornado. Limpar partes incompletas com segurança.
5. Host persiste o original no storage configurado (volume Docker/armazenamento equivalente) e só marca `verified` após gravação e integridade comprovada.
6. O cliente continua editando normalmente durante a transferência. Ao terminar, troca a referência compartilhável pelo asset persistente sem remover o clipe e sem deslocar os cortes.

### Estados por mídia

| Estado interno proposto | Exibição no cliente que possui o original | Em outro aparelho sem o original |
|---|---|---|
| `local_only` | Mídia visível/editável + indicador ⚠️ ainda não enviada | Placeholder ⚠️ + metadados e posição preservados |
| `uploading` | Mídia editável + progresso de upload | Placeholder ⚠️ "Envio em andamento" |
| `verified` | Mídia editável; indicador de envio concluído | Receber preview/proxy do servidor, original continua no host |
| `failed` | Mídia editável + erro/retry ⚠️ | Placeholder ⚠️ e indicação da falha |
| `missing_on_device` | Placeholder ⚠️, solicitar reenvio em dispositivo que possui original | Placeholder ⚠️; **não apagar o elemento** |

**Regra:** ⚠️ pode aparecer como sobreposição discreta quando o usuário possui a foto/vídeo, e como imagem substituta apenas onde os bytes **não estão disponíveis**. O emoji nunca substitui permanentemente o asset, nem é renderizado no vídeo final como se fosse o original.

### Conectividade instável

- Continuar edição no cliente, quando possível, se a LAN cair; guardar rascunho e fila local recuperável. Não declarar checkpoint no host enquanto offline.
- Ao voltar a LAN, enviar mudanças pendentes e retomar chunks se ainda houver bytes originais no cache. Se o dispositivo/cache foi perdido antes do upload, informar que o servidor **não possui aquele original**.
- Distinguir perdas de conexão temporárias de erros permanentes (cota, formato inválido, autorização); nunca travar o editor aguardando a rede.

## 3. Salvamento no host a cada três minutos

**Política definida pelo proprietário:** o host cria snapshots/checkpoints do projeto **a cada 180 segundos enquanto o projeto estiver ativo**, e deve haver **Salvar agora** (Ctrl+S/Cmd+S ou botão, também visível no mobile).

Arquitetura recomendada:

1. Manter o autosave **local** já existente para recuperar interações recentes.
2. O navegador envia **mudanças pequenas do estado editável** para o host continuamente, por HTTP (debounce) ou canal autenticado, sem reenviar originais a cada corte. O servidor mantém revisão de trabalho atualizada.
3. A cada 180 segundos, o **servidor** grava um checkpoint persistente do estado conhecido e validado do projeto; implementá-lo em job confiável. Ao clicar Salvar agora, fazer flush de alterações pendentes e solicitar checkpoint imediato. Não criar checkpoint "novo" se a versão mais recente não chegou ao host.
4. Persistir cenas, pistas/faixas, clipes, timestamps, recortes, efeitos, keyframes, textos, áudio, normalização, proporção, legendas, templates/HTML HyperFrames editáveis, além de referencias de assets e estados de sincronização.
5. Snapshot pode ser salvo **mesmo com arquivos pendentes**: mostrar `Projeto salvo no servidor — 2 mídias pendentes`, distinto de `Tudo sincronizado`. Projetos pendentes podem ser reabertos com placeholders.
6. Controle de concorrência usando `projectId`, `revision` e comparação de revisão base; definir lock de um editor por vez ou conflito explícito. Nunca sobrescrever alterações de outro aparelho silenciosamente.
7. Usar retenção/limpeza de snapshots por política configurável, com versão de schema, migrações, backup e restauração.

**Limite físico:** se cliente ficar offline, o host só conhece a última revisão já recebida; o último rascunho estará local até reconectar. A cada três minutos **não** garante salvar alterações que nunca chegaram ao servidor. Exibir dois estados separados: `Local salvo` e `Servidor atualizado`.

## 4. Edição em PC e celular

1. Autenticar no Editor pela LAN e listar no painel **Meus projetos** os projetos do host, não somente `IndexedDB` do navegador atual.
2. Abrir projeto editável com a última revisão consistente, mapeando `serverAssetId` a URLs de mídia/proxy autorizadas. O original de alta qualidade permanece centralizado.
3. Quando o asset ainda não estiver verificado no host, manter clipe, duração, recortes, posição e metadados na timeline, exibindo o placeholder ⚠️ no dispositivo que não tem os bytes.
4. Oferecer editor **touch-first** no celular para selecionar, mover, dividir, aparar, ajustar texto/volume e salvar, mantendo o estado que o PC poderá reabrir.
5. Prévia rápida no cliente usando arquivo local quando disponível e proxy/derivados gerados pelo host quando não estiver; preservar sincronismo e fidelidade de enquadramento. O cliente ainda usa CPU/GPU para interface/decodificação — o objetivo é evitar peso desnecessário, não exigir CPU zero.
6. Permitir retornar ao PC na mesma revisão, respeitando conflitos e histórico.

### Formato editável, não MP4

O documento de projeto é um modelo não destrutivo versionado. Nunca armazenar apenas render final, link `blob:`, `file:`, caminho `C:\\...` ou arquivos de um só navegador como fonte universal. Proxies são derivados. HyperFrames deve preservar a composição editável e dependências, não apenas o resultado achatado.

## 5. Renderização e tarefas pesadas

- Render e export final devem rodar no host usando **originais verificados e já armazenados**. Reaproveitar o render server existente; refatorar seu protocolo para referenciar `serverAssetId` e **evitar reupload integral de todos os arquivos na exportação**.
- Se houver original obrigatório pendente: bloquear a exportação final e informar exatamente quais assets faltam. Preview parcial pode ser permitido com aviso, mas **não** exportar vídeo final silenciosamente usando emoji/silêncio/quadro preto.
- Efeitos/previews de baixa latência podem continuar no cliente; tarefas caras (transcrição CPU, proxy, renders) podem ir ao host por jobs separados. Não perder fluidez da interface durante jobs.
- Garantir equivalência de enquadramento, áudio e composição entre preview e export, ou avisar limitações explicitamente.

## 6. Segurança, privacidade e armazenamento

- **LAN como padrão.** Host e clientes usam login/sessão/autorização por usuário/projeto; validar também downloads de originais/proxies, não só a interface. Evitar exposição de URLs sem credencial.
- O ngrok de F09 destina-se **somente ao MCP**. Não expor frontend nem biblioteca no mesmo túnel. Uma eventual edição fora da LAN exige uma configuração própria de HTTPS e autenticação.
- Validar upload de mídia, hashes, tamanho, quota e caminhos; evitar traversal, acessos indevidos a arquivos e vazamento de tokens.
- Armazenamento self-hosted escolhido pelo usuário: originais no volume/objeto persistente do host, derivados descartáveis, backups restauráveis, cotas, deduplicação controlada, limpeza segura de órfãos.
- Segredos de IA, ngrok, MCP ou outros provedores ficam no backend seguro e nunca em documento de projeto, mídia ou logs.
- Para links externos/embeds (F07), não assumir download/reprodução/export automáticos: observar licenças, termos e permissões.

## 7. Marcos de implementação

- [ ] **F10-A — Migração/contrato:** mapear esquema e storage local atuais; definir API de projeto/asset, revisão e permissões; preparar volumes persistentes e compatibilidade.
- [ ] **F10-B — Upload não bloqueante:** manter drag/drop e preview locais já existentes; adicionar fila automática, chunks/retry/recomeço, verificação no host, status ⚠️ por asset.
- [ ] **F10-C — Salvamento periódico:** sincronizar deltas de timeline, implementar snapshot real no servidor a cada 180s, flush/Salvar agora, histórico, recuperação offline e estados distintos.
- [ ] **F10-D — Reabrir em outro aparelho:** lista de projetos do host, referências remotas, proxies, placeholders faltantes, edição touch no celular e retorno PC.
- [ ] **F10-E — Export e robustez:** render com originais do host sem upload duplicado, concorrência, autenticação, backup/quotas e testes de performance LAN.

## 8. Testes de aceitação obrigatórios

- [ ] Adicionar uma foto e um vídeo grande no cliente: a timeline reage imediatamente, mesmo antes de upload acabar; editar, cortar e mover durante upload.
- [ ] Mídia original chega ao servidor por fila assíncrona, com checksum; após upload, cópia do host persiste independentemente do navegador original.
- [ ] A cada 180 s de projeto ativo, o host cria um checkpoint consistente; Ctrl+S/Cmd+S/Salvar agora produz checkpoint imediato sem MP4.
- [ ] Com um asset ainda pendente, salvar projeto e reabrir em outro dispositivo: clipe permanece com ⚠️, metadados/posições intactos e aviso de mídia ausente.
- [ ] Cliente que possui original continua editando durante falha de upload; outro dispositivo não finge ter recebido arquivo.
- [ ] Desligar cliente original depois de conclusão do upload, abrir pelo celular e editar/guardar o mesmo projeto; retornar ao PC sem perda.
- [ ] Cortar rede no meio de upload/salvamento, reconectar e retomar com estado consistente, sem sobrescrever silenciosamente revisões concorrentes.
- [ ] Reiniciar Docker/host e recuperar projeto, originais e snapshots de backup.
- [ ] Render final no host reutiliza originais já verificados e bloqueia export se faltar algum; preview cacheado não reduz qualidade final.
- [ ] Outro usuário não consegue baixar/alterar projetos ou mídias sem autorização; documentação/testes não expõem chaves secretas.

**Ação atual:** documentação revisada em 19/11/2026; **nenhum código de F10 foi implementado por esta alteração**.
