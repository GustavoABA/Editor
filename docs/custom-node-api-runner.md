# F03 — Executor de scripts Node.js personalizados (Editor ORUME)

> **Estado:** plano técnico detalhado; este documento **NÃO significa que o executor já está implementado**.
> **Prioridade:** fase 2, junto da integração multi-IA. Atualizado em 13/11/2026.

## Requisito funcional (indispensável)

Na interface **Settings → IA → Chamada API → Personalizada** deve existir **uma caixa grande de código Node.js completo**. O usuário cola qualquer script de chamada de API compatível com as permissões do runner — não apenas URL, headers ou JSON e não somente código gerado.

O botão **EXECUTAR** deve realmente rodar esse script em um ambiente Node.js isolado (backend), e mostrar os logs, retorno, erro HTTP e resposta streaming. Também deve haver **VALIDAR, SALVAR, DUPLICAR, CANCELAR, COPIAR CÓDIGO, COPIAR RESULTADO e USAR NO HYPERFRAMES**.

**Diferença entre os dois modos:**

| Modo | Entrada do usuário | Resultado |
|---|---|---|
| Gerador de código Node | modelo/prompt/parâmetros de presets NVIDIA | gera código que pode ser copiado/testado |
| **Personalizada — executor de Node** | **script `.js` / `.mjs` inteiro escrito ou colado** | **executa o próprio script**, mostra logs/resultado, salva como provedor e permite usá-lo em automações compatíveis |

Não substituir o segundo pelo primeiro. Suporte mínimo exigido: ES modules, `import axios from 'axios'`, `async/await`, `axios.post`, `fetch`, headers, payload JSON, mensagens multimodais quando o provedor aceitar, fluxo JSON e streaming, `console.log`/`console.error`, `try/catch` e `main().catch(...)`.

## Exemplo de script completo que o editor deve aceitar

Reproduz o tipo de exemplo fornecido pelo proprietário, com a **correção necessária da variável de ambiente**. No Node.js, `"Bearer $NVIDIA_API_KEY"` é uma string literal: **não** lê a variável automaticamente. O modelo seguro é obter `process.env.NVIDIA_API_KEY`.

```js
import axios from "axios";

const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
const stream = false;
const apiKey = process.env.NVIDIA_API_KEY;

if (!apiKey) {
  throw new Error("NVIDIA_API_KEY não configurada para esta execução");
}

const headers = {
  Authorization: `Bearer ${apiKey}`,
  Accept: stream ? "text/event-stream" : "application/json",
};

async function main() {
  const payload = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this image?" },
          {
            type: "image_url",
            image_url: {
              url: "https://assets.ngc.nvidia.com/products/api-catalog/phi-3-5-vision/example1b.jpg",
            },
          },
        ],
      },
    ],
    model: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
    max_tokens: 65536,
    reasoning_budget: 16384,
    stream,
    temperature: 0.6,
    top_p: 0.95,
  };

  const response = await axios.post(invokeUrl, payload, {
    headers,
    responseType: stream ? "stream" : "json",
  });

  if (stream) {
    for await (const chunk of response.data) {
      console.log(chunk.toString());
    }
  } else {
    console.log(JSON.stringify(response.data));
  }
}

main().catch((error) => {
  if (error.response) {
    console.error(`HTTP ${error.response.status}`);
    console.error(error.response.data);
  } else {
    console.error(error);
  }
});
```

**Nota:** os parâmetros `reasoning_budget`, `max_tokens` e modalidades multimodais devem ser validados para o modelo efetivamente selecionado; um modelo pode rejeitar limites ou campos, e o runner deve mostrar a resposta real. O script demonstra compatibilidade sintática, **não comprova que a conta possui acesso ao endpoint ou que esses parâmetros serão aceitos**.

## Fluxo do usuário na interface

