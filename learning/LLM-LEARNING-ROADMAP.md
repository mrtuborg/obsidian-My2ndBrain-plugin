# LLM-Augmented Engineering — Learning Roadmap
## From Reactive User to Infrastructure-Level Practitioner
_Profile: Embedded Linux / Platform Engineer · May 2026_

> This document is your **personal curriculum**. It maps where you are now (from session analysis) to where the reference docs describe you should be. Each item is a practice task with a clear goal, a "what you'll learn" explanation, and a verification test.
>
> Cross-references: `LLM-BEST-PRACTICES.md` (interaction patterns) · `LLM-ENGINEERING-STACK.md` (tools and architecture)

---

## Your Baseline (May 2026)

From the session analysis (`COPILOT-INTERACTION-ANALYSIS.md`):

```
WHAT YOU DO WELL                          WHAT NEEDS WORK
────────────────────────────────────────────────────────
✅ Explicit constraint injection          ❌ Session openers lack paths/scope
✅ Staged, phased project discipline      ❌ No persistent project memory files
✅ Template-driven batch work (Apr)       ❌ No MCP — context pasted manually
✅ Platform routing (3 LLMs by task)      ❌ Correction cascade (→ reframe instead)
✅ Self-observability (session logging)   ❌ No formalized skill library
✅ Bloom's: strong at EVALUATE            ❌ Rarely reach ANALYZE before accepting fix
```

**Stack maturity: L2 → L3** (from `LLM-ENGINEERING-STACK.md`, Part X)

```
L1 Reactive   → L2 Guided ← YOU ARE HERE → L3 Systematic → L4 Automated
```

---

## How to Use This Document

**Primary goal: improve your LLM interactions.** This roadmap teaches you to use the modern LLM stack — context engineering, tools, skills, cognitive discipline, system architecture.

**Secondary goal: ship something real.** Abstract learning doesn't stick. Every module is practiced on a concrete project so the skill lands in muscle memory, not just theory.

Each task below is a **practice module**:
- **LLM SKILL** — what interaction capability you are building
- **LEARN** — the concept behind it (linked to reference docs)
- **DO** — the concrete action, applied to the practice project
- **VERIFY** — how you confirm the LLM skill worked (not just that the code works)

Work top to bottom. Each module builds on the previous.

Mark your progress:
- `[ ]` Not started
- `[→]` In progress
- `[✓]` Done and verified

---

## Practice Vehicle

The **`obsidian-2ndbrain-plugin`** project is your learning ground. It is used in every module because:
- It is a real project you use daily (feedback is immediate and honest)
- It is small enough to hold in one session
- It has a complete spec and existing JS code to port — no invention required
- It spans all LLM skill areas: context, tools, skills, large data (TestSuite), architecture

**The plugin advances as a side effect of practicing LLM skills.** If you do the modules correctly, you get a working plugin. But the plugin shipping is not the goal — the LLM skill is.

When a module says "do X on the plugin" — the real task is "practice LLM skill Y. The plugin gives you a real problem to practice on."

---

## LEVEL 1 — Context Engineering (1–2 hours total)

> **Theme:** Stop explaining the same things every session. Make the model know your project permanently.
> Reference: `LLM-ENGINEERING-STACK.md` Part IV §4.3 · `LLM-BEST-PRACTICES.md` Part II §2.1

### MODULE 1.1 — Project Instructions File
_Effort: 15 min · Impact: Highest single change_

**[ ] LLM SKILL: Permanent context injection — make the model know your project without explaining it every session**

**LEARN:**
Every Copilot session starts with zero memory. The instructions file is injected automatically into every session as a hidden system prompt — you never need to paste project context again. It's the difference between a new contractor who needs orientation every day and one who's been properly onboarded.

Your session data shows ~40% of corrections happen because Copilot assumed the wrong repo or path. This file eliminates that category of error entirely.

What goes in it: repo structure, key component paths, hard constraints (things Copilot must never do), conventions, and current project phase.

