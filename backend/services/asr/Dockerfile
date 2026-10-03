FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MOSS_ASR_HOST=0.0.0.0 \
    MOSS_ASR_PORT=5580

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

RUN mkdir -p /app/backend/services/asr && touch /app/backend/__init__.py
COPY . /app/backend/services/asr

ARG DOWNLOAD_MODELS=1
RUN if [ "$DOWNLOAD_MODELS" = "1" ]; then \
      python -m backend.services.asr.download_model; \
    fi

EXPOSE 5580

HEALTHCHECK --interval=15s --timeout=3s --start-period=120s --retries=10 \
  CMD python -c "import json,urllib.request; assert json.load(urllib.request.urlopen('http://127.0.0.1:5580/health'))['ready']"

CMD ["python", "-m", "backend.services.asr.main"]
