# Checklist adicional para Codex — HyperFrames

Todas as alterações desta feature só podem acontecer na branch `teste/implementacao`.

- Compilar e executar o worker Docker de `services/hyperframes`.
- Fixar versão da CLI `hyperframes` e dependências npm após build/homologação.
- Validar formato `index.html`, `class="clip"`, `data-duration` e WebM com alfa de acordo com a documentação atual.
- Corrigir ambientes Chromium com sandbox e tmpfs antes de habilitar tráfego de usuário.
- Testar codec VP9 alpha no Mediabunny e no `scene-exporter`; se a composição ficar opaca no resultado, priorizar render mais fiel ou um caminho alternativo de composição.
- Adicionar testes de integração que demonstrem HTML/CSS simples, layouts complexos, render, importação, Undo e re-render.
- Revisar a política de segurança: nenhum código ou recurso gerado pode executar rede, shell ou scripts no host.
- Testar a transcrição PT-BR real de Parakeet/Whisper + AI baseada em contexto, sem enviar áudio bruto a provedores pagos.
- Homologar arquivos e cenas em 16:9 e 9:16 e a preservação do projeto nos dois dispositivos LAN.
