# F10 — Implementação inicial do Editor híbrido LAN

> **Status (19/11/2026):** primeira entrega **experimental**, em branch `teste/implementacao` e [PR #2](https://github.com/GustavoABA/Editor/pull/2). **Somente esta branch pode receber validação e código da implementação**. Não declarar F10 concluída até integração, testes reais e revisão de segurança. Ver [features.md](../features.md) e [cross-device-project-sync.md](cross-device-project-sync.md).

## Orientação a Codex / outras IAs

1. Fazer checkout de `teste/implementacao` e confirmar a branch com `git branch --show-current`.
2. Ler o `features.md` e `AGENTS.md` desta branch. Auditar/validar código existente antes de refazer qualquer funcionalidade.
3. Implementar **somente aqui** os itens pendentes da F10, manter testes/CI e corrigir regressões. Não modificar código da `main`, não trabalhar em `feature/lan-hybrid-sync`, nem fazer merge até aprovação.
4. Atualizar status/checkboxes da F10 com prova de testes. Distinguir **implementado no código**, **testado em CI** e **validado em rede LAN com aparelhos reais**.

## Componentes implementados nesta etapa

- Edição, prévia e cache local do navegador foram **mantidos**.
- Novo armazenamento persistente no host via volume `lan_sync_data`, separado de renders temporários.
- API `/api/lan-sync/projects` para listar projetos editáveis e `/api/lan-sync/projects/:id` para ler/salvar o documento serializado e a lista de mídias; **revisões otimistas** retornam 409 em conflito.
- Transferência automática de originais, iniciada ao detectar mídias no editor, **sem bloquear a timeline**, em chunks de 4 MiB, com possibilidade de pular partes já recebidas após falha de conexão. O servidor concatena, calcula SHA-256 e confirma a gravação.
- Cada chunk agora recebe SHA-256 calculado independentemente no navegador (inclusive em HTTP LAN sem `SubtleCrypto`), é conferido na chegada e novamente na finalização. Assinatura binária e categoria MIME do arquivo montado também são validadas antes de promover o original.
- Snapshot/checkpoint persistente no host na primeira gravação e quando uma gravação ocorre após 180 segundos; cliente conectado dispara checkpoints a cada 180 segundos. **Ctrl+S** ou botão **Salvar no host** também executam checkpoint manual.
- Retenção de checkpoints e cotas por arquivo/projeto são configuráveis; respostas de original/proxy suportam `Range`/`206` para seek e consumo incremental por clientes compatíveis.
- Status ⚠️ de upload pendente/falha no cabeçalho e barra de progresso percentual; dispositivos sem originais exibem **placeholder ⚠️ no clipe de vídeo/imagem e aviso para áudio**, preservando seus cortes e metadados.
- Seção **Projetos do servidor LAN** em `/projects` para importar projeto editável do host para o navegador atual.
- **F10-D (integração nova, experimental):** para originais maiores que 80 MiB, o host cria automaticamente um proxy cacheado via FFmpeg: MP4/H.264 480p para vídeo, M4A/AAC para áudio e PNG redimensionado para foto. O navegador baixa **somente o proxy para edição/preview**; o arquivo original permanece no host e é usado na renderização final. `remoteProxy`, tamanho e MIME originais são persistidos no IndexedDB para evitar reupload do proxy por engano.
- **Correção de infraestrutura:** diretório `/app/lan-sync` criado com propriedade do usuário não-root `nextjs` no Dockerfile, para montagem inicial do volume persistente. Ambientes com volume já existente podem exigir correção manual de permissões.

## Como ativar no host

1. Defina no arquivo `.env` **na raiz do repositório** uma senha aleatória própria, com **ao menos 16 caracteres**:

   ```env
   OPENCUT_LAN_SYNC_TOKEN=defina-um-segredo-longo-e-unico-aqui
   # opcionais: bytes e quantidade máxima de snapshots
   LAN_SYNC_MAX_ASSET_BYTES=17179869184
   LAN_SYNC_MAX_PROJECT_BYTES=68719476736
   LAN_SYNC_MAX_CHECKPOINTS=120
   ```

   Não use `BETTER_AUTH_SECRET`, token do MCP, nem comite segredos no GitHub.

2. Faça build/recrie o serviço do app:

   ```powershell
   docker compose up -d --build web
   ```

3. Acesse `http://IP_DO_HOST:3100` no navegador de um aparelho **na mesma LAN confiável**. Na página `/projects`, informe o token para listar os projetos do host. Durante a edição, use **Conectar LAN** no cabeçalho.
4. Arraste foto/vídeo para a timeline. A prévia local começa sem aguardar upload, o arquivo é enviado em background e o projeto editável é salvo periodicamente; use **Salvar no host** / **Ctrl+S** para checkpoint imediato.
5. Abra `/projects` em outro dispositivo e escolha **Continuar edição** em um projeto remoto. Em caso de original ainda não recebido, será exibido ⚠️ e a timeline será mantida.

O volume Docker `lan_sync_data` precisa ser incluído na política de backup. Em desenvolvimento fora do Docker, defina `LAN_SYNC_DIR` para um diretório gravável pelo usuário do processo.

**Segurança:** token trafega em cabeçalho sobre a LAN; HTTP sem TLS **não é adequado para redes não confiáveis nem acesso pela internet**. Não encaminhe a porta 3100 para a internet. O token fica em `sessionStorage` do navegador atual, não no documento do projeto; quem acessa a máquina pode recuperar o token da sessão. Revisões e controle por token do host não substituem autenticação individual/autorização por usuário.

## Limitações conhecidas e trabalho restante

- **Não é entrega completa F10.** A interface mobile ainda não foi redesenhada para gestos e telas pequenas.
- Para arquivos até **80 MiB**, a importação ainda baixa o **original** no navegador. Para arquivos maiores, o host gera um **proxy de visualização** limitado a 80 MiB. **Isso não é streaming segmentado nem transcodificação adaptativa:** o navegador ainda baixa todo o proxy e arquivos longos podem exceder o limite ou esgotar tempo de transcodificação. Nesses casos, o clipe permanece com ⚠️ e requer evolução para HLS/range/proxy segmentado.
- A exportação final **agora reutiliza originais verificados no host** quando existe token de LAN ativo: o manifest inclui referências, o servidor recupera os originais da biblioteca persistente e os copia ao job de render. Arquivos ainda não sincronizados continuam usando o caminho de upload tradicional. Se um clipe não tiver bytes locais nem original verificado no host, a exportação é **bloqueada**. **Pendente:** testar mídia grande, falhas e integração com proxy ao vivo; cópia de host → pasta de render ainda consome espaço temporário.
- Integridade cliente→host, assinatura de mídia, cotas globais por projeto/arquivo e retenção de snapshots foram implementadas e cobertas por testes. **Pendente:** quotas por usuário, rate limit distribuído e autenticação individual por projeto.
- Checkpoints são criados durante uma **sessão ativa com cliente conectado**, não por daemon independente na ausência de edições/sessão. Se a conexão cair, o servidor conserva a última revisão que recebeu e o navegador mantém seu rascunho local.
- O proxy é um arquivo compactado cacheado em disco e a API autenticada suporta HTTP Range. A importação atual ainda materializa o proxy inteiro no armazenamento do navegador; **faltam HLS/segmentos, cache inteligente, transcodificação on-demand por trecho e consumo móvel realmente leve**.
- Sem sincronização colaborativa CRDT nem merges automáticos: conflitos (409) **bloqueiam sobregravação** e exigem reabrir a versão do servidor.
- Exclusão/renomeação/duplicação locais ainda não estão propagadas integralmente para a biblioteca do host; é necessário desenhar política de remoção sem perder mídias partilhadas.
- Exibição de ⚠️ foi adicionada para **clipes visuais/áudio sem original disponível no cliente**; falta verificar UX mobile e distinguir cada motivo de indisponibilidade por asset.
- Não houve teste prático entre dois computadores ou celulares nesta sessão. A compilação é verificada via CI quando disponível.

## Testes automatizados adicionados

`cd apps/web && bun test src/lan-sync/checksum.test.ts src/lan-sync/server.test.ts src/lan-sync/preview.test.ts` cobre token, revisões, retenção de snapshots, cotas, upload retomável com checksum cliente/servidor, assinatura de mídia, ranges e opções de formatos/FFmpeg para proxies. Além da verificação dos formatos, há teste de transcodificação de vídeo curto com FFmpeg **quando o binário está disponível no runner**; nesse teste, o original é comparado antes/depois. **Isso não substitui testes de vídeos reais longos, compatibilidade mobile e LAN entre aparelhos**.

**Critério de conclusão:** não fazer merge em `main` nem marcar F10 como finalizada enquanto CI, testes reais em LAN, transmissão, proxy, conflitos, segurança e export direto dos originais do host não estiverem verificados.
