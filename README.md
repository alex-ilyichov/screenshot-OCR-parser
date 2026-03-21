# Screenshot OCR Parser

A polyglot search engine for documentation screenshots. Crawls a repository's `_images/` folders, runs OCR on every PNG/JPEG via EasyOCR, builds a word index, and lets you query it using Boolean expressions (`word1 & word2`, `word1 | word2`, `!word`).

## Architecture

- **Node.js (ES modules)** — orchestration: crawls image directories, drives the OCR backend, builds the index, evaluates queries
- **Python + EasyOCR + PyTorch** — OCR backend, communicates with the Node.js layer via stdin/stdout JSON protocol
- **Docker** — fully self-contained, no local Python or Node.js environment required

## Quick start (Docker — recommended)

Requires [Docker](https://docs.docker.com/get-docker/) only. No Python, Node.js, or GPU needed.

**1. Clone the repo**

```bash
git clone git@github.com:alex-ilyichov/screenshot-OCR-parser.git
cd screenshot-OCR-parser
```

**2. Build the image** (first build takes 5–10 minutes — downloads PyTorch CPU and EasyOCR models)

```bash
docker build -t screenshot-ocr-parser .
```

**3. Run against the bundled test data**

```bash
docker run --name ocr-run \
  -v $(pwd)/repo-test-ocr:/ocr-project/repo-test-ocr \
  -e BASE_DIR=/ocr-project/repo-test-ocr \
  screenshot-ocr-parser
```

To copy the results to your host machine after the run:

```bash
docker cp ocr-run:/ocr-project/src/ocr_results.json ./ocr_results.json
docker rm ocr-run
```

**4. Run against your own image corpus**

Replace `$(pwd)/repo-test-ocr` with any directory that follows the structure below:

```
your-docs-repo/
  docs/
    section-name/
      _images/
        screenshot1.png
        screenshot2.png
  releasenotes/
    _images/
      screenshot3.png
```

```bash
docker run --rm \
  -v /path/to/your-docs-repo:/ocr-project/repo-test-ocr \
  -e BASE_DIR=/ocr-project/repo-test-ocr \
  screenshot-ocr-parser
```

## Boolean query syntax

Queries use `&` (AND), `|` (OR), and `!` (NOT):

```
water
water | salt
salt & dough
water | (salt & dough)
!finance & account
```

The default test query in the script is `water|(salt&dough)` — matches the bundled test images.

## Test data

`repo-test-ocr/` contains sample images across a nested `docs/` and `releasenotes/` structure, mirroring a real documentation repository layout. Used to verify the crawler, OCR pipeline, and query engine end-to-end.

## Local development (without Docker)

Requires Node.js 18+, Python 3.9+, and a virtual environment.

```bash
# Python environment
python3 -m venv myenv
source myenv/bin/activate
pip install -r requirements.txt

# Node.js dependencies
npm install

# Run
node src/parse-write-easy-OCR.mjs
```

## License

See LICENSE.md.
