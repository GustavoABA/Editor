# Plano de validação — branch `teste/implementacao`

> **Somente para validar a implementação experimental.** Nenhuma feature deve ser promovida a `main` antes de testes reais. A implementação está no [PR #2](https://github.com/GustavoABA/Editor/pull/2), com status atualizado em [features.md](../features.md).
>
> **A implementação no código não significa que qualquer API, modelo, ngrok ou dispositivo externo já esteja funcionando.** Não executar automaticamente serviços opcionais nem habilitar chamadas pagas.

## 1. Preparação

1. Fazer checkout de `teste/implementacao` e confirmar com `git branch --show-current`.
2. Configurar no `.env` do host:
   - `OPENCUT_LAN_SYNC_TOKEN`: segredo aleatório com pelo menos 16 caracteres, exclusivo para APIs LAN.
   - `BETTER_AUTH_SECRET`: segredo de autenticação preexistente, com pelo menos 16 caracteres, usado também para derivar a chave de criptografia do cofre da F03. **Não trocar o segredo sem fazer backup e exportação segura do cofre; uma troca impede decriptar as chaves antigas.**
   - `PARAKEET_INTERNAL_TOKEN`: segredo único do worker, diferente do LAN_TOKEN, quando usar Parakeet.
   - `NGROK_AUTHTOKEN`: segredo oficial do ngrok, somente para o contêiner de agente.
3. Inicializar o Editor básico: `docker compose up -d --build web mcp-http`.
4. Serviços opcionais: `docker compose --profile transcription up -d --build parakeet` (CPU e download de pesos) e `docker compose --profile mcp-tunnel up -d ngrok` (agente sem endpoint público). **Não fazer `up` geral com perfis ativos involuntariamente.**
5. Para cadastrar chaves externas de IA, abrir o Editor por **HTTPS** via Caddy (ou `localhost` no próprio host). Use o token LAN no cabeçalho e a aba IA & Automação. Provedores pagos ficam bloqueados até autorização manual pela UI.

### CI e testes locais

No diretório `apps/web`:

```bash
bun install
bun run build
bun test src/lan-sync/server.test.ts
bun test src/lan-sync/preview.test.ts
bun test src/media/loudness.test.ts
bun test src/actions/keybindings/migrations/v7-to-v8.test.ts
bun test src/timeline/reframe.test.ts
bun test src/automation/components/hyperframes.test.ts
bun test src/ai/config-store.test.ts
```

A compilação usa Rust/WASM e os caches conforme `.github/workflows/bun-ci.yml`. O CI valida build e unit tests; **não substitui teste de UI nem todos os serviços opcionais**.

## 2. Matriz de aceite por funcionalidade

| ID | Testar manualmente | Critério mínimo |
|---|---|---|
| F02 | Enviar áudio, conectar LAN, medir LUFS/dBTP e aplicar ganho; Ctrl+Z; testar audio mutado/silêncio | Fonte não alterada, volume reversível; medição final do mix ainda pendente |
| F03 | HTTPS: inserir API key/modelo/prioridade, salvar, atualizar página e confirmar chave mascarada; testar autorização de custos e fallback | Tokens nunca aparecem no JSON GET nem no repo; modelos falham sem executar comandos; exigir confirmação manual de plano |
| F04 | Inserir overlay em playhead e detectar batidas em música; exportar 16:9/9:16 | Texto editável e render coerente; **HTML/CSS e IA gerativa ainda não implementados** |
| F05 | Rolagem de dezenas de Stickers em tela baixa, mobile e mouse/trackpad | Área rolável, abas e pesquisa não quebram |
| F07 | Colar YouTube e Twitch e confirmar iframe apenas de prévia; URL direta com CORS + autorização | Não baixar YouTube/Twitch; nenhuma URL externa no servidor |
| F09 | Iniciar perfil ngrok, conectar token LAN, ativar na aba Conexões, copiar URL `/mcp`, testar token MCP; desativar | Apenas MCP na internet; acesso ao Editor e mídias não permitido; não expor porta 4040 |
| F01 | Proteger clipe por menu, mover/cortar/apagar/editar parâmetros, salvar e reabrir | Proteger não apaga clipe; demais comandos precisam de auditoria |
| F08 | Converter 16:9 → 9:16 em Contain/Cover, conferir textos/imagens e desfazer | Cena preservada, clipes 🔒 não alterados; sujeito animado pode precisar de correção manual |
| F10 | Enviar vídeo >80MiB, editar antes de upload, abrir PC/celular, exportar original e reiniciar host | Nunca enviar proxy como original, snapshots no host; testar falha de rede/concorrência |
| F11 | Iniciar worker Parakeet CPU, inserir mídia, gerar legendas PT-BR e comparar timestamps com Whisper | Timestamp consistente, saída sem dados vazados, CPU-only e suporte real ao modelo |
| F12 | Perfil existente personalizado e instalação nova, teclas C/V/X, Ctrl+C/V, formulário de texto | Atalhos esperados e nenhum atalho pessoal sobrescrito |
| F06 | Não testar mudanças (adiado) | Sem regressão em Sounds |

## 3. Lacunas que ainda precisam implementação ou homologação

- F02: análise do mix exportado, keyframes, fades e limites verdadeiros após mixagem.
- F03: executor de código Node personalizável **em sandbox isolado** e validação de provedores reais, sem execução arbitrária no servidor com credenciais.
- F04: compositor completo HyperFrames/HTML/CSS, bibliotecas de templates e IA que entregue composição editável.
- F07: integração de outras fontes autorizadas, monitoramento de live e casos CORS/licenciamento.
- F09: validar agente ngrok real e configurações de autenticação.
- F01: proteger comandos adicionais de efeitos, keyframes, duplicação e automação.
- F08: rastreamento real de assunto/rosto e animações por movimento.
- F10: streaming de segmentos, auth por usuário, UX touch e testes de retomada/conflitos.
- F11: pesos/tempo de inferência do Parakeet CPU e qualidade PT-BR.
- F12 e F05: teste manual em navegadores e dispositivos reais.

**Não usar a presença de um componente no código para afirmar que todos os requisitos da feature foram concluídos.** Assinalar testes aprovados por sistema, dispositivo e commit; somente o proprietário autoriza merge em `main`.
