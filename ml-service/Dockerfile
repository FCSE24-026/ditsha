FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
ENV PIP_DEFAULT_TIMEOUT=180 PIP_RETRIES=8
RUN pip install --no-cache-dir --prefer-binary -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
