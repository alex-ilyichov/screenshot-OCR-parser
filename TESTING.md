# Testing Guide

See [README.md](README.md) for project overview, architecture, and background.

This document covers two ways to test the project: via Docker (recommended, no local setup needed) and locally (requires Python and Node.js).

---

## Option 1: Dockerized testing (recommended)

No Python, Node.js, or GPU required. Works on any machine with Docker installed.

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) or [Rancher Desktop](https://rancherdesktop.io/)

### Steps

**1. Clone the repo**
```bash
git clone git@github.com:alex-ilyichov/screenshot-OCR-parser.git
cd screenshot-OCR-parser
```

**2. Build the image**

First build takes 10–15 minutes — downloads Python dependencies and pre-bakes EasyOCR models into the image.
```bash
docker build -t screenshot-ocr-parser .
```

**3. Run against bundled test images**
```bash
docker run --name ocr-run \
  -v $(pwd)/repo-test-ocr:/ocr-project/repo-test-ocr \
  -e BASE_DIR=/ocr-project/repo-test-ocr \
  screenshot-ocr-parser
```

**4. Copy results to your machine**
```bash
docker cp ocr-run:/ocr-project/src/ocr_results.json ./ocr_results.json
docker rm ocr-run
```

**5. Inspect results**
```bash
open ocr_results.json   # macOS
# or just open the file in any text editor
```

You should see a JSON array — each entry is an image file with extracted words. The script also runs a Boolean query `water|(salt&dough)` automatically and saves matches to `~/query_results.json` inside the container.

### Expected output (last lines of the run)
```
📄 OCR results saved to: /ocr-project/src/ocr_results.json
🔍 Parsing query: water|(salt&dough)
✅ Query results saved to: /root/query_results.json
🚀 Script execution finished.
```

---

## Option 2: Local testing

Requires Node.js 18+ and Python 3.9. Dependency versions matter — see below.

### Prerequisites

- [Node.js](https://nodejs.org) 18+
- [Python 3.9](https://www.python.org/downloads/release/python-3919/) (not 3.10+, not system Python on macOS which may be 3.13)
- A Python virtual environment

### Steps

**1. Clone the repo**
```bash
git clone git@github.com:alex-ilyichov/screenshot-OCR-parser.git
cd screenshot-OCR-parser
```

**2. Create a Python virtual environment with Python 3.9**
```bash
python3.9 -m venv myenv
source myenv/bin/activate
```

**3. Install Python dependencies**
```bash
pip install easyocr torch==2.1.0 torchvision==0.16.0 "numpy<2"
```

> **Why these versions?** PyTorch 2.2+ crashes with SIGILL on some ARM64 environments. NumPy 2.x is incompatible with PyTorch 2.1. These pins are the tested-working combination.

**4. Install Node.js dependencies**
```bash
npm install
```

**5. Run**
```bash
node src/parse-write-easy-OCR.mjs
```

Results are saved to `src/ocr_results.json`.

---

## Test data

`repo-test-ocr/` contains sample images in the expected directory structure:
```
repo-test-ocr/
  docs/
    _images/          ← finance dashboard screenshots, recipe images
    docLev1/
      _images/        ← more sample images
  releasenotes/
    _images/          ← additional samples
    1level/
      _images/
      2ndLevel/
        _images/
```

The bundled query `water|(salt&dough)` matches images from the recipe screenshots. To test with different queries or your own images, edit the `testQuery` variable at the bottom of `src/parse-write-easy-OCR.mjs`.

---

## Known issues and notes

| Issue | Details |
|-------|---------|
| Python version sensitivity | Local setup requires Python 3.9. System Python on macOS (3.13) will fail with PIL import errors. Always use a venv. |
| PyTorch version | 2.2+ crashes with SIGILL on ARM64 Docker environments. Pin to 2.1.0. |
| NumPy version | NumPy 2.x is incompatible with PyTorch 2.1. Pin to `numpy<2`. |
| Docker image size | ~2.2GB — EasyOCR models and PyTorch are large. Normal. |
| First Docker build | 10–15 min on first run, cached on subsequent builds. |
