# Use a slim Python image
FROM python:3.9-slim

ENV PYTHON_PATH=/usr/bin/python3
ENV PYTHONPATH=/usr/local/lib/python3.9/site-packages
ENV LANG=C.UTF-8
ENV LC_ALL=C.UTF-8

# Set working directory
WORKDIR /ocr-project

# Install system dependencies for OCR
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*



# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Node.js from official source
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    npm install -g npm && \
    rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . .

ENV PYTHONHTTPSVERIFY=0

# Ensure certifi is installed to handle SSL certificate verification
RUN pip install --no-cache-dir certifi

# Install Node.js dependencies
RUN npm install

RUN chmod -R 666 /ocr-project

# Set up default command
CMD ["node", "src/parse-write-easy-OCR.mjs"]
