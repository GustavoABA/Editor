# NVIDIA NIM — exemplos de chamada Node.js para o Editor ORUME

> **Status:** referência de planejamento/uso manual, **não** implementação do gerador na UI. Revisado em 13/11/2026.
>
> A integração gráfica prevista em `features.md` (F03) deve deixar o usuário selecionar os três modelos, cadastrar **uma NVIDIA API key**, editar o prompt e copiar o código Node gerado sem expor a chave.

## Modelos previstos

| Seleção na UI | `model` | Observação de disponibilidade |
|---|---|---|
| Nemotron 3 Nano Omni | `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning` | NVIDIA anuncia Free Endpoint Available |
| Kimi K3 | `moonshotai/kimi-k3` | **Free Endpoint Deprecated** na página individual NVIDIA em 13/11/2026; pode não aceitar a chamada, mesmo com chave válida |
| Gemma 4 31B | `google/gemma-4-31b-it` | NVIDIA anuncia Free Endpoint Available |

**Não confundir:** `moonshotai/kimi-k3` é diferente de `moonshotai/kimi-k3.1-pro`. O K3.1 Pro **não tem endpoint programático liberado** na NVIDIA, segundo sua página Build.

Todos os três presets usam a **mesma interface HTTP**, mas parâmetros/capacidades multimodais podem divergir. Este código valida somente uma chamada **de texto**, não assume suporte uniforme a vídeo/áudio.

## Código Node.js 18+ — `nvidia-test.mjs`

Copie e cole o exemplo abaixo. Não requer bibliotecas externas: utiliza `fetch` nativo do Node 18+.

```js
const MODELS = {
  omni: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
  kimi: "moonshotai/kimi-k3",
  gemma: "google/gemma-4-31b-it",
};

const key = process.env.NVIDIA_API_KEY;
if (!key) {
  throw new Error("Defina NVIDIA_API_KEY no ambiente antes de executar.");
}

const preset = process.argv[2] ?? "omni";
const model = MODELS[preset];
if (!model) {
  throw new Error("Modelo inválido. Use: omni, kimi ou gemma.");
}

const prompt =
  process.argv.slice(3).join(" ") ||
  "Crie uma ideia de animação HTML/CSS para um vídeo vertical.";

const response = await fetch(
  "https://integrate.api.nvidia.com/v1/chat/completions",
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 1024,
      stream: false,
    }),
  },
);

const body = await response.text();
if (!response.ok) {
  throw new Error(
    `NVIDIA respondeu HTTP ${response.status} para ${model}: ${body}`,
  );
}

const result = JSON.parse(body);
console.log(result.choices?.[0]?.message?.content ?? result);
```

**Exemplo no Windows PowerShell:**

```powershell
$env:NVIDIA_API_KEY = "SUA_CHAVE_PRIVADA"
node .\nvidia-test.mjs omni "Descreva uma animação HyperFrames para este roteiro."
node .\nvidia-test.mjs kimi "Escreva HTML e CSS para uma lower third."
node .\nvidia-test.mjs gemma "Sugira títulos animados para um short."
```

Se a NVIDIA descontinuou a rota do Kimi K3, a chamada correspondente deve falhar com HTTP e explicação — **nunca deve ser marcada como conectada** por simples existência da documentação.

## Como a interface do Editor deve gerar esse código

1. Settings → IA → NVIDIA: armazenar a chave no **backend**, nunca no navegador.
2. Mostrar cartões Nemotron Omni, Kimi K3 e Gemma 4; selecionar um preenche o `model`.
3. Usuário edita prompt/mensagens e parâmetros permitidos; o código Node.js e a prévia JSON se atualizam.
4. Botão **Copiar Node.js** copia código pronto que usa `process.env.NVIDIA_API_KEY`, **sem inserir a chave real**.
5. Botão **Testar chamada** envia a solicitação a um serviço backend autorizado, reportando `status`, modalidade, tempo, erro e resposta sem vazar token.
6. Controles de streaming e anexos (imagem, vídeo, áudio) são adicionados **somente após validação do payload de cada modelo**; não passar `video_url` genérico por suposição.
7. Na automação HyperFrames, o roteador escolhe apenas provedores/modelos disponíveis, com capability adequada, checkpoints e aprovação de alterações.

## Fontes oficiais

- https://build.nvidia.com/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning
- https://build.nvidia.com/moonshotai/kimi-k3
- https://docs.api.nvidia.com/nim/reference/moonshotai-kimi-k3-infer
- https://build.nvidia.com/google/gemma-4-31b-it
- https://docs.api.nvidia.com/nim/docs/product

**Limitação:** "Free Endpoint" significa acesso destinado a pesquisa/prototipagem segundo termos e quotas da NVIDIA, não garantia de disponibilidade permanente nem uso gratuito ilimitado/produção. Sem uma chave de usuário autorizada, nenhum teste autenticado pôde ser realizado nesta revisão.