1. Abre **Settings → IA → Chamada API → Personalizada** e escolhe **Novo script**.
2. Cola o arquivo inteiro no editor ou escreve diretamente ali; dá um nome como `Nemotron Axios Personalizado`.
3. Escolhe quais credenciais previamente salvas serão **disponibilizadas somente a esse script** (ex.: `NVIDIA_API_KEY`). Pode configurar outras variáveis de ambiente não secretas e domínios de API autorizados.
4. Clica **Validar** para checar sintaxe e imports. Exibir avisos sobre placeholders literais como `"$NVIDIA_API_KEY"`, sem reescrever código silenciosamente.
5. Clica **Executar**. Backend cria execução isolada com Node e dependências previamente aprovadas (`axios` incluso), executa o **código colado** e transmite status/stdout/stderr/resultado/HTTP ao painel.
6. Opcionalmente escolhe **Salvar como provedor IA**: definir como o script recebe prompt e contexto da timeline e como devolve resposta estruturada. Scripts de teste que apenas fazem `console.log` permanecem utilizáveis manualmente até o usuário mapear a resposta.
7. Escolhe o provedor salvo no painel **HyperFrames**; roteiro, timestamps e mídia são enviados somente se permitidos e no formato que o adaptador entender; resultado validado gera proposta de edição/HTML, revisada antes de aplicar.

## Contrato de integração com HyperFrames

O runner precisa admitir **dois usos**: (A) script livre para diagnóstico/manual; (B) **adaptador para IA**, com entrada/saída estruturadas e versão testada. Para B, documentar contrato estável de entrada `{ prompt, messages, parameters, timelineContext, authorizedAssets }` e saída `{ content, usage?, providerMetadata? }` ou formato tipado equivalente; se necessário, permitir mapear JSON retornado pelo script.

- **Não usar stdout arbitrário como comando de edição.** Resposta deve passar pelo roteador, parser, schema e revisão antes de modificar timeline.
- Nunca entregar vídeo ou áudio bruto à nuvem por padrão; pedir consentimento explícito, considerar compatibilidade multimodal de cada API.
- Permitir cancelamento, timeout, checkpoints, falhas e prioridades de fallback; exibir limitações e custo da chamada.
- Scripts do usuário e outputs não têm acesso direto à timeline, ao sistema de arquivos ou ao backend privilegiado. O Editor é responsável por aplicar ações validadas.

## Segurança e arquitetura de execução

**Risco crítico:** um código Node completo pode executar ações indesejadas. Não executar scripts arbitrários dentro do processo principal Next.js, servidor MCP, render ou ambiente com as credenciais de todos os provedores.

Requisitos obrigatórios:

- Runner em contêiner/processo **efetivamente isolado**, sem privilégios, com filesystem efêmero, sem volumes sensíveis, sem acesso ao Docker socket e com limites de CPU, RAM e tempo.
- Execução consciente: apenas após usuário autorizado clicar executar ou autorizar uma automação; **MCP remoto não executa código livre sem permissão elevada e confirmação explícita**.
- `axios` previamente instalado no ambiente. Dependências adicionais por allowlist com versionamento e revisão; **proibir npm install/npx dinâmico** no script.
- Política de rede: só domínios externos explicitamente autorizados, bloqueio de localhost, IPs privados, DNS rebinding e redirecionamentos a endereços internos (SSRF).
- Segredos por execução e por script, com permissões de escopo mínimo; armazenamento seguro no backend; nunca imprimir tokens (redação de logs e, sobretudo, limitação de rede de saída).
- Cancelamento, isolamento entre execuções, retenção limitada de logs, limpeza do contêiner, supervisão e eventos de auditoria.
- Informar diferenças entre compatibilidade JavaScript/Node e **código Node sem restrições**: algumas operações do host devem ser bloqueadas por segurança.

## Critérios de aceite reproduzíveis

- [ ] Colar o exemplo Axios completo em `Personalizada` e clicar `Executar` aciona processo Node real no runner.
- [ ] `import axios from 'axios'` funciona com dependência disponível, sem instalação manual no projeto do usuário.
- [ ] `process.env.NVIDIA_API_KEY` recebe chave apenas quando autorizada; `"Bearer $NVIDIA_API_KEY"` mostra alerta e não é tratada como valor secreto.
- [ ] Fluxos `stream: false` e `stream: true` informam resposta/erros adequadamente; execução pode ser cancelada.
- [ ] Código, configuração de credenciais e histórico de testes são salvos e recuperados corretamente.
- [ ] Outros endpoints/providers são permitidos conforme política, e cada um pode usar sua própria key.
- [ ] Um script com mapeamento de resposta válido passa a aparecer como provedor selecionável no HyperFrames, sem permitir edição direta desvalidada.
- [ ] Testes demonstram bloqueio de rede interna, execução de shell, leitura de arquivos host, vazamento de credenciais e extensões/dependências não aprovadas.

**Relação com documentação:** `features.md` (F03/F04); `docs/nvidia-api-node.md` (presets/gerador de Node). Esses recursos ainda precisam ser implementados e testados no código do Editor.
