FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg libsndfile1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*
RUN python -m pip install --no-cache-dir "moondream>=2.5,<3" "faster-whisper>=1.2,<2"
WORKDIR /service
COPY server.py /service/server.py
ENV HF_HOME=/models/huggingface
ENV XDG_CACHE_HOME=/models/cache
EXPOSE 8707
CMD ["python", "-u", "/service/server.py"]
