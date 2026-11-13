# F10 — Continuidade de edição entre PC e celular

> **Status:** PLANEJADO, não implementado.
> **Prioridade:** futura; **somente após** F02 → F03 → F04 → F07 → F05 → F09 → F01 → F08. Sem alterar a prioridade de nenhuma delas. **F06 Sounds permanece adiado.**
> **Decisão do proprietário:** 13/11/2026.
> **Referência principal:** [features.md](../features.md), seção F10 e roadmap.

## 1. Resultado esperado

Um projeto iniciado no PC pode ser salvo com **Ctrl+S** diretamente no servidor do Editor, ainda como **projeto editável, sem exportação/renderização**. O servidor recebe tanto a descrição completa da edição (timeline, faixas, animações, áudio, overlays, transições etc.) quanto os **arquivos originais necessários** para reabrir o mesmo trabalho em outro dispositivo.

No celular, o usuário entra no Editor, escolhe o projeto em **Meus projetos**, carrega a timeline com os arquivos disponíveis e **continua a editar**; depois salva e pode voltar ao PC no mesmo projeto. O projeto no celular não pode ser somente um preview ou MP4 pré-renderizado.

**Salvar ≠ exportar**: Ctrl+S não solicita render final, não junta faixas num único vídeo e não altera os originais. O render pode continuar no servidor quando o usuário decidir exportar.

## 2. Fluxos de experiência

### PC → servidor

1. Abrir/editar projeto em PC e usar **Ctrl+S** ou botão **Salvar**; Cmd+S para sistemas que o suportem.
2. O Editor cria versão/revisão do projeto e inventaria todos os ativos obrigatórios, suas dependências e metadados.
3. Envia alterações do projeto e **todo asset necessário que ainda exista apenas no PC** ao armazenamento persistente do servidor. Upload de vídeo grande deve permitir **retomada após interrupção**, partes/chunks e integridade por hash.
4. Exibe claramente três dimensões do estado:
   - **Edição local salva como rascunho** (quando aplicável);
   - **Descrição do projeto recebida no servidor**;
   - **Todos os arquivos originais sincronizados e verificados**.
5. Somente ao concluir as etapas necessárias informa **Pronto para continuar em outro dispositivo**. Se a mídia não terminou de transferir, exibe arquivos pendentes e possibilidade de retomar envio sem perder o projeto.
6. Salva revisões com data/hora e versão, sem sobrescrever silenciosamente uma versão mais nova.

### Servidor → celular → PC

1. Usuário acessa endereço autorizado do Editor pelo navegador do celular e se autentica.
2. Abre **Meus projetos**, identifica o mesmo projeto e escolhe **Continuar edição**.
3. Timeline reconstrói clipes originais, trims, ordem, faixas, volume, fades, keyframes, stickers, efeitos, legendas, imagens, GIFs, composições HyperFrames, metadados de áudio etc.
4. UI mobile touch-first oferece no mínimo selecionar, mover, dividir/encurtar clipes, deslocar overlays, ajustar valores, visualizar áudio e salvar. Ajustes avançados podem ser evoluídos sem tornar o projeto somente leitura.
5. Prévia pode usar proxies de menor resolução sob demanda, economizando memória, banda e CPU do celular; o **arquivo original** permanece disponível no servidor para render/export em qualidade integral.
6. Usuário salva no celular. Ao abrir no PC novamente, a versão mais recente é carregada, com tratamento de conflitos e histórico.

### Rede

- **Na mesma rede local:** usar URL LAN do frontend com autenticação.
- **Fora da rede local:** acesso HTTPS autenticado ao **frontend e mídia** por uma rota remota configurada explicitamente; avaliar arquitetura e custo durante F10.
- O **ngrok da F09 destina-se ao endpoint MCP**: não expor por acidente frontend, biblioteca de vídeo, outros serviços ou editor por meio desse túnel.
- Independente da escolha de acesso, a mesma identidade/autorização de usuário deve controlar projetos e assets.

## 3. Persistência do projeto e ativos

### Documento de edição versionado

Manter um formato de projeto compatível entre desktop/web/mobile, com versão de schema, revisions e migração. Persistir:
- Faixas e clipes, posições e durações, recortes, ponto de início, dimensões, FPS, resolução e relação de aspecto.
- Transformações, texto, legendas, keyframes, efeitos, transições, máscaras, volume/normalização e referências a música/áudio.
- Composições HyperFrames **em formato editável**, com código/estrutura/versões, duração, dependências e eventuais arquivos auxiliares; não substituí-las por MP4 achatado.
- Presets e configurações de projeto que afetam o render, preservando compatibilidade ao reabrir.
- IDs de ativos no servidor, hash, MIME, tamanho, duração/metadata, direito/origem quando aplicável; **nunca** dependência exclusiva de `C:\\...`, `file:`, URL `blob:` ou storage local de um único navegador.
- **Nunca** salvar API keys ou segredos de outros serviços dentro do projeto.

### Arquivos e upload

