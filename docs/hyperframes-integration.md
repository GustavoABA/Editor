# HyperFrames nativo no Editor — `teste/implementacao`

> **Estado:** integração incorporada ao contêiner `web`, sem daemon adicional, URL interna, token secundário ou perfil Docker HyperFrames. O build do Editor e os testes de renderização devem validar esta arquitetura antes de aprová-la para `main`.

## Arquitetura

```text
Editor (navegador)
 ├─ transcrição Parakeet CPU ou Whisper local
 ├─ picos de energia e contexto da timeline
 ├─ IA configurada no Editor → HTML/CSS
 └─ botão "Aplicar composição à timeline"
      └─ POST /api/hyperframes/render (token LAN existente)
           └─ backend Next.js do MESMO contêiner web
                └─ processo temporário Node.js
                     └─ CLI oficial HyperFrames + Chromium + FFmpeg
                          └─ WebM → biblioteca de mídia → clipe na timeline
```

A CLI oficial faz parte da **imagem `apps/web/Dockerfile`**. O código está em `services/hyperframes/server.mjs` por organização de pacotes, mas **não inicia servidor HTTP**; é executado somente durante um render. O Dockerfile na mesma pasta é **apenas para testar a CLI isoladamente no CI**. O único serviço web exposto continua sendo o do Editor. Não há necessidade de `hyperframes-render`, `HYPERFRAMES_SERVICE_URL`, `HYPERFRAMES_INTERNAL_TOKEN` nem rede Docker adicional.

O pipeline de IA transcreve e analisa o conteúdo falado, além de picos de energia. A IA recebe transcrição, timestamps, briefing e resumo de clips; não recebe áudio bruto. Esse envio de texto só ocorre quando o usuário clica em Gerar. Parakeet continua **opcional** e pode rodar no perfil separado `transcription`; Whisper funciona no navegador. Ele é um motor de transcrição existente, **não é um segundo serviço HyperFrames**.

## Instalação — um só deploy do Editor

No `.env` do Docker Compose, mantenha o token LAN já utilizado pelo editor:

```env
OPENCUT_LAN_SYNC_TOKEN=<segredo-aleatorio-com-pelo-menos-16-caracteres>
```

Para instalar a CLI oficial dentro da imagem, o build requer rede de instalação npm. Inicie/reconstrua o Editor normalmente:

```sh
docker compose up -d --build web
```

Não inicie o perfil `hyperframes` (ele foi removido). Na aba **IA & Automação**, o painel **HyperFrames oficial · HTML/CSS + IA** já estará disponível. O comando `GET /api/hyperframes/render` (com o cabeçalho LAN) indica `integrated: true`, `service: web` e disponibilidade da CLI. A rota POST rende o overlay pelo próprio backend.

Ao desenvolver o app **fora** do Docker, para habilitar render local também será preciso instalar o pacote `services/hyperframes` e configurar o caminho da CLI; a distribuição suportada e automatizada é a imagem Docker.

## Fluxo de edição

1. Abra um projeto, escolha o intervalo e o briefing.
2. Analise fala/música via Parakeet (serviço opcional CPU) ou Whisper local; revise a transcrição. Pode colar um roteiro manualmente.
3. Peça à IA HTML/CSS com contexto semântico e temporal; revise os dois campos de código.
4. Observe a prévia em iframe sandbox sem JS.
5. Clique em **Aplicar composição à timeline**. O Editor renderiza automaticamente no próprio `web`, importa o WebM na biblioteca do projeto e insere ou atualiza o clipe.
6. Para refinar, selecione o clipe, use **Carregar HTML/CSS do clipe selecionado**, modifique o código e aplique novamente.

A fonte HTML/CSS fica nos parâmetros do clipe. **O WebM é uma mídia intermediária armazenada no projeto:** depois de aplicado, a reprodução da timeline segue o renderizador normal do Editor, sem exigir HyperFrames em tempo real a cada frame. Isso melhora a reprodução, mas mudanças no HTML/CSS requerem novo render. Essa abordagem é uma **dependência nativa do backend**, não edição DOM em tempo real.

## Segurança e limites técnicos

- Só HTML/CSS higienizado; scripts, iframe, SVG, mídia externa, fontes remotas, CSS `url()`, `@import` e outros recursos são proibidos. Um CSP bloqueia execução/rede durante a renderização.
- Renderizador executado como **processo temporário sem herdar chaves de IA/banco** no ambiente, com timeout e limpeza de temporários. O aplicativo continua exigindo token LAN na API.
- Limites: 0,3–12s, 24/30 FPS, saída WebM até 55 MiB, resolução máxima 1920x1920 com até ~2,1 megapixels, HTML/CSS até 26 KB por campo, JSON até 96 KB.
- Uma renderização por instância do backend; novos pedidos simultâneos recebem 429.
- **Importante:** remover o contêiner separado reduz o isolamento de processos e rede. Sanitização/CSP não equivalem a um sandbox de segurança perfeito contra vulnerabilidades do navegador. Não habilitar JS arbitrário nem recursos externos sem uma camada adicional de isolamento.
- Transparência VP9/WebM e exportação no pipeline do Editor precisam de teste com vídeos reais, especialmente em dispositivos não Chromium.

## Aceitação da F04

- [ ] CI Next.js + Bun tests Linux/Windows/macOS concluídos.
- [ ] Build da imagem **web** com CLI incluída, após o build da etapa Rust/WASM.
- [ ] Teste Alpine com a CLI rodando como processo único, offline, sem serviço HTTP.
- [ ] API GET da aplicação informa CLI disponível após iniciar `web`, sem configuração extra.
- [ ] POST faz uma composição 16:9 e uma 9:16, WebM válido e com alfa.
- [ ] IA + transcrição PT-BR: significado, números, mudanças de assunto e timestamps.
- [ ] Inserir sobre vídeo e exportar preservando posição/tempo/transparência.
- [ ] Salvar, reabrir e reeditar a composição no PC e no celular via LAN.
- [ ] Tentativas de HTML/CSS malicioso e vários pedidos concorrentes são rejeitadas de forma segura.

Não marcar a integração completa antes destes testes, sobretudo o render **dentro da imagem web**, diferente do smoke Docker que exercita somente o pacote.
