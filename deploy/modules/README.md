# F30/F31 — Extensões Docker e WhatsApp (experimental)

## Fluxo desejado

Instalação global única da Evolution API v2.3.7; após instalar, WhatsApp aparece na barra de abas. Conectar por telefone internacional (DDI + DDD), exibir apenas pairingCode retornado pela API; confirmar em Aparelhos conectados > Conectar dispositivo > Conectar com número de telefone. O código pode ser alfanumérico dependendo da versão/WhatsApp. Não há QR na UI. Após estado open, informar número remetente e ligar o switch por projeto. Projeto precisa existir no host (Ctrl+S).

O módulo não importa textos, histórico, grupos, mensagens enviadas pelo próprio usuário, status ou JIDs sem número resolvido. Para evitar duplicar arquivos em projetos diferentes, o mesmo remetente só pode estar ativo em um projeto por vez; números distintos podem alimentar projetos distintos. Desativar interrompe novos recebimentos sem desinstalar ou apagar arquivos. Fotos, vídeo, áudio e documentos com MIME audiovisual suportado são aceitos; documentos genéricos (PDF/ZIP/executáveis) não são editáveis e ficam de fora. Sem envio automático de mensagens.

A mídia é persistida em originais do volume LAN e caixa de entrada por projeto, deduplicada por ID da mensagem. O navegador aberto consulta a cada 5 s, importa um item por ciclo pela pipeline de thumbnails existente e salva como mídia editável normal. Não insere automaticamente clipes na timeline. Com navegador fechado, o arquivo permanece no inbox do projeto; o manifesto do projeto recebe o asset pelo fluxo normal de sincronização quando o cliente reabrir/importar. Desativar mantém inbox; para materializar pendentes, reative. Não declarar sincronização completa antes de confirmar o save do host.

## Instalação do supervisor (uma vez por host)

A instalação por clique depende do supervisor separado, com acesso privilegiado ao Docker. O web não tem socket Docker e não executa comandos arbitrários. A fila aceita somente install para o catálogo local; versão Evolution v2.3.7, PostgreSQL 15 e Redis 7-alpine são candidatos fixos por tag e resolvidos para digest na primeira instalação. Não é homologação ARM64 nem aprovação de proveniência; a política final deve ter digests aprovados previamente. O módulo tem rede privada para dependências e rede do Editor para API/webhook; nenhuma porta publicada. Chaves aleatórias geradas pelo supervisor ficam no host e no volume LAN, nunca retornadas ao browser. O mesmo token LAN atual autentica o painel; separar autorização administrativa por usuário é pendência.

Em Linux com systemd e checkout em /opt/cut-editor, após atualizar a aplicação e subir o Compose base:

```sh
sudo install -m 0644 deploy/modules/cut-editor-modules.service /etc/systemd/system/
sudo install -m 0644 deploy/modules/cut-editor-modules.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cut-editor-modules.timer
```

Adapte WorkingDirectory e ExecStart se o checkout estiver em outro caminho. Em ambiente sem systemd, o host precisa executar periodicamente `python3 deploy/modules/supervisor.py` por agendador compatível. Não existe ainda provisionamento automático universal do supervisor no Docker Mobile. Para diagnosticar, execute o supervisor manualmente em host de teste ou consulte journalctl -u cut-editor-modules.service. O módulo usa stack Compose independente (cut-editor-evolution). Não usar down -v. F13 ainda precisa integrar backups e atualização de módulos, incluindo volumes de banco e sessões.

## Limites e homologação

32 MiB por arquivo (limite conservador por uso de base64), 1 GiB e 1000 itens por inbox. No MVP o retorno do webhook é síncrono; fila durável de download, retry, limpeza/retention, recuperação de instalação interrompida, suporte a mídias grandes, conversão OGG para iOS, reconexão, troca/logout de conta e envio de render ainda requerem validação/implementação. A Evolution API pode manter mensagens em seu próprio banco para recuperação de mídia; não confundir filtro do Editor com ausência de armazenamento do provedor. Baileys é não oficial e pode sofrer restrições/desconexões do WhatsApp; usar conta de teste e consentimento.

Critérios de aceite: instalação limpa via clique no AMD64 e ARM64; persistência de pareamento após reboot; recebimento por código sem QR; testar 2 projetos e números diferentes, desativação, texto/grupos/número não autorizado, duplicatas, mensagens antigas, arquivo inválido, limites, cliente fechado, importação de áudio/foto/vídeo e export real, reinício e backup. Não executar em conta real sem homologação.


## Segundo lote — recebimento durável e provisionamento

O webhook grava uma fila persistente de até 200 recebimentos antes de confirmar. O supervisor executa o worker interno autenticado independentemente do navegador, um item por ciclo, com até cinco tentativas e backoff. A tela mostra itens pendentes/falhos, permite tentar novamente ou descartar falhas, e informa heartbeat do supervisor. A regra do projeto é conferida antes e depois do download; desligar o switch cancela recebimentos ainda não finalizados daquela ativação. Arquivos já finalizados permanecem disponíveis para importação mesmo desativado. A fila é projetada para uma instância web única, não é distribuída entre réplicas.

A instalação inicial em Linux systemd pode ser provisionada com `sudo python3 deploy/modules/provision.py --confirm-trusted-checkout` em checkout e diretórios ancestrais confiáveis, root-owned e não graváveis por usuários não privilegiados. O script instala as duas unidades com o caminho real e ativa o timer. Após este bootstrap único, o usuário usa apenas a interface para instalar o módulo. Android/VM sem systemd ainda exige o agendador compatível; não prometemos boot universal. Não habilitar serviços privilegiados sobre checkout modificável por terceiros.

Correção do digest: nomes abreviados Docker Hub e nomes canônicos docker.io/library são tratados igualmente; pins existentes precisam pertencer aos repositórios do catálogo. v2.3.7 possui imagens AMD64/ARM64 publicadas, mas o stack não foi executado em dispositivo real. Não converter áudio em MP4 via Evolution automaticamente; preservar o MIME original. Compatibilidade OGG/iOS ainda pendente. Mantido limite inicial de 32 MiB para evitar pressão de memória de base64.

Testes: `python3 -m unittest discover -s deploy/modules -p 'test_*.py' -v`; smoke isolado com Evolution simulada: `cd apps/web && bun run src/modules/evolution/inbox-smoke.ts`. Valida roteamento de dois projetos, filtro, deduplicação, gravação/download do original, desativação e retry; não equivale a WhatsApp real. CI também valida Compose opcional. Pendente integrar provisionamento ao instalador final F13 e backup dos volumes Evolution, recuperação de falhas de disco/instalação e autorização granular.
