# Docker and LAN validation

Run from the repository root. Compose reads the root .env (or an explicit --env-file), not apps/web/.env automatically. Keep existing secrets and volumes. For a fresh installation use apps/web/.env.example as a reference and generate unique secrets; do not use example tokens in production.

Set OPENCUT_LAN_HOST to the actual host LAN IP or local DNS name (no scheme or port). Set NEXT_PUBLIC_SITE_URL to the HTTPS URL clients will use. Set OPENCUT_LAN_SYNC_TOKEN to a unique random secret of at least 16 characters, and BETTER_AUTH_SECRET to a random secret of at least 32 characters. Configure the remaining required environment variables.

```sh
docker compose config --quiet
docker compose build web local-ai
docker compose up -d
docker compose ps
curl --fail http://localhost:3100/api/health
docker compose logs --tail=100 web local-ai caddy
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./editor-lan-root.crt
```

From another device on the same network, open https://HOST (replace HOST with the configured address). Trust the exported Caddy root certificate only after verifying its origin; never distribute the CA private key. On iOS, installation of the certificate profile and explicit full trust may be necessary. Allow TCP 443 on the host firewall for the private LAN only. Do not expose the editor or MCP ports to the internet without an explicit security review.

For a command-line check, replace HOST with the configured address:

```sh
curl --fail --cacert ./editor-lan-root.crt https://HOST/api/health
```

Acceptance:
- Database, Redis, web healthy; local AI responds at /health inside the Docker network.
- HTTPS health returns 2xx using the CA (without disabling verification).
- Create a disposable project on PC, connect LAN sync with the token, import a video larger than 4 MiB, interrupt and restore the connection, verify the upload completes.
- Open the project on a second device, edit and save, then reopen from the host. Verify preview playback, seek, and original export.
- Restart the stack and confirm the test project persists.
- Check HyperFrames rendering and the optional importer separately.

The CI smoke test validates Docker and HTTPS on the runner, not the physical Wi-Fi, firewall, mobile certificate trust or full editor workflow. Do not run docker compose down --volumes on a real installation: this deletes stored projects and other persisted data.


## Identidade Cut Editor e atualização sem perda de dados

A imagem web passa a se chamar `cut-editor-web:local`. O nome do projeto Compose existente, os volumes, credenciais internas e rede permanecem intactos para não criar uma instalação vazia. Em instalações novas, use `COMPOSE_PROJECT_NAME=cut-editor` no .env da raiz se desejar o nome Cut Editor também no agrupamento do Docker Desktop. Não altere esse valor em uma instalação existente sem migrar os volumes e verificar backups.

A foto provisória de Gustavo fica em `apps/web/public/maintainer.svg`. Para usar uma foto JPG/PNG, adicione o arquivo em public e atualize as referências na página inicial e Contributors; reconstrua a imagem web.

Verificação manual de UI: abrir /, /contributors, /sponsors, /roadmap, /projects; confirmar que /blog retorna 404; importar um vídeo curto, reabrir um projeto com thumbnails ausentes, salvar PNG/JPEG/WebP como sticker, reabrir Stickers → Salvos e conferir os logs no cabeçalho. Stickers são locais ao navegador e continuam sujeitos à cota já existente; codecs não suportados podem continuar sem thumbnail.
