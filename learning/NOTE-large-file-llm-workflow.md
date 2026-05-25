# Working with Large File Collections as LLM Input
_Note: May 2026 — Learned from processing 1500+ files across 5 sources_

---

## The Problem

LLMs have finite context windows (128K–200K tokens ≈ 400–600 pages of text). When your source data is thousands of files totaling millions of tokens, you **cannot** just "give it all to the LLM." You need a pipeline.

---

## The Strategy: Script → Summarize → Analyze

```
┌─────────────────────────────────────────────────────┐
│  RAW DATA (thousands of files, too large for LLM)   │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────▼────────────────┐
          │  EXTRACTION SCRIPTS         │
          │  (Python/bash, no LLM)      │
          │  · Pattern matching         │
          │  · Counting / classifying   │
          │  · Aggregating statistics   │
          └────────────┬────────────────┘
                       │
          ┌────────────▼────────────────┐
          │  COMPRESSED OUTPUT          │
          │  (JSON/tables, fits in LLM) │
          │  · Statistics               │
          │  · Samples (not full data)  │
          │  · Anomalies / outliers     │
          └────────────┬────────────────┘
                       │
          ┌────────────▼────────────────┐
          │  LLM ANALYSIS               │
          │  (Interpret, recommend,     │
          │   write the narrative)      │
          └─────────────────────────────┘
```

**Rule:** LLM does the *thinking*. Scripts do the *counting*.

---

## Practical Steps

### 1. Understand the structure first

Before writing any scripts, sample 3–5 files to understand:
- File format (JSON, Markdown, CSV, binary?)
- Key fields / sections
- Size distribution (are they all 1KB or some are 500KB?)
- Date/time info (for temporal analysis)

```bash
# Quick structure check
ls source_dir/ | head -10
wc -c source_dir/sample_file.md
head -50 source_dir/sample_file.md
```

### 2. Write extraction scripts, not reading scripts

❌ **Wrong:** Ask LLM to "read all 500 files and tell me patterns"  
✅ **Right:** Write a Python script that:
- Iterates all files programmatically
- Extracts specific fields/patterns using regex
- Counts, classifies, groups
- Outputs a **compressed summary** (JSON, table, or short text)

**Template:**
```python
import glob, json, re
from collections import Counter, defaultdict

results = defaultdict(Counter)
for filepath in glob.glob("source/**/*.md", recursive=True):
    with open(filepath) as f:
        content = f.read()
    # Extract what you need
    # Classify, count, bucket
    # Store compressed result

# Output summary (this is what the LLM will read)
print(json.dumps(results, indent=2))
```

### 3. Design for batching

If even the summary is too large, process in batches:
- By date (month by month)
- By source type (separate scripts per source)
- By topic/domain (split by keyword)

Each batch produces a small JSON → LLM reads all batch summaries.

### 4. Sampling strategy for qualitative analysis

For pattern recognition (not just counting), extract **representative samples**:
- 5 best examples (of whatever you're looking for)
- 5 worst examples
- 5 random
- 5 outliers (longest, shortest, most unusual)

This gives the LLM enough material to identify patterns without reading everything.

### 5. Cross-referencing multiple sources

When correlating across sources (e.g., "did sessions lead to commits?"):
- Script A: extract dates + topics from source 1 → JSON
- Script B: extract dates + topics from source 2 → JSON
- Script C: join on date/topic → correlation summary
- LLM: interpret the correlation

---

## Scale Reference (from this session)

| Source | Files | Total size | LLM-readable output |
|--------|-------|-----------|-------------------|
| VS Code Copilot sessions | 323 .md | ~15 MB | 40-line stats table |
| ChatGPT conversations | 5 JSON files (482 convos) | ~80 MB | 30-line summary |
| MS Copilot sessions | 116 .md | ~5 MB | 20-line summary |
| Confluence wiki | 639 .md | ~10 MB | Keyword index |
| Git repos | 278 commits | N/A | Monthly counts |

**Compression ratio: ~110 MB of raw data → ~3 KB of actionable stats.** That's what fits in LLM context.

---

## Anti-Patterns

| ❌ Don't | ✅ Do instead |
|----------|--------------|
| Ask LLM to "read all files" | Write a script to count/classify |
| Paste 500 lines of raw output | Paste 10-line summary + 3 examples |
| Process all sources at once | One script per source, combine results |
| Expect LLM to hold 1500 files in memory | Use LLM only on compressed summaries |
| Skip structure exploration | Always sample 3–5 files first |
| Write one monolithic script | Write modular scripts that output JSON |

---

## When to Use RAG / Graph Instead

If the goal is **ongoing queryable access** (not one-time analysis):
- **< 200K tokens total** → just dump into context (no tooling needed)
- **200K – 2M tokens** → RAG with vector DB (ChromaDB, Qdrant)
- **2M+ tokens with relationships** → Knowledge graph (Graphify, GraphRAG)
- **Temporal / evolving data** → Graphiti (tracks what was true when)

For **one-time analysis** (like this session), scripts + LLM is faster and simpler than setting up infrastructure.

---

## Quick Decision Tree

```
"I have a lot of files and want LLM to help analyze them"
    │
    ├── Total size < model context window (200K tokens)?
    │   └── YES → just give it all to the LLM directly
    │
    ├── One-time analysis?
    │   └── YES → Script → Compress → LLM interprets
    │
    ├── Repeated / ongoing queries?
    │   └── YES → Set up RAG or knowledge graph
    │
    └── Need relationships between entities?
        └── YES → Graph approach (Graphify / GraphRAG)
```

---

_Created: 2026-05-25_
_Context: Processing 1500+ files across VS Code Copilot, ChatGPT, MS Copilot, Confluence wiki, and git repos in a single analysis session._
