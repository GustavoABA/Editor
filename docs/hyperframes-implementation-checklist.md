# Checklist adicional para Codex — HyperFrames

Todas as alterações desta feature só podem acontecer na branch `teste/implementacao`.

- Validar o HyperFrames nativo no **mesmo** contêiner `web`, sem segundo serviço (o Dockerfile de `services/hyperframes` existe somente para smoke CI).
- Validar a versão fixa da CLI oficial no `services/hyperframes/package.json`; exigir rebuild do web somente quando a versão mudar.
- Validar formato `index.html`, `class="clip"`, `data-duration` e WebM com alfa de acordo com a documentação atual.
- Validar Chromium nativo do `web`, tmpfs de 4GiB nominais, carregamento do binário `/opt/opencut-hyperframes/server.mjs` e subprocesso com ambiente reduzido.
- Testar codec VP9 alpha no Mediabunny e no `scene-exporter`; se a composição ficar opaca no resultado, priorizar render mais fiel ou um caminho alternativo de composição.
- Adicionar testes de integração que demonstrem HTML/CSS simples, layouts complexos, render, importação, Undo e re-render.
- Revisar segurança: HTML/CSS não pode executar rede, shell ou scripts; sem contêiner isolado, reconhecer o risco residual do subprocesso e do Chromium.
- Testar a transcrição PT-BR real de Parakeet/Whisper + AI baseada em contexto, sem enviar áudio bruto a provedores pagos.
- Homologar arquivos e cenas em 16:9 e 9:16 e a preservação do projeto nos dois dispositivos LAN.
