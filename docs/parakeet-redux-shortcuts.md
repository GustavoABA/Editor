# F11 / F12 — Parakeet Redux CPU para legendas e atalhos rápidos C/V/X

> **Estado:** requisitos de planejamento, **não implementados**.
> **Solicitação:** 13/11/2026.
> **Prioridade:** itens de backlog sem fase definida; **não** mudam as prioridades F02 → F03 → F04 → F07 → F05 → F09 → F01 → F08 nem a F10 já planejada. Sounds (F06) segue adiado.

## F11 — Substituir o motor de transcrição por Parakeet Redux (CPU)

### Código atual, verificado na branch main

- `apps/web/src/subtitles/components/assets-view.tsx`: extrai o áudio da timeline, decodifica e invoca `transcriptionService.transcribe`, em seguida `buildCaptionChunks` e `insertCaptionChunksAsTextTrack`.
- `apps/web/src/transcription/models.ts`: modelos Whisper Tiny, Small, Medium e Large; **padrão = whisper-small**.
- `apps/web/src/services/transcription/service.ts`: abstração/worker atual.
- `apps/web/src/services/transcription/worker.ts`: usa `@huggingface/transformers` num Worker de navegador, com `dtype: "q4"`, `device: "auto"` e timestamps. **Não compatibilizar Parakeet Redux simplesmente trocando o ID**: a runtime de referência é diferente.

### Escolha técnica e limitações

O modelo desejado é **`moondream/parakeet-redux`**, um ASR local de 25 idiomas, incluindo português, projetado para CPU. Moondream disponibiliza o runtime Python/Photon e resultados com timestamps por palavra.

**Exemplo oficial de uso na CPU (PoC isolada):**

```python
import moondream as md

with md.photon("moondream/parakeet-redux", device="cpu") as speech:
    result = speech.transcribe(audio="interview.wav", timestamps="word")
    print(result["text"])
    for segment in result["segments"]:
        print(segment["start"], segment["end"], segment["text"])
        for word in segment["words"]:
            print(word["start"], word["end"], word["word"])
```

Instalação documentada pelo fornecedor: `pip install --upgrade "moondream>=2.4.1"`. Não instalar automaticamente no ambiente Windows/Docker sem auditar dependências/compatibilidade e permitir o gerenciamento de download do modelo.

**Importante:** o modelo realiza **áudio → texto**, não leitura das imagens do vídeo. O Editor continua extraindo o áudio do vídeo/timeline antes de transcrever. Para estabilidade, processar o arquivo no **CPU do host/servidor local** e não presumir CPU/compatibilidade no browser mobile; não enviar áudio a nuvem por padrão.

### Pipeline recomendado

```text
Vídeo na timeline
  ↓ extrair áudio original, sem renderizar vídeo final
WAV/PCM no serviço local
  ↓ Parakeet Redux / CPU (timestamps="word")
Transcrição {text, segments:[{start,end,text,words:[...]}]}
  ↓ adaptador para os tipos já existentes
Captions / subtitle chunks / legendas editáveis na timeline
  ↓ opcional
Transcrição com timestamps para IA/HyperFrames
```

1. Implementar adaptador ASR CPU com interfaces de transcrição compatíveis com o Editor, evitando mudanças desnecessárias na UI Captions e no formato de projetos existentes.
2. Iniciar serviço CPU com carregamento único de pesos, cache local configurável, limites de threads, CPU/RAM, progresso/cancelamento, logs sem conteúdo sensível e controle de execução concorrente.
3. Suportar áudio curto/longos, múltiplos canais/volumes e casos com silêncio/ruído. Em falha do motor, exibir erro e oferecer fallback Whisper temporário e explícito.
4. Reter **timestamps por palavra**, segmentação, pontuação, ortografia, idioma e opções de palavras por legenda. Ajustes manuais não podem ser apagados automaticamente.
5. Medir qualidade PT-BR com clipes reais (voz isolada, música, microfone de qualidade variável, nomes próprios), usando texto de referência e **WER (quanto menor, melhor)**, além de erro de alinhamento e duração do processamento.
6. Depois dos testes e do aceite, **Parakeet Redux torna-se padrão** e Whisper deixa de ser o primeiro motor; manter opção de compatibilidade ou reversão durante migração.
7. Verificar licença `CC-BY-4.0`, atribuição, downloads e empacotamento em Docker/Windows; validar instalação em CPU comum, inclusive sem placa NVIDIA.