**DO (practice on the plugin repo first — it's already set up):**
Open a fresh Copilot session in `obsidian-2ndbrain-plugin/`. Type:
```
What do you know about this project?
```
Observe what Copilot says — it should already describe the plugin architecture, constraints, and phase without you saying anything. **Read the instructions file it's using** (`.github/copilot-instructions.md`) and understand which line caused which answer.

Then deploy the same skill to your production repos:
```bash
mkdir -p /Users/vn/ws/platform-development/roomboard-linux.github/.github
# Use DRAFT-copilot-instructions-roomboard.md as starting point
# Strip the # learning comments, save markdown content
```

**VERIFY (the LLM skill, not the file):**
After deploying to roomboard: open a fresh session, ask "What do you know about this project?" Then deliberately try to make Copilot assume the wrong path — it should resist. If it doesn't, the instructions file needs a harder constraint in the "What NOT to do" section.

---

### MODULE 1.2 — Sensio-Linux Instructions File
_Effort: 15 min_

**[ ] LLM SKILL: Context switching between projects — two repos, two identities, zero confusion**

**LEARN:**
You have two active production repos. The correction rate spikes when you switch between them (your May sessions show this — sensio-linux work had higher correction rates than roomboard work). A second instructions file gives each repo its own context layer. The LLM skill here is learning **what information actually changes the model's behavior** vs. what's decorative.

**DO:**
Model it after the roomboard version. Capture the differences that actually affect model behavior:
- Different hardware target (C5 gateway, not imx8mp)
- Different Yocto build layout (`build_c5/`, `meta-c5-gateway/`)
- Different branch (`dev/update-system-refactoring`)
- distupgrade / RPM packaging workflow

```bash
mkdir -p /Users/vn/va/sensio-linux/.github
# Create .github/copilot-instructions.md
```

**VERIFY:** Same test — fresh session, ask "What do you know about this project?" Then switch to the other repo and do the same. The model should give completely different answers with no input from you.

---

### MODULE 1.3 — Session Opening Habit
_Effort: 0 min (habit, not tool)_

**[ ] LLM SKILL: Front-loading context — give the model what it needs before it asks wrong questions**

**LEARN:**
From `LLM-BEST-PRACTICES.md` Part II §2.2:
```
"Continuing work on [project].
Last session: [1–2 sentences — what was done / what's broken].
This session goal: [specific bounded objective].
Key constraint: [if anything changed]"
```
Your data shows sessions starting with openers under 50 words have a 41% correction rate. This template costs 30 seconds and front-loads everything Copilot needs. The underlying principle: **the first message determines the entire session's mental model**. A bad opener means the model builds the wrong frame, and every subsequent correction is fighting that frame.

**DO:** For the next week, write this template at the start of every session — not just plugin sessions, all sessions. Notice what happens when you skip it.

**VERIFY:** You'll feel the difference — fewer "no, that's not what I meant" moments. Specifically: measure if you reach a correction within the first 3 turns. If yes, your opener was missing something.

---

## LEVEL 2 — Tool Layer (2–4 hours total)

> **Theme:** Give the model tools so it can see your environment, not just what you paste.
> Reference: `LLM-ENGINEERING-STACK.md` Part V §5.2–5.4

### MODULE 2.1 — MCP: Filesystem + Git Servers
_Effort: 30 min · Unlocks: L3_

**[ ] LLM SKILL: Stop pasting — let the model read files itself**

**LEARN:**
Without MCP, Copilot is blind to your filesystem. You paste context to it. With MCP filesystem + git servers, Copilot can:
- Read any file directly (no paste needed)
- Run `git log`, `git diff`, `git status` itself
- Check CI status via GitHub MCP

MCP is the "USB-C standard for AI tools" — one protocol, works with any MCP-compatible client. You configure it once in `.vscode/mcp.json` and it's available in every session.

Think of the before/after:
```
BEFORE: [you paste 50 lines of a script] "what's wrong with this?"
AFTER:  "read ci/build_image.sh and tell me what's wrong with the error handling"
```

**DO:**
Create `/Users/vn/ws/platform-development/roomboard-linux.github/.vscode/mcp.json`:
```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem",
               "/Users/vn/ws/platform-development/roomboard-linux.github"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository",
               "/Users/vn/ws/platform-development/roomboard-linux.github"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}" }
    }
  }
}
```

Prerequisites:
```bash
npm install -g npx        # if not already installed
pip install uv            # for uvx
export GITHUB_TOKEN=<your-PAT>
```

**VERIFY:**
Open a Copilot session, type:
```
Read the file ci/build_image.sh and summarize what it does.
```
If Copilot reads it without you pasting anything — MCP is working.

---

### MODULE 2.2 — MCP: Memory Server (Cross-Session State)
_Effort: 10 min_

**[ ] LLM SKILL: Persistent memory — the model remembers across sessions without you re-explaining**

**LEARN:**
Your 36-43% correction rate is partly caused by re-explaining device states, stage progress, and current blockers at the start of every session. The `memory` MCP server provides a persistent key-value store — Copilot can write facts to it and read them back in future sessions.

Example workflow:
```
Session 1: "Remember that device serial 25000 completed Stage 6 on 2026-05-24"
→ Memory stores: {device_25000_stage: "Stage 6 complete, 2026-05-24"}

Session 2 (next day, fresh start):
"What stage is device 25000 on?"
→ Copilot checks memory → answers correctly without you telling it
```

**DO:** Add to `.vscode/mcp.json`:
```json
"memory": {
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-memory"]
}
```

**VERIFY:**
```
"Remember: the sensio-linux repo is on branch dev/update-system-refactoring"
[close session, open new session]
"What branch is sensio-linux on?"
```
Copilot should answer from memory without you saying anything.

---

### MODULE 2.3 — Graphify: Codebase Knowledge Graph
_Effort: 10 min setup + 5 min per project_

**[ ] LLM SKILL: Graph-based context — let the model navigate your codebase as a graph, not a flat list of files**

**LEARN:**
From `LLM-ENGINEERING-STACK.md` Part IV-B §4B.1:

Right now, when you start a session about HAB + CAAM + recovery_builder, you mentally reconstruct the dependency chain. Graphify does this automatically — it maps every file, function, and concept into a navigable graph and generates a `GRAPH_REPORT.md` showing:
- **God nodes** — the concepts everything else depends on (likely: `confme`, `CAAM`, `recovery_builder`)
- **Surprising connections** — links between files you didn't know were related
- **Suggested questions** the graph can answer that you'd otherwise have to trace manually

The graph then becomes queryable by Copilot via MCP:
```
"What connects stage6 to the initramfs boot sequence?"
→ Copilot traverses the graph, answers in seconds
```

**DO:**
```bash
pip install graphifyy          # note: double-y
# Verify it installed:
graphify --version

# Install as a Copilot CLI skill:
graphify install --platform copilot

# Run on your main repo:
cd /Users/vn/ws/platform-development/roomboard-linux.github
graphify .
```
> ⚠️ First run takes a few minutes (AST extraction across the whole repo). Subsequent runs are incremental.

Check the output:
```bash
open graphify-out/graph.html   # interactive browser view
cat graphify-out/GRAPH_REPORT.md
```

**VERIFY:** Read `GRAPH_REPORT.md`. Do the "god nodes" match your mental model of the most central concepts? If yes — the graph is accurate. If something surprising appears — that's valuable new information.

---

## LEVEL 3 — Skill Library (1–2 hours total)

> **Theme:** Reusable workflows. Stop re-prompting from scratch for recurring task types.
> Reference: `LLM-ENGINEERING-STACK.md` Part VIII · `LLM-BEST-PRACTICES.md` Part III

### MODULE 3.1 — Formalize Your Batch Analysis Skill
_Effort: 20 min_

**[ ] LLM SKILL: Reusable prompt templates — turn your best session patterns into one-line invocations**

**LEARN:**
Your April 2026 batch analysis work (30 sessions in one day, all using `{{REPORT_FILE}}` templates) was the most efficient LLM work in your entire 3-month dataset — 37.8% correction rate with maximum throughput. That was an informal skill. Now make it permanent and reusable.

A skill file is just a Markdown file with a parameterized prompt template. You invoke it the same way every time, fill in the parameters, and get consistent results. Zero cognitive overhead.

**DO:**
```bash
mkdir -p /Users/vn/ws/platform-development/roomboard-linux.github/.copilot/skills
```

Create `.copilot/skills/analyze-test-report.md`:
```markdown
# SKILL: analyze-test-report

## Purpose
Analyze a RoomMate test report and classify each finding.

## Parameters
- {{REPORT_FILE}} — path to the report file (relative to repo root)
- {{DEVICE}} — device serial number (optional)

## Prompt
You are a test analysis agent for the RoomMate embedded Linux platform.

Read: {{REPORT_FILE}}
Read relevant spec from: docs/SPEC-*.md
Read relevant source from: RoomMate/

For each failure:
1. Identify the failing component and file
2. Classify as: CODE-FIX | SPEC-ISSUE | ENVIRONMENT | KNOWN-LIMITATION
3. Write a 2–3 sentence analysis
4. Suggest the minimal fix

Output: structured markdown, one section per failure.
Do NOT analyze other report files.
Do NOT ask questions unless classification is genuinely ambiguous.
```

**VERIFY:** Run it on `docs/REPORT-FAIL-2026-04-21.md`. Compare output quality to your April batch sessions — it should be at least as good, consistently.

---

### MODULE 3.2 — Create a Deployment Stage Skill
_Effort: 15 min_

**[ ] LLM SKILL: Parameterized skills — encode your domain workflow so the model executes it consistently**

**LEARN:**
Your stage-anchored prompts (`"stage 6 should be executed on device from recovery console..."`) were one of your most effective patterns. Converting it to a skill means you get consistent stage context automatically — plus it documents the stage constraints for future engineers (including yourself 6 months from now).

**DO:** Model it similarly — parameters: `{{STAGE}}`, `{{DEVICE_SERIAL}}`, `{{DEVICE_IP}}`. Include the invariants (what must be true before/after each stage) and the constraints (no host-side changes for device-side stages).

**VERIFY:** Use it to plan your next stage work session. Does it save you the 2-minute context-setting at session start?

---

### MODULE 3.3 — Session Close Habit
_Effort: 0 min (habit)_

**[ ] LLM SKILL: Session closing discipline — capture what the model learned so the next session starts warm**

**LEARN:**
65% of your sessions end mid-discussion. This means your context file is never updated, your next session re-discovers what you just learned, and your success rate shows as 6% (you almost never signal "done"). The cost is paid the next morning when you spend 10 minutes reconstructing where you were.

The fix is one prompt at session end:
```
"Summarize what we accomplished and what the next step should be. I'll save this."
```
Paste that into your project context file (or trigger your daily-dev-tracker automatically).

**VERIFY:** After 2 weeks, check if your continuation session openers got shorter because you had the close summary to paste.

---

## LEVEL 4 — Large Data Processing with LLMs (2–4 hours total)

> **Theme:** When data exceeds what fits in context, you need a pipeline — not bigger prompts.
> Reference: `NOTE-large-file-llm-workflow.md` (full theory) · `scripts/` (working examples you can reuse)

This level teaches the most common mistake senior engineers make when they start using LLMs seriously: **trying to feed everything to the model at once**. The model has a finite context window. When data exceeds it, you get hallucinations, missed patterns, or outright errors. The solution is a discipline, not a setting.

---

### The Core Mental Model

```
WRONG APPROACH                      RIGHT APPROACH
──────────────────────────────────────────────────────────────
"Here are 500 log files,           Script extracts → compresses
 tell me what's wrong"              → LLM interprets summary
                                    → asks targeted follow-up
```

**Rule:** LLM does the *thinking*. Scripts do the *counting and extracting*.

---

### MODULE 4.1 — Understand the Scale Problem
_Effort: 20 min (reading + sizing exercise)_

**[ ] LLM SKILL: Data scale awareness — know before you start whether to paste, script, chunk, or RAG**

**LEARN:**

Context windows have a hard limit. Exceeding it doesn't produce an error — it silently drops older content ("lost in the middle" problem). The model answers confidently with incomplete data.

Token math:
- 1 token ≈ 4 characters of English text
- Claude Sonnet 4.6 context: 200K tokens ≈ **800 KB of text**
- GPT-5.3-Codex: 128K tokens ≈ **500 KB of text**

The decision tree for any large data task:

```
Total data size?
│
├── < 400 KB → just paste it all (stays in context safely)
│
├── 400 KB – 2 MB → Script to compress → give LLM the summary
│
├── 2 MB – 50 MB → Script + chunk processing (batch per day/file/topic)
│                  OR set up RAG (ChromaDB, Qdrant)
│
└── 50 MB+ with relationships → Knowledge graph (Graphify, GraphRAG)
    50 MB+ temporal/evolving  → Graphiti
```

**DO:**

Run this sizing exercise on your own data sources:

```bash
# Size your sources
du -sh /Users/vn/vaults/Sources/myMac/2026-*/copilot-sessions/*.md | tail -1
du -sh /Users/vn/vaults/Sources/Sensio-Confluence/
du -sh /Users/vn/vaults/Sources/chatgpt-sessions/
du -sh /Users/vn/ws/platform-development/roomboard-linux.github/docs/
du -sh /Users/vn/ws/platform-development/roomboard-linux.github/REPORTS/

# Count tokens roughly (chars / 4)
find /Users/vn/vaults/Sources/Sensio-Confluence/ -name "*.md" \
  -exec wc -c {} + | tail -1
```

Fill in this table for yourself:

| Source | Size | Approach |
|--------|------|----------|
| VS Code sessions (323 files) | ~15 MB | Script → compress |
| Confluence wiki (639 pages) | ~10 MB | Script → compress |
| Roomboard docs/ | ? | ? |
| Roomboard REPORTS/ | ? | ? |
| ChatGPT sessions | ~80 MB | Script → compress |

**VERIFY:** You can state for each source: "This fits in context / needs scripting / needs RAG / needs graph." No guessing.

---

### MODULE 4.2 — Write Your First Extraction Script
_Effort: 45 min_

**[ ] LLM SKILL: Extraction scripting — compress raw data into LLM-queryable form before the session starts**

**LEARN:**

This is the core skill. You have `REPORTS/` and `docs/REPORT-*.md` in roomboard-linux.github. Right now you either paste them one by one or write a batch template. Instead: one script that scans all reports, extracts the structured data (date, device, pass/fail, which tests failed), and outputs a summary table that fits in one screen. Then you give *that* to the LLM for analysis.

The pattern in detail:
```
Raw reports (N files)
   ↓  extract_reports.py
   ↓  · reads each file
   ↓  · regex-extracts: date, result, failures
   ↓  · groups by date / device / component
   ↓  · outputs: 30-line summary table
   ↓
LLM receives 30-line table
"What patterns do you see in these failures?"
   ↓
LLM gives insight across ALL reports, not just the one you pasted
```

**DO:**

Create `scripts/extract_test_reports.py`:

```python
#!/usr/bin/env python3
"""
Test Report Extractor
=====================
Scans roomboard-linux.github docs/ and REPORTS/ for test reports,
extracts structured data, and outputs a summary table for LLM analysis.

Usage:
    python3 extract_test_reports.py
    python3 extract_test_reports.py --since 2026-04-01
    python3 extract_test_reports.py --component confme

Output:
    Console: summary table (LLM-ready)
    /tmp/report_summary.json: machine-readable
"""
import glob, re, json, sys
from datetime import datetime

REPO = "/Users/vn/ws/platform-development/roomboard-linux.github"
PATTERNS = {
    'result':    r'(PASS|FAIL|SKIP)',
    'date':      r'(\d{4}-\d{2}-\d{2})',
    'component': r'(confme|argus|alarm|distupgrade|initrd|CAAM|HAB)',
    'device':    r'[Ss]erial[:\s]+(\d+)',
}

reports = []
for filepath in glob.glob(f"{REPO}/**/*REPORT*", recursive=True):
    try:
        content = open(filepath).read()
    except:
        continue
    entry = {'file': filepath.split('/')[-1]}
    for key, pattern in PATTERNS.items():
        match = re.search(pattern, content)
        entry[key] = match.group(1) if match else '?'
    reports.append(entry)

# Sort and print summary
reports.sort(key=lambda x: x.get('date', ''))
print(f"{'Date':<12} {'Result':<6} {'Component':<14} {'Device':<8} {'File'}")
print("-" * 70)
for r in reports:
    print(f"{r['date']:<12} {r['result']:<6} {r['component']:<14} "
          f"{r['device']:<8} {r['file']}")

print(f"\nTotal: {len(reports)} reports | "
      f"PASS: {sum(1 for r in reports if r['result']=='PASS')} | "
      f"FAIL: {sum(1 for r in reports if r['result']=='FAIL')}")

json.dump(reports, open('/tmp/report_summary.json', 'w'), indent=2)
```

**VERIFY:**
1. Run the script — does it produce a clean summary table?
2. Paste that table (not the raw reports) into Copilot and ask: "What components have the most failures? Any temporal patterns?"
3. The answer should be better than what you get from pasting one report at a time.

---

### MODULE 4.3 — Chunked Processing for Large Datasets
_Effort: 45 min_

**[ ] LLM SKILL: Chunked processing — handle data too large for one context window systematically**

**LEARN:**

Some datasets are too large even for a compressed summary in one pass. The answer is **chunking** — process in logical batches, have the LLM analyze each batch, then have it synthesize across batch summaries.

```
365 daily log files
   ↓ split into weekly chunks (52 × 7 files)
   ↓ Script summarizes each week → 52 × one-paragraph summaries
   ↓ LLM reads all 52 summaries (fits in context)
   ↓ "What are the patterns across the whole year?"
```

The key insight: **the LLM only ever sees summaries, never raw data**. You control what gets compressed and what gets preserved.

**DO:**

Extend your extraction script with a `--chunk-by week` flag that:
1. Groups reports by week
2. For each week: generates a 3-line summary (N tests, N failures, top component)
3. Outputs all weekly summaries as one combined table

```python
# Chunk by month example
from collections import defaultdict

by_month = defaultdict(list)
for r in reports:
    month = r['date'][:7] if r['date'] != '?' else 'unknown'
    by_month[month].append(r)

for month in sorted(by_month.keys()):
    chunk = by_month[month]
    fails = [r for r in chunk if r['result'] == 'FAIL']
    components = set(r['component'] for r in fails if r['component'] != '?')
    print(f"{month}: {len(chunk)} tests, {len(fails)} failures "
          f"in: {', '.join(components) or 'none'}")
```

**VERIFY:** Ask the LLM: "Based on these monthly summaries, which month had the worst quality? What component is the most problematic over time?" — it should answer correctly from the summary table alone.

---

### MODULE 4.4 — Multi-Source Correlation
_Effort: 1 hour_

**[ ] LLM SKILL: Multi-source correlation — combine signals from separate data stores into a single LLM query**

**LEARN:**

Your most valuable insights come from correlating sources that don't talk to each other directly. From this session's analysis, we correlated:
- Session dates → commit dates → "which sessions produced code?"
- Session topics → wiki pages → "what did you ask AI that was already documented?"

The pattern is always the same:
```python
# Script A extracts from source 1 → dict keyed by date/id
# Script B extracts from source 2 → dict keyed by date/id
# Script C joins them on the key, computes overlap/delta
# LLM interprets the join result
```

**DO:**

Create `scripts/correlate_sessions_commits.py` — a clean version of what we ran during this analysis session. It should:
1. Extract session dates + topics from `2026-*/copilot-sessions/*.md`
2. Extract commit dates + messages from git log
3. Join on date
4. Output: for each day, sessions count + commit count + dominant topic

This becomes your **weekly engineering efficiency report** — run it every Friday, paste the output into Copilot:
```
"Based on this week's session/commit data, where did I spend most time? 
Was it productive (sessions → commits) or exploratory (sessions → no commits)?"
```

**VERIFY:** The script runs without errors. The output table makes sense when you look at a week you remember clearly.

---

### MODULE 4.5 — RAG Setup for the Wiki (When Scripts Aren't Enough)
_Effort: 2 hours_

**[ ] LLM SKILL: Retrieval-augmented generation — query a large knowledge base without loading it all into context**

**LEARN:**

Scripts work well for structured data (logs, reports, git history). For **unstructured prose** — specs, how-to articles, design documents — you need semantic search. That's RAG.

With RAG over your 639-page Confluence wiki:
```
BEFORE: "what's the distupgrade flow?" → Copilot guesses from training data
AFTER:  "what's the distupgrade flow?" → RAG retrieves the actual spec page
                                       → Copilot answers from your real docs
```

This also solves the wiki retrieval failure problem (10% of your sessions asked AI about wiki-documented topics). With RAG, Copilot finds the right page automatically.

**DO:**
```bash
pip install chromadb sentence-transformers
```

Create `scripts/index_wiki.py`:
```python
#!/usr/bin/env python3
"""
Index Confluence wiki into ChromaDB for semantic search.
Run once to build the index, then use query_wiki.py for lookups.

Usage:
    python3 index_wiki.py          # build/rebuild index
    python3 query_wiki.py "HAB secure boot fuse burning"
"""
import chromadb, glob, os
from chromadb.utils import embedding_functions

WIKI_BASE = "/Users/vn/vaults/Sources/Sensio-Confluence/RoomMate Development"
DB_PATH   = "/Users/vn/vaults/Sources/Sensio-Confluence/.chromadb"

client = chromadb.PersistentClient(path=DB_PATH)
ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"  # local, no API needed
)
collection = client.get_or_create_collection("wiki", embedding_function=ef)

pages = glob.glob(os.path.join(WIKI_BASE, "**/*.md"), recursive=True)
print(f"Indexing {len(pages)} pages...")
for i, path in enumerate(pages):
    content = open(path, encoding='utf-8', errors='ignore').read()[:4000]
    rel = os.path.relpath(path, WIKI_BASE)
    collection.upsert(documents=[content], ids=[rel], metadatas=[{"path": rel}])
    if i % 50 == 0:
        print(f"  {i}/{len(pages)}")

print("Done. Index saved to", DB_PATH)
```

Then a companion query script:
```python
# query_wiki.py
import sys, chromadb
from chromadb.utils import embedding_functions

DB_PATH = "/Users/vn/vaults/Sources/Sensio-Confluence/.chromadb"
query = " ".join(sys.argv[1:]) or "distupgrade"

client = chromadb.PersistentClient(path=DB_PATH)
ef = embedding_functions.SentenceTransformerEmbeddingFunction(
    model_name="all-MiniLM-L6-v2"
)
collection = client.get_collection("wiki", embedding_function=ef)
results = collection.query(query_texts=[query], n_results=3)

for doc, meta in zip(results['documents'][0], results['metadatas'][0]):
    print(f"\n📄 {meta['path']}")
    print(doc[:500])
    print("...")
```

**VERIFY:**
```bash
python3 scripts/query_wiki.py "HAB secure boot"
python3 scripts/query_wiki.py "distupgrade RPM flow"
python3 scripts/query_wiki.py "confme service configuration"
```
Results should return the correct wiki pages. If they do — you have semantic search over your entire company wiki.

---

### MODULE 4.6 — Know When NOT to Use Scripts
_Effort: 10 min (reading)_

**[ ] LLM SKILL: Decision discipline — know which processing strategy to use before touching any data**

**LEARN:**

Scripts add complexity. Not every large-data problem needs them. Use this decision table every time:

| Situation | Approach |
|-----------|----------|
| < 400 KB, one-time question | Paste it all directly |
| Structured data (logs, reports, CSV, git) | Extraction script |
| Unstructured prose (docs, specs, wiki) | RAG (ChromaDB) |
| Code relationships / architecture | Graphify |
| Temporal facts / device state history | Graphiti |
| Document corpus, thematic analysis | GraphRAG |
| One-time vs. ongoing use | Script (one-time) vs. RAG/graph (ongoing) |

**The most common mistake:** Setting up RAG infrastructure for a one-time question that a 10-line script would have answered in 5 minutes.

**The second most common mistake:** Writing a 100-line script to parse 3 files that could have been pasted directly.

**DO:** For the next 4 weeks, before any large-data LLM task, explicitly state (to yourself or in a comment): "This is [type] data, [size], used [once/repeatedly] → approach: [X]."

**VERIFY:** You've stopped pasting raw multi-hundred-line outputs into LLM sessions without preprocessing.

---

## LEVEL 5 — Cognitive Discipline (ongoing)

> **Theme:** How you think with the model, not just what you configure.
> Reference: `LLM-BEST-PRACTICES.md` Part IV (debugging) · Part XI (Bloom's Taxonomy)

### MODULE 5.1 — The Analyze-Before-Fix Habit
_Effort: 0 min (habit)_

**[ ] LLM SKILL: Analyze-before-fix — break the reflex of asking for a fix before understanding the problem**

**LEARN:**
From `LLM-BEST-PRACTICES.md` Part XI §11.4 (Bloom's Taxonomy):

Your correction cascade pattern is a symptom of staying in the **Create → Evaluate → Create** loop. You get a fix, spot a problem, ask for another fix — without ever understanding *why* the first fix was wrong. This is fast but shallow.

The single most effective prompt change in your arsenal:
```
"Before you implement the fix — explain what caused this bug
and why your fix addresses the root cause, not just the symptom."
```

This forces the model into ANALYZE mode. It forces you to validate at EVALUATE level with your own domain knowledge. It breaks the cascade at the source.

**DO:** Add this sentence before any non-trivial fix request. It adds 10 seconds. It saves 10 minutes of cascade corrections.

**VERIFY:** After 2 weeks, look at your correction cascade frequency. The "3+ corrections in a row" events should decrease significantly.

---

### MODULE 5.2 — The 2-Strike Rule
_Effort: 0 min (habit)_

**[ ] LLM SKILL: 2-strike reset — recognize when you're correcting symptoms and reframe the whole problem**

**LEARN:**
From `LLM-BEST-PRACTICES.md` Part III §3.6 and your own session data:

When you've made 2 corrections and the model is still wrong, the problem is almost never the answer — it's the framing. A third correction compounds the misalignment. A full reset is faster.

Template (`LLM-BEST-PRACTICES.md` Template 6):
```
"Let's reset. Ignore the last [N] messages.
Current state: [clean description]
What I need: [clean goal statement]
Hard constraints: [what must not change]
What's the correct approach?"
```

**DO:** Each time you find yourself making a third correction in a row — stop. Use the template. Build the muscle memory.

**VERIFY:** You'll notice it works. The model produces a better answer from a clean framing than from a fourth correction.

---

### MODULE 5.3 — Bloom's Taxonomy: Climb the Pyramid
_Effort: 0 min (mental model)_

**[ ] LLM SKILL: Bloom's climb — don't stop at APPLY, reach ANALYZE and EVALUATE before accepting output**

**LEARN:**
Full framework in `LLM-BEST-PRACTICES.md` Part XI.

The quick version:
```
AI generates (CREATE) → you judge it (EVALUATE)
→ you interrogate the reasoning (ANALYZE)
→ you apply it and observe (APPLY)
→ you build mental model (UNDERSTAND)
→ you can explain it without AI (REMEMBER)
```

Most engineers stop at EVALUATE. The goal is to reach REMEMBER — where you own the knowledge and the AI is an accelerator, not a crutch.

**The one question that moves you up the pyramid:**
```
"Explain WHY this works and what would break if [condition X]."
```

**VERIFY:** After 1 month, pick a topic you've handled many times with AI (CAAM, HAB fuse burning, distupgrade flow). Try to explain it to someone without looking at any code or notes. If you can — you've reached REMEMBER for that topic.

---

## LEVEL 6 — System Architecture (multi-day)

> **Theme:** Infrastructure-level AI augmentation. The model works for you continuously, not just when you ask.
> Reference: `LLM-ENGINEERING-STACK.md` Part VII (workflow) · Part IV-B §4B.2, §4B.4

### MODULE 6.1 — Graphiti: Persistent Device State Memory
_Effort: 2–4 hours_

**[ ] LLM SKILL: Temporal knowledge graph — give the model a persistent, queryable memory of your system state**

**LEARN:**
From `LLM-ENGINEERING-STACK.md` Part IV-B §4B.2:

You manage multiple devices at different stages. Right now that state lives in your head. Graphiti is a temporal knowledge graph — it tracks facts with timestamps:
```
"Device 25000: Stage 6 complete" valid_at: 2026-05-24, invalid_at: null
"Device 25001: Stage 4 in progress" valid_at: 2026-05-25
```

Any agent can query it: "What stage are all devices on?" → instant answer, zero re-explanation.

**DO:**
```bash
pip install graphiti-core neo4j
# Start Neo4j (Docker):
docker run -p 7687:7687 -p 7474:7474 neo4j:latest
```

Then write a small Python script that adds a fact after each deployment stage completes. See `LLM-ENGINEERING-STACK.md` §4B.2 for the code template.

**VERIFY:** After adding 5–10 device state facts, query: "What is the current stage of each device?" — without telling the model anything in the session.

---

### MODULE 6.2 — Formalize the 2ndBrain raw→wiki Pipeline
_Effort: 2–3 hours_

**[ ] LLM SKILL: Autonomous synthesis pipeline — LLM as a scheduled knowledge worker, not just a Q&A tool**

**LEARN:**
From `LLM-ENGINEERING-STACK.md` Part IV-B §4B.4:

You already have the vault structure. The missing piece is the automated agent that reads `raw/` and writes to `wiki/`. Your session logs, datasheets, and vendor docs go into `raw/`. Claude Code or Copilot CLI reads them periodically and synthesizes linked wiki pages.

The result: your 2ndBrain becomes a high-quality context source for future sessions — not just a note dump.

**DO:**
Create a script at `/Users/vn/vaults/2ndBrain/Engine/Scripts/synthesize-wiki.sh`:
```bash
#!/bin/bash
# Run weekly: reads new files in raw/, updates wiki/ with synthesis + backlinks
copilot "Read new files in raw/ since $(date -d '7 days ago' +%Y-%m-%d). 
For each: create or update the relevant wiki/ page with a synthesis 
in the style of atomic notes (one concept per page, cross-linked). 
Add backlinks to related pages. Update INDEX.md."
```

**VERIFY:** After first run, read a generated wiki page. Does it synthesize correctly? Does it link to related concepts? If yes — your Second Brain is starting to compound.

---

---

## LEVEL 7 — Agentic Workflows (1–2 days total)

> **Theme:** Stop starting sessions. Define work precisely enough that an agent executes it while you sleep and you review results in the morning.
> Reference: `LLM-ENGINEERING-STACK.md` Part VI · `LLM-BEST-PRACTICES.md` Part VII

This is the level the entire roadmap has been building toward. L1–L6 made you a systematic, tool-equipped practitioner. L7 turns the AI from a reactive assistant into an autonomous worker you manage asynchronously.

**What changes at L7:**

```
L1–L6: You → start session → give task → review output → iterate
L7:    You → write task spec (evening) → agent executes → you review PR (morning)
```

The key shift: **you stop being the one who types**. You become the one who writes precise task specs, reviews diffs, and unblocks the agent when it hits a decision boundary.

---

### MODULE 7.1 — Task Specification for Agents
_Effort: 30 min to learn, ongoing to practice_

**[ ] LLM SKILL: Writing agent-executable task specs — precise enough that an agent completes the work without asking clarifying questions**

**LEARN:**
A chat prompt and an agent task spec look similar but are fundamentally different:

```
CHAT PROMPT (interactive):         AGENT TASK SPEC (autonomous):
─────────────────────────────────────────────────────────────────
"Fix the error handling in         "In src/utilities/fileIO.ts,
 fileIO.ts"                         function saveFile():
                                    - Add try/catch around vault.modify()
                                    - On error: throw new Error with the
                                      filename and original error message
                                    - Add a unit test in tests/fileIO.test.ts
                                      covering the error case
                                    - Build must pass: npm run build
                                    - Tests must pass: npm test
                                    DO NOT change the function signature."
```

The chat version requires 3–4 follow-up turns. The agent spec requires zero. The difference is **completeness**: every ambiguity you leave out is a decision the agent makes alone, often wrong.

**The 5 elements of an agent-executable task spec:**
1. **Scope** — exact file(s) and function(s), no vague references
2. **Behavior** — what must change, described as observable output
3. **Constraints** — what must NOT change (API, file format, branch)
4. **Verification** — how the agent proves it worked (build, test, specific output)
5. **Decision boundary** — what to do if blocked (log and stop vs. try alternative)

**DO (practice on the plugin):**
Write a task spec for porting `Block.js` → `Block.ts`. It should be precise enough to give to an agent that has never spoken to you before and get a correct result.

Template:
```markdown
## Task: Port Block.js to Block.ts

**Scope:** Port `../Engine/Scripts/components/Block.js` to `src/components/Block.ts`

**Source:** Read the JS file first. Understand the public interface before writing any TypeScript.

**Required behavior:**
- `Block` class with constructor `(page: string, content: string, mtime?: number)`
- Static factory method `Block.create(page, content, mtime?)` — note: in JS this is wrongly an instance method, fix it in the port
- `setAttribute(key: string, value: unknown): void`
- `getAttribute(key: string): unknown`
- `hasAttribute(key: string): boolean`
- `addChild(block: Block): void`
- `getChildren(): Block[]`
- `getAllAttributes(): Record<string, unknown>`
- Zero Obsidian API dependency — no imports from 'obsidian'

**Constraints:**
- Do NOT change the public method names (other components depend on them)
- Do NOT add any Obsidian imports

**Verification:**
- `npm run build` passes with no errors
- `npm test` passes
- Write tests in `tests/Block.test.ts` covering: constructor, setAttribute/getAttribute, addChild/getChildren

**If blocked:** Stop and log the blocker. Do not guess.
```

**VERIFY:** Give this exact spec to a fresh Copilot session with no other context. Does it produce correct output without you steering it? If yes — you wrote a valid agent task. If it asks questions — find the ambiguity and fix the spec.

---

### MODULE 7.2 — Copilot Coding Agent (GitHub Issues → PR)
_Effort: 1 hour setup_

**[ ] LLM SKILL: Asynchronous delegation — assign a GitHub Issue to an AI agent, review its PR in the morning**

**LEARN:**
GitHub Copilot's coding agent is available now. You create a GitHub Issue, assign it to `@copilot`, and it:
1. Creates a branch
2. Reads your `copilot-instructions.md` for project context
3. Executes the work (with MCP tools if configured)
4. Opens a PR with a summary of what it did and why
5. Runs your CI pipeline
6. Waits for your review

You wake up to a PR, not a task in progress.

**Prerequisites:**
- Repo must be on GitHub (not just local git)
- Copilot Business or Enterprise plan
- `copilot-instructions.md` must be in `.github/` (you did this in L1)

**DO:**
1. Push `obsidian-2ndbrain-plugin` to GitHub:
```bash
cd /Users/vn/vaults/2ndBrain/obsidian-2ndbrain-plugin
gh repo create obsidian-2ndbrain-plugin --private --source=. --push
```
2. Create a GitHub Issue using the task spec you wrote in Module 7.1:
   - Title: "Phase 1: Port Block.js to Block.ts with unit tests"
   - Body: paste your task spec from 7.1 exactly
3. Assign the issue to `@copilot`
4. Go do something else. Check in the morning.

**VERIFY:**
- A PR appears within 10–20 minutes
- The PR description explains what was done
- CI passes (or fails with a clear error you can unblock)
- Review the diff: does it match your task spec? Every deviation is a spec gap to fix.

---

### MODULE 7.3 — Safety Boundaries and Review Protocol
_Effort: 30 min · Critical_

**[ ] LLM SKILL: Agent governance — define exactly what the agent can do autonomously vs. what requires your approval**

**LEARN:**
An agent without defined boundaries will make decisions you didn't authorize. Not because it's malicious — because you left the ambiguity open and it filled it.

**The three-zone model:**

```
GREEN — Agent can do without asking:
  ✅ Create new files in src/, tests/
  ✅ Modify files within the task scope
  ✅ Run npm run build, npm test
  ✅ Create commits on a feature branch
  ✅ Open a draft PR

YELLOW — Agent must log and wait for you:
  ⚠️  Changing a public API or interface
  ⚠️  Modifying files outside task scope
  ⚠️  Adding a new npm dependency
  ⚠️  Changing tsconfig.json or esbuild config
  ⚠️  Any decision not covered by the task spec

RED — Agent must never do:
  ❌ Merge to main/master
  ❌ Delete files
  ❌ Push with --force
  ❌ Modify .github/copilot-instructions.md
  ❌ Change manifest.json version
```

Add this to your `copilot-instructions.md`:
```markdown
## Agent Boundaries

GREEN (autonomous): create/modify files in src/ and tests/, run build and test, commit to feature branch, open draft PR.
YELLOW (stop and log): any change outside task scope, new dependencies, API changes.
RED (never): merge to main, delete files, force push, modify copilot-instructions.md.
```

**Morning review protocol** — 5-minute checklist for every agent PR:
```
1. Read the PR description — does the agent explain WHY, not just WHAT?
2. Check files changed — any file outside task scope? (yellow zone violation)
3. Read the diff — does it match the task spec line by line?
4. Check test coverage — does the new test actually test the behavior?
5. Run locally: git checkout [branch] && npm test
```

**DO:** Add the boundary section to your plugin's `copilot-instructions.md`. Write the morning review checklist somewhere you'll see it (sticky note, Obsidian daily note template).

**VERIFY:** On the next agent PR you review, time yourself on the 5-step checklist. If it takes more than 10 minutes, either the spec was unclear or the agent exceeded boundaries — both are fixable.

---

### MODULE 7.4 — The Evening → Morning Workflow
_Effort: 15 min to set up, then it's your daily rhythm_

**[ ] LLM SKILL: Asynchronous development rhythm — compress your active coding time, expand your review and direction-setting time**

**LEARN:**
The evening → morning workflow is not just a convenience — it changes what kind of engineer you are. You shift from **implementation** to **architecture and review**. The agent implements; you decide what to implement and whether the implementation is correct.

**The full cycle:**

```
EVENING (20–30 min):
  1. Review today's agent PRs — approve, reject, or add comments
  2. Write 2–3 task specs for tonight (use the template from 7.1)
  3. Create GitHub Issues, assign to @copilot
  4. Close laptop

NIGHT (agent works):
  → Agent reads issues
  → Executes work on feature branches
  → Runs CI
  → Opens PRs or logs blockers

MORNING (20–30 min):
  1. Check email/Slack for agent PR notifications
  2. Run morning review protocol (5-step from 7.3) on each PR
  3. Merge what passed, comment on what didn't
  4. Unblock any YELLOW-zone decisions the agent logged
  5. Update the task queue for tonight
```

**What makes this work (and what breaks it):**

| Works | Breaks |
|-------|--------|
| Precise task specs (7.1) | Vague tasks ("improve error handling") |
| copilot-instructions.md with boundaries (7.3) | No boundaries → agent over-reaches |
| CI that actually validates behavior | CI that only checks syntax |
| Tasks that are truly independent | Tasks with hidden dependencies the agent can't see |
| One feature branch per task | Multiple tasks on same branch → merge conflicts |

**DO:**
Write your first evening task queue. Create a file `TONIGHT.md` in the plugin repo:
```markdown
# Tonight's Tasks — [date]

## Task 1: Port Block.js to Block.ts
[paste spec from 7.1]

## Task 2: Port BlockCollection.js to BlockCollection.ts
[write spec for BlockCollection — same pattern]
```

Assign both as GitHub Issues to `@copilot`. Check tomorrow morning.

**VERIFY:** Two PRs in the morning. Both pass CI. Review both in under 15 minutes combined. If you can — the workflow is live.

---

## Progress Tracker

```
LEVEL 1 — Context Engineering          (~45 min)
  [ ] 1.1 LLM SKILL: Permanent context injection (plugin repo ✅ done)
  [ ] 1.2 LLM SKILL: Context switching (sensio-linux)
  [ ] 1.3 LLM SKILL: Front-loading context (1 week habit)

LEVEL 2 — Tool Layer                   (~3 hours)
  [ ] 2.1 LLM SKILL: Stop pasting (MCP: filesystem + git + github)
  [ ] 2.2 LLM SKILL: Persistent memory (MCP: memory server)
  [ ] 2.3 LLM SKILL: Graph-based context (Graphify on roomboard)

LEVEL 3 — Skill Library                (~2 hours)
  [ ] 3.1 LLM SKILL: Reusable templates (analyze-test-report skill)
  [ ] 3.2 LLM SKILL: Parameterized skills (deployment-stage skill)
  [ ] 3.3 LLM SKILL: Session closing discipline (2 weeks)

LEVEL 4 — Large Data Processing        (~3 hours)
  [ ] 4.1 LLM SKILL: Data scale awareness (decision table)
  [ ] 4.2 LLM SKILL: Extraction scripting (test report script)
  [ ] 4.3 LLM SKILL: Chunked processing (date-based chunks)
  [ ] 4.4 LLM SKILL: Multi-source correlation (join script)
  [ ] 4.5 LLM SKILL: RAG (ChromaDB over Confluence wiki)
  [ ] 4.6 LLM SKILL: Decision discipline (when NOT to script)

LEVEL 5 — Cognitive Discipline         (ongoing)
  [ ] 5.1 LLM SKILL: Analyze-before-fix (2 weeks)
  [ ] 5.2 LLM SKILL: 2-strike reset (2 weeks)
  [ ] 5.3 LLM SKILL: Bloom's climb (1 month)

LEVEL 6 — System Architecture          (multi-day)
  [ ] 6.1 LLM SKILL: Temporal knowledge graph (Graphiti)
  [ ] 6.2 LLM SKILL: Autonomous synthesis pipeline (2ndBrain wiki)

LEVEL 7 — Agentic Workflows            (1–2 days)
  [ ] 7.1 LLM SKILL: Task specification for agents
  [ ] 7.2 LLM SKILL: Copilot Coding Agent (GitHub Issues → PR)
  [ ] 7.3 LLM SKILL: Agent safety boundaries + review protocol
  [ ] 7.4 LLM SKILL: Evening → morning development rhythm
```

**Estimated impact per level:**

| Level | Effort | Correction rate | What disappears |
|-------|--------|----------------|-----------------|
| L1 complete | ~45 min | 43% → ~28% | Wrong repo/path assumptions |
| L2 complete | ~3 hrs | 28% → ~22% | Manual file pasting |
| L3 complete | ~2 hrs | 22% → ~18% | Recurring prompt re-typing |
| L4 complete | ~3 hrs | 18% → ~15% | Raw data dumps, unstructured queries |
| L5 complete | ongoing | 15% → ~10% | Correction cascades, symptom-fixing |
| L6 complete | multi-day | 10% → ~8% | Re-explaining device state, lost context |
| L7 complete | 1–2 days | —  | You stop typing. You review diffs. |

> **Note:** The ~8% correction rate floor applies to interactive sessions. At L7, correction rate becomes irrelevant — the metric shifts to **PR acceptance rate** (how often the agent's output is merged with no changes). Aim for >70% on well-specified tasks.

---

## What Changes When You Complete Each Level

**After L1:** Copilot "already knows" your project at session start. Fewer "which repo?" corrections. Sessions feel warmer from turn 1.

**After L2:** You stop pasting file contents. You say "read X" instead. Session flow becomes like talking to a colleague who has file access, not explaining things to someone who can't see your screen.

**After L3:** Recurring tasks (test report analysis, stage work) become 1-line invocations. Your April batch efficiency becomes the default, not the exception.

**After L4:** You stop giving LLMs raw data dumps. You preprocess first. Your queries get sharper because you understand what the model can and can't hold in context.

**After L5:** Correction cascades become rare. When AI is wrong, you reset cleanly instead of correcting symptoms. You're also retaining more — less dependent on re-asking the same conceptual questions.

**After L6:** The AI is no longer session-scoped. It knows your device states, project history, accumulated knowledge. Sessions feel continuous rather than starting from zero.

**After L7:** You assign work in the evening and review results in the morning. Your active coding time compresses to architecture decisions, task spec writing, and PR review. The agent implements. You steer.

---

_Created: 2026-05-25_
_Based on: 323 VS Code Copilot sessions, 469 ChatGPT conversations, 116 MS Copilot days (Feb–May 2026)_
_Reference docs: `LLM-BEST-PRACTICES.md` · `LLM-ENGINEERING-STACK.md` · `COPILOT-INTERACTION-ANALYSIS.md` · `NOTE-large-file-llm-workflow.md`_
