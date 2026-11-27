# Importador web opcional

O Cut Editor pode exibir um importador web baseado em `yt-dlp`, sem chave de API de terceiros. Ele é um serviço opcional e isolado: não é iniciado pelo editor e não recebe acesso ao socket Docker do dispositivo.

## Iniciar no host

```bash
docker compose --profile importer up -d importer
```

Depois, abra **Importar link** no painel de mídia. O serviço fica disponível em `/importer/` tanto pelo endereço LAN padrão (`http://IP_DO_HOST:3100`) quanto pelo endereço HTTPS do Caddy. Quando um download terminar, use **Adicionar downloads à biblioteca**: o arquivo é transferido ao projeto sem precisar selecioná-lo manualmente no dispositivo cliente.

Em uma rede local compartilhada, defina `IMPORTER_PASSWORD` no `.env` antes de iniciá-lo. Os limites de tamanho, duração e concorrência podem ser ajustados pelas variáveis `IMPORTER_*` descritas em `.env.example`.

O arquivo baixado é entregue ao navegador; importe-o pela aba **Media** para colocá-lo no projeto. Use apenas mídia que você possui ou está autorizado a baixar e editar.