**Não afirmar que Parakeet Redux é mais preciso que Whisper em todos os vídeos:** o fornecedor apresenta resultados positivos em alguns benchmarks, mas resultados em gravações do proprietário devem decidir ajustes de modelos/limiares.

Fontes:
- https://moondream.ai/blog/introducing-parakeet-redux-and-ultra
- https://huggingface.co/moondream/parakeet-redux

### Testes de aceite F11

- [ ] CPU local é realmente usada, sem precisar CUDA, WebGPU ou chave de IA.
- [ ] Captions mostra Parakeet Redux como método ativo, com status e progresso reais.
- [ ] Cada palavra/sentença recebe timestamps corretos, legibilidade e ajustes de SRT/legenda na timeline.
- [ ] Fluxo suporta áudio em português e conteúdos de vídeo, sem editar arquivo fonte.
- [ ] Benchmark contra Whisper-small atual documenta acurácia PT-BR e custo/tempo no hardware real.
- [ ] Erros, cancelamento, modelo indisponível e fallback são seguros e explícitos.
- [ ] Captions existentes reabrem sem regressão e HyperFrames pode usar transcrições temporizadas.

## F12 — Atalhos de corte e botões rápidos

### Código atual na branch main

`apps/web/src/actions/definitions.ts` define ações e atalhos:

| Ação | Default existente | Default solicitado |
|---|---|---|
| `split` — dividir elementos | `S` | **`C`** |
| `split-left` — dividir e remover parte esquerda | `Q` | **`V`** |
| `split-right` — dividir e remover parte direita | `W` | **`X`** |

- Central de ações: `apps/web/src/actions/` e `use-editor-actions.ts`.
- Configuração persistente: `keybindings-store.ts`, `keybindings/persistence.ts`, migrações `keybindings/migrations/`.
- Interface existente de atalhos: `apps/web/src/actions/components/shortcuts-dialog.tsx`.
- **Não implementar novamente o split**; remapear ações existentes e adicionar botões que chamam os mesmos handlers.

### Experiência desejada

1. Teclas **C / V / X** cortam na timeline (com foco no editor) usando `split`, `split-left` e `split-right` respectivamente.
2. Barra compacta de **ações rápidas** próxima da timeline, com botões Split, Split left, Split right e tooltips exibindo o atalho **configurado atualmente**, não só o padrão.
3. A central de atalhos permite remapear essas e outras ações, detectar colisões e oferecer restauração de valores padrão.
4. Atalho simples de caractere **não pode agir quando o foco estiver em campo de texto, caixa de prompt, diálogo, nome do projeto, Captions ou editor Node personalizado**.
5. `C` **não interfere em Ctrl+C**, `V` **não interfere em Ctrl+V**, `X` **não interfere em Ctrl+X**; atalhos com modificadores são combinações diferentes.
6. Atualizar migrações de atalhos antigos sem sobrepor preferências manuais nem causar duas ações para a mesma tecla. Preservar configuração existente ou pedir escolha de perfil quando houver colisão.
7. Ações de split-left/right destrutivas devem ser reversíveis via Undo/Redo; quando a timeline ou seleção não permitir ação, informar/desabilitar adequadamente.
8. Botões de ação rápida devem aceitar mouse e toque, ajudando edição mobile sem exigir teclado.

### Testes de aceite F12

- [ ] C/V/X agem corretamente somente com foco no editor.
- [ ] Botões executam o mesmo registro de ações e apresentam o atalho ativo.
- [ ] Ctrl+C / Ctrl+V permanecem funcionando e a edição de texto nunca aciona cortes.
- [ ] Atalhos remapeados individualmente persistem após recarregar e atualizar o app.
- [ ] Migração protege preferências anteriores; não cria bindings duplicados ou conflitantes.
- [ ] Undo/Redo e trilhas de áudio continuam consistentes após cada variação de split.
- [ ] Layout da barra rápida funciona desktop e mobile.

## Escopo desta revisão

Esta documentação **não altera `worker.ts`, `models.ts`, `definitions.ts` nem qualquer componente do Editor**. A substituição real do transcritor, download do modelo, migração de hotkeys e criação dos botões serão trabalho de implementação com testes específicos.