- Guardar **vídeos, áudios, imagens, GIFs e demais mídias originais** importados localmente — preferencialmente em volume persistente do servidor self-hosted ou storage de objetos que o administrador escolher.
- Upload multipart/chunks, pausável/reiniciável, hash de integridade, progresso por arquivo, tentativas com limite e limpeza segura de uploads parciais.
- Metadados do projeto podem ser salvos antes do fim do envio, mas o projeto deve ficar **Pendente de sincronização**, nunca **Sincronizado**, enquanto houver dependências locais faltantes.
- Metadados e mídia devem ser referenciados por IDs gerenciados pelo servidor; garantir que o editor mobile possa resolver permissões e URLs temporárias.
- Projetos grandes: cotas configuráveis, deduplicação (quando apropriada), armazenamento/backup, estimativa de espaço e tratamento explícito de falta de disco.
- Gerar proxies/miniaturas/waveforms para preview apenas como derivados; não eliminar originais após gerar proxy.
- Para fontes externas de Links, sincronizar o arquivo apenas se obtido **legalmente e com acesso autorizado**. Players incorporados podem continuar dependentes da origem e talvez não possam ser exportados. Exibir essa restrição.

## 4. Edição simultânea e resiliência

- Identificar `projectId`, `revision` e etag/base revision ou equivalente; toda gravação compara a versão atual para não perder edições anteriores.
- Definir política de edição simultânea: *single writer* com aviso e takeover explícito, ou resolução de conflito por revisão. **Não aceitar last-write-wins silencioso.**
- Rascunho local/autosave de recuperação opcionais, sincronização manual por Ctrl+S obrigatória, status de alterações e tentativa de sair com mudanças pendentes.
- Reabrir após reiniciar o PC, servidor, contêiner ou navegador, sem depender da sessão antiga; volumes persistentes e backup documentados.
- Diferenciar cache de preview de projeto/propriedade da timeline para evitar divergência preview vs export.

## 5. Auditoria técnica antes da implementação

O repositório apresenta infraestrutura web em Next.js, componentes de projeto, renderização local/servidor, integração Docker e autenticação. Isso **não confirma** que todo o fluxo PC → servidor → celular já exista.

Conferir na branch atual:
1. Onde ficam os estados de projeto/timeline, esquema e serialização; se `Ctrl+S` já é usado e o que ele persiste.
2. Onde os uploads locais ficam e por quanto tempo: blobs, File System Access, banco, cache, volumes e assets remotos.
3. Qual mecanismo de identidade/autorização está disponível e como proteger projetos/URLs de mídia.
4. Qual infraestrutura de storage persistente existe no Docker/Windows e o custo de manter vídeos originais.
5. Quais operações de timeline e componentes possuem suporte touch/mobile e o que precisa ser adaptado.
6. Se os HyperFrames salvam composição de origem e/ou apenas output renderizado.
7. Compatibilidade das operações F02–F08 com salvamento e reabertura do projeto. F10 deve integrar as funcionalidades já entregues.

**Não começar a fase F10 antes de fechar as fases prioritárias atuais.**

## 6. Marcos sugeridos

- **F10-A — Auditoria e especificação**: mapa real de projeto, arquivos, persistência atual, UI mobile, storage, autenticação e migração de schema.
- **F10-B — Save remoto**: Ctrl+S / botão salvar, revisão no servidor, progresso de sincronização e persistência de originais/resumable uploads.
- **F10-C — Lista e reabertura**: Meus projetos, autorizações de acesso, carregamento independente do PC e restauração de dependências.
- **F10-D — Edição mobile**: timeline responsiva, gestos touch, preview/proxies, operações essenciais, save e export do servidor quando disponível.
- **F10-E — Segurança e consistência**: login, acesso remoto HTTPS opcional, versionamento/conflitos, quotas, backup, recuperação e testes.

## 7. Testes de aceite

1. Criar no PC um projeto com vídeo original grande, áudio, legendas, GIF, animação HyperFrames e três cortes. **Ctrl+S** envia estado editável e todos os originais sem renderizar.
2. Com o servidor ativo e PC desligado, abrir projeto pelo celular; todos os arquivos podem ser acessados pelo servidor e clipes têm os mesmos cortes e tempos.
3. Mudar trims/legendas/volume pelo celular, salvar; reabrir no PC e recuperar essas alterações.
4. Interromper rede no meio de upload; projeto exibe **Sincronização pendente**, retoma transferências e só informa **Sincronizado** ao concluir.
5. Garantir mesmo material em preview e render, sem perda de qualidade por uso de proxies mobile.
6. Simular duas sessões modificando o mesmo projeto: informar conflito/lock e oferecer resolução sem perder edições.
7. Tentar acessar um projeto de outro usuário, URLs privadas de mídia e upload inválido: bloquear corretamente.
8. Reiniciar servidor/contêiner e confirmar que projetos e originais persistem com backup restaurável.
9. Confirmar que a edição não requer chamadas a IAs nem exportar MP4 para salvar, e que nenhuma API key aparece no arquivo de projeto.

## 8. Segurança, privacidade e limites

- **Armazenamento no servidor escolhido pelo usuário** é o padrão desta feature; não escolher ou ativar armazenamento em nuvem de terceiros implicitamente.
- A sincronização deve ser opt-in e mostrar uso aproximado de armazenamento/banda. Arquivos de vídeo podem ser grandes; **não prometer sincronização instantânea**.
- Um arquivo salvo como `MP4` final **não** substitui os originais + estado de timeline. Preview de qualidade baixa é somente derivado.
- Para vídeos, GIFs e mídias de terceiros, respeitar licença/termos e disponibilidade remota.
- Segredos de modelos de IA e de ngrok pertencem ao cofre do backend; jamais serializar em documentos de projeto.
