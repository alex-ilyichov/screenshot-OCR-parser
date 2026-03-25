# Screenshot OCR Parser

A search engine for documentation screenshots. Give it a docs repository; it finds every image, extracts the text, and lets you query across all of it using Boolean expressions.

---

## The problem

Documentation repositories accumulate screenshots. UI walkthroughs, dashboard views, error dialogs — anything that's easier to show than describe. That content is invisible to search. A user looking for a specific error message, a developer grepping for a term, a docs team trying to audit coverage — none of them can reach text that lives inside a PNG.

The fix sounds simple: run OCR across the image corpus and index the results. Getting there was not.

> This project started as an internal tool for a documentation team dealing with a large backlog of UI screenshots that were invisible to search. The team later moved away from screenshots as a documentation pattern — making the tool unnecessary before it shipped. It exists anyway.

---

## Why Tesseract wasn't enough

Tesseract is the default starting point for OCR. It's fast, well-documented, and has broad language support. For scanned documents with clean backgrounds and consistent fonts, it works well.

UI screenshots are a different problem. They contain mixed font sizes, icon labels, truncated strings, low-contrast text on colored backgrounds, and anti-aliased renders at non-standard resolutions. Tesseract's accuracy on this class of image was too low to be useful — it missed words, fragmented tokens, and produced noise that polluted the index.

The root cause is how Tesseract handles color. Its segmentation and layout analysis pipeline binarizes the input — reducing the image to black and white using the Otsu thresholding algorithm before any text detection occurs. A UI screenshot with colored backgrounds, gradients, or anti-aliased text on a non-white surface gets flattened to two values. The color information that makes those images readable to a human is discarded before Tesseract even starts looking for text.

---

## Switching to EasyOCR

EasyOCR uses a deep learning pipeline (CRAFT for text detection, CRNN for recognition) that handles the visual complexity of UI screenshots significantly better. The tradeoff is weight: the model files are large, initialization takes several seconds, and it requires PyTorch.

That last point determined the architecture.

---

## Architecture: why two processes

EasyOCR is Python-native. There is no equivalent in the Node.js ecosystem. The orchestration layer — crawling directory trees, managing file lists, evaluating queries, writing output — is a natural fit for Node.js. Rewriting it in Python, or rewriting the OCR integration in JavaScript, would have added complexity without benefit.

The solution is a long-lived Python subprocess that handles OCR, communicating with the Node.js layer over a stdin/stdout JSON protocol:

```
Node.js (orchestrator)
  │
  │  stdin: "init en\n"
  │  stdin: "read_text /path/to/image.png\n"
  │
  ▼
Python process (easyocr_script.py)
  │
  │  stdout: {"status": "success", "message": "Reader initialized"}
  │  stdout: {"status": "success", "data": [{"bbox": [...], "text": "...", "confidence": 0.98}]}
  │
  ▼
Node.js parses response, extracts words, updates index
```

The Python process initializes once and stays alive for the duration of the run. EasyOCR model loading happens at startup, not per image. This matters: loading the model for each image would make the tool unusably slow.

---

## The query engine

The index is a map of image paths to word sets. Queries are Boolean expressions evaluated against that index:

```
water
water | salt
salt & dough
water | (salt & dough)
!finance & account
```

`&` is AND, `|` is OR, `!` is NOT. The parser (jsep) produces an AST; a recursive evaluator walks it against each image's word set. This gives exact, predictable results with no ranking or fuzzy matching — the right tradeoff for a documentation search tool where precision matters more than recall.

---

## Environment: the hard part

Getting the Python environment right was more work than the OCR logic.

**PyTorch version:** PyTorch 2.2+ crashes with `SIGILL` (illegal instruction) on some ARM64 environments, including Apple Silicon in certain Docker base images. The fix is pinning to 2.1.0.

**NumPy version:** NumPy 2.x introduced breaking changes that are incompatible with PyTorch 2.1. Pin to `numpy<2`.

**Python version:** EasyOCR and the pinned PyTorch build require Python 3.9. System Python on macOS is currently 3.13. Running without a virtual environment targeting 3.9 produces PIL import errors.

These three constraints interact. Getting any one of them wrong produces a different failure mode, which makes diagnosis slow. Docker solves the problem by locking the entire environment:

```dockerfile
FROM python:3.9-slim
# ...
RUN pip install easyocr torch==2.1.0 torchvision==0.16.0 "numpy<2"
RUN python -c "import easyocr; easyocr.Reader(['en'])"  # pre-bake models
```

The model pre-bake step downloads EasyOCR's weights at image build time. The resulting container works offline and starts fast.

---

## Quick start

**Docker (recommended)** — no local Python or Node.js required.

```bash
git clone git@github.com:alex-ilyichov/screenshot-OCR-parser.git
cd screenshot-OCR-parser

# First build: 10–15 min (downloads PyTorch and EasyOCR models)
docker build -t screenshot-ocr-parser .

# Run against the bundled test data
docker run --name ocr-run \
  -v $(pwd)/repo-test-ocr:/ocr-project/repo-test-ocr \
  -e BASE_DIR=/ocr-project/repo-test-ocr \
  screenshot-ocr-parser

# Copy results out
docker cp ocr-run:/ocr-project/src/ocr_results.json ./ocr_results.json
docker rm ocr-run
```

**Local** — requires Node.js 18+, Python 3.9, and a virtual environment.

```bash
python3.9 -m venv myenv
source myenv/bin/activate
pip install -r requirements.txt
npm install
node src/parse-write-easy-OCR.mjs
```

---

## Expected directory structure

The crawler looks for `_images/` folders anywhere inside the target directory tree:

```
your-docs-repo/
  docs/
    _images/
      screenshot1.png
    section-name/
      _images/
        screenshot2.png
  releasenotes/
    _images/
      screenshot3.png
```

Set `BASE_DIR` to point at your repo root. The crawler handles arbitrary nesting depth.

---

## Tradeoffs and known constraints

| Constraint | Detail |
|---|---|
| Docker image size | ~2.2 GB. EasyOCR models and PyTorch CPU build are large. Expected. |
| First build time | 10–15 min on first run; cached on subsequent builds. |
| Python 3.9 required locally | 3.10+ untested with the pinned torch/numpy combination. |
| CPU only | No GPU acceleration. Throughput is adequate for documentation corpora; not suitable for real-time or high-volume pipelines. |
| English only | Language list is hardcoded to `['en']` in the initializer. Adding languages means modifying `parse-write-easy-OCR.mjs` and rebuilding the Docker image. |

---

## License

See LICENSE.md.
