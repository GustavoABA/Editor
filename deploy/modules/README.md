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
