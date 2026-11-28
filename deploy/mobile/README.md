# Cut Editor — F13, primeira etapa experimental

**Status:** implementação inicial na branch teste/implementacao. Não é uma release estável, nem um instalador final para Android. O verificador é somente leitura e não aplica atualizações. Nenhum acesso Docker foi concedido ao Editor web/MCP.

## Pré-requisitos

- Host Linux/VM com Docker Engine e Compose >= 2.24.4, Python 3, iproute2, espaço suficiente e rede LAN acessível.
- AMD64 ou ARM64 do daemon; o suporte real ao ARM64 depende dos builds e dos testes. Android/Termux PRoot não garante suporte ao Docker Engine. Configure o daemon/VM para iniciar no boot pelo mecanismo do sistema.
- Para VM, confirme bridge/port forwarding. Não exponha portas à internet. Preserve o nome Compose e diretório originais para instalações existentes.
- A geração de .env usa segredos novos apenas se o arquivo não existir; configure credenciais opcionais separadamente e mantenha o arquivo privado.

## Desenvolvimento em host compatível

Execute da raiz do checkout da branch de teste:

```sh
python3 deploy/mobile/host.py check
python3 deploy/mobile/host.py init
# Se a detecção de IP falhar:
# python3 deploy/mobile/host.py init --lan-host 192.168.1.10
docker compose config --quiet
# Primeira compilação de desenvolvimento em PC/host com recursos suficientes:
python3 deploy/mobile/host.py start --build
python3 deploy/mobile/host.py status
```

O comando start sem --build usa imagens já presentes e não tenta baixá-las. Ainda não há um pacote de distribuição estável pré-compilado; não é necessário compilar em celular para validar a proposta. O build inicial é pesado. Não execute o comando de teste sobre produção sem backup.

Para testar Mobile Lite em uma instalação descartável:

```sh
python3 deploy/mobile/host.py start --lite --build
docker compose -f docker-compose.yml -f deploy/mobile/compose.lite.yml ps
```

O override inicia serviços essenciais sem local-ai/parakeet; o web deixa de depender do container de IA. Não desliga serviços pesados que já estejam rodando: em uma instalação existente, planeje a parada deles depois de terminar jobs. A indisponibilidade dos motores deve ser testada na UI. O modo Lite não ativa modelos automaticamente sob demanda ainda.

O script imprime os endereços LAN HTTP e HTTPS. Configure firewall privado, confiança na CA local e atualize OPENCUT_LAN_HOST/NEXT_PUBLIC_SITE_URL manualmente se o IP mudar. DHCP automático e mDNS são próximos passos. O ngrok continua opt-in.

## Inicialização no boot (exemplo systemd)

Ajuste os caminhos dos arquivos de unidade para o checkout real e preserve o usuário/projeto Docker. A unidade principal opera Docker (acesso privilegiado); o monitor usa DynamicUser e não tem acesso a Docker. Selecione start --lite no ExecStart somente se desejar perfil Lite e se as imagens já estiverem instaladas. Teste primeiro a execução manual; não habilite unidades em hosts sem systemd. Os arquivos são exemplos, não ativam serviços por conta própria.

```sh
sudo install -m 0644 deploy/mobile/cut-editor.service /etc/systemd/system/
sudo install -m 0644 deploy/mobile/cut-editor-monitor.service /etc/systemd/system/
sudo install -m 0644 deploy/mobile/cut-editor-monitor.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cut-editor.service
sudo systemctl enable --now cut-editor-monitor.timer
systemctl status cut-editor.service cut-editor-monitor.timer
journalctl -u cut-editor-monitor.service -n 20
```

## Monitor de versões (somente leitura)

```sh
python3 deploy/mobile/release_monitor.py
python3 -m unittest discover -s deploy/mobile -p 'test_*.py' -v
```

O monitor consulta a release pública mais recente do repositório e procura cut-editor-stable.json. Valida estrutura, nomes de imagens por digest, serviços e plataformas; grava status atomicamente. Sem release pública, registra no-public-stable-release. Mesmo que encontre manifesto, o estado é unverified: assinatura/proveniência e gate de CI ainda não foram implementados. Não executa pull, build, up, rollback ou script remoto.

## CI / GHCR

O workflow F13 Docker multiarch candidates valida testes Python e Compose, e constrói web, local-ai, parakeet e MCP para linux/amd64 e linux/arm64. Em PR não publica imagens. Após o workflow chegar à main, o disparo manual com publish_candidate pode publicar tags candidate-SHA no GHCR e reunir manifesto de candidatos. O manifesto é artefato de CI, NÃO release estável; candidato parcial ou falho não pode ser consumido pelo updater.

Próximas etapas: homologar builds (inclusive imagens de terceiros, runtime e ARM64 real), fixar digests de todas as dependências e bundle Compose, gate estável automatizado após testes, assinatura/verificação, comparação com versão instalada, transação de download/instalação, backup e rollback seguros, coordenação com sessões e jobs ativos, painel autenticado e testes de energia/rede. Não habilitar auto-instalação até essas etapas.
