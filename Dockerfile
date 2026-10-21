FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    poppler-utils fonts-noto-core fonts-noto-extra fonts-lohit-deva fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV PORT=8080
# 1 worker + threads: concurrency limit app.py ke andar (CONCURRENCY) ginta hai, isliye workers ek hi rakho
CMD ["sh","-c","exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 200"]
