# Use a slim Python image
FROM python:3.9-slim

ENV PYTHONPATH=/usr/local/lib/python3.9/site-packages
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8
ENV IN_DOCKER=1

WORKDIR /ocr-project

# Install system dependencies for OCR and Node.js in one layer
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (CPU-only torch)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download EasyOCR models so container works offline
RUN python -c "import easyocr; easyocr.Reader(['en', 'fr'])"

# Copy project files (node_modules excluded via .dockerignore)
COPY . .

# Install Node.js dependencies
RUN npm install

# Set up default command
CMD ["node", "src/parse-write-easy-OCR.mjs"]
