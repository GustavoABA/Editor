# A self-contained CPU fallback for HyperFrames. The model is deliberately
# baked into this image so a LAN/mobile host never needs Ollama or a download
# at runtime.
FROM curlimages/curl:8.12.1 AS model

ARG MODEL_URL="https://huggingface.co/Qwen/Qwen2.5-Coder-0.5B-Instruct-GGUF/resolve/main/qwen2.5-coder-0.5b-instruct-q4_k_m.gguf"
ARG MODEL_SHA256="1d9614638d18024d0fbb36575a15f1302a3adf044df10345688ec4f6e1c4ff32"

USER root
RUN mkdir -p /models \
  && curl --fail --location --retry 4 --retry-all-errors --output /models/hyperframes-fallback.gguf "$MODEL_URL" \
  && echo "$MODEL_SHA256  /models/hyperframes-fallback.gguf" | sha256sum -c -

# Official llama.cpp OpenAI-compatible server. It has no published host port;
# only the Editor web container can call it over Docker's internal network.
FROM ghcr.io/ggml-org/llama.cpp:server
COPY --from=model /models/hyperframes-fallback.gguf /models/hyperframes-fallback.gguf
