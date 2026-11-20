# F10 — Implementação inicial do Editor híbrido LAN

> **Status (19/11/2026):** primeira entrega **experimental**, em branch `feature/lan-hybrid-sync`. Não declarar F10 concluída até integração, testes e revisão de segurança. Ver [features.md](../features.md) e [cross-device-project-sync.md](cross-device-project-sync.md).

## Componentes implementados nesta etapa

- Edição, prévia e cache local do navegador foram **mantidos**.
- Novo armazenamento persistente no host via volume `lan_sync_data`, separado de renders temporários.
- API `/api/lan-sync/projects` para listar projetos editáveis e `/api/lan-sync/projects/:id` para ler/salvar o documento serializado e a lista de mídias; **revisões otimistas** retornam 409 em conflito.
- Transferência automática de originais, iniciada ao detectar mídias no editor, **sem bloquear a timeline**, em chunks de 4 MiB, com possibilidade de pular partes já recebidas após falha de conexão. O servidor concatena, calcula SHA-256 e confirma a gravação.
- Snapshot/checkpoint persistente no host na primeira gravação e quando uma gravação ocorre após 180 segundos; cliente conectado dispara checkpoints a cada 180 segundos. **Ctrl+S** ou botão **Salvar no host** também executam checkpoint manual.
- Status ⚠️ de upload pendente/falha no cabeçalho e barra de progresso percentual; dispositivos sem originais exibem **placeholder ⚠️ no clipe de vídeo/imagem e aviso para áudio**, preservando seus cortes e metadados.
- Seção **Projetos do servidor LAN** em `/projects` para importar projeto editável do host para o navegador atual.

## Como ativar no host

1. Defina no arquivo `.env` **na raiz do repositório** uma senha aleatória própria, com **ao menos 16 caracteres**:

   ```env
   OPENCUT_LAN_SYNC_TOKEN=defina-um-segredo-longo-e-unico-aqui
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
- A página de projetos ainda **baixa o original inteiro** no cliente se o arquivo tiver até 80 MiB; mídias maiores não são importadas automaticamente e aparecem como ⚠️. **Proxies/streaming remoto ainda não implementados.**
- A exportação final **agora reutiliza originais verificados no host** quando existe token de LAN ativo: o manifest inclui referências, o servidor recupera os originais da biblioteca persistente e os copia ao job de render. Arquivos ainda não sincronizados continuam usando o caminho de upload tradicional. Se um clipe não tiver bytes locais nem original verificado no host, a exportação é **bloqueada**. **Pendente:** testar mídia grande, falhas e integração com proxy ao vivo; cópia de host → pasta de render ainda consome espaço temporário.
- O hash SHA-256 é calculado pelo servidor ao montar os chunks, mas ainda não é comparado com um hash produzido independentemente pelo cliente. Falta verificação end-to-end, validação de assinatura de bytes/MIME, proteção de quotas por usuário e restrições avançadas de taxa.
- Checkpoints são criados durante uma **sessão ativa com cliente conectado**, não por daemon independente na ausência de edições/sessão. Se a conexão cair, o servidor conserva a última revisão que recebeu e o navegador mantém seu rascunho local.
- Ao abrir projeto em outro dispositivo, o armazenamento local pode ser duplicado e grande; falta mecanismo de proxy/URL autenticada para tornar o cliente verdadeiramente leve.
- Sem sincronização colaborativa CRDT nem merges automáticos: conflitos (409) **bloqueiam sobregravação** e exigem reabrir a versão do servidor.
- Exclusão/renomeação/duplicação locais ainda não estão propagadas integralmente para a biblioteca do host; é necessário desenhar política de remoção sem perder mídias partilhadas.
- Exibição de ⚠️ foi adicionada para **clipes visuais/áudio sem original disponível no cliente**; falta verificar UX mobile e distinguir cada motivo de indisponibilidade por asset.
- Não houve teste prático entre dois computadores ou celulares nesta sessão. A compilação é verificada via CI quando disponível.

## Testes automatizados adicionados

`bun test apps/web/src/lan-sync/server.test.ts` (executar da raiz do repositório) cobre token de acesso, revisões, snapshots, upload por partes e caminhos inválidos. O CI do projeto passa a executar esse teste no job de build.

**Critério de conclusão:** não fazer merge em `main` nem marcar F10 como finalizada enquanto CI, testes reais em LAN, transmissão, proxy, conflitos, segurança e export direto dos originais do host não estiverem verificados.
