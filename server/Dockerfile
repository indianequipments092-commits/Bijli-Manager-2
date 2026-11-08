FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-writer libreoffice-calc libreoffice-impress \
    poppler-utils fonts-noto-core fonts-noto-extra fonts-lohit-deva fonts-liberation \
    && rm -rf /var/lib/apt/lists/*
# Devanagari font for real text edits (/v1/pdf-edit-text): pehle Google Fonts se lao,
# na mile to apt se aaya hua font /app/fonts/ me copy karo (build kabhi fail nahi hoga).
RUN mkdir -p /app/fonts && (python3 -c "import urllib.request;urllib.request.urlretrieve('https://github.com/googlefonts/noto-fonts/raw/main/hinted/ttf/NotoSansDevanagari/NotoSansDevanagari-Regular.ttf','/app/fonts/NotoSansDevanagari-Regular.ttf')" || true) && (test -s /app/fonts/NotoSansDevanagari-Regular.ttf || cp /usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf /app/fonts/NotoSansDevanagari-Regular.ttf 2>/dev/null || cp /usr/share/fonts/truetype/lohit-devanagari/Lohit-Devanagari.ttf /app/fonts/NotoSansDevanagari-Regular.ttf 2>/dev/null || true)
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py .
ENV PORT=8080
# 1 worker + threads: concurrency limit app.py ke andar (CONCURRENCY) ginta hai, isliye workers ek hi rakho
CMD ["sh","-c","exec gunicorn app:app --bind 0.0.0.0:${PORT} --workers 1 --threads 4 --timeout 200"]
