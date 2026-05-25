# Modern LLM-Augmented Engineering Stack
## Complete Reference for the AI-Native Engineer
_Compiled: May 2026 — Sources: Anthropic, OpenAI, GitHub, JetBrains Research, Google Developers Blog, modelcontextprotocol.io_

> **Scope:** This document covers the full stack of tools, protocols, patterns, and concepts that make up a modern, reliable, non-interruptible AI-augmented engineering workflow in 2025–2026. It is written for senior engineers who use AI daily as infrastructure — not as a toy.

---

## PART I — THE ARCHITECTURE MAP

Understanding the stack requires understanding how the layers relate to each other. From bottom to top:

```
┌─────────────────────────────────────────────────────────────┐
│  YOUR WORKFLOW LAYER                                         │
│  (sessions, tasks, projects, flow state)                     │
├─────────────────────────────────────────────────────────────┤
│  AGENT LAYER                                                 │
│  (autonomous agents, agentic loops, multi-agent systems)     │
├─────────────────────────────────────────────────────────────┤
│  TOOL / SKILL / PLUGIN LAYER                                 │
│  (MCP servers, function calling, extensions)                 │
├─────────────────────────────────────────────────────────────┤
│  CONTEXT LAYER                                               │
│  (project memory, RAG, vector DBs, instructions files)       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │  GRAPH KNOWLEDGE SUBLAYER  ← you are here              │  │
│  │  (knowledge graphs, temporal graphs, second brain)     │  │
│  └────────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  MODEL LAYER                                                 │
│  (Claude, GPT, Gemini, open-source models)                   │
├─────────────────────────────────────────────────────────────┤
│  INTERFACE LAYER                                             │
│  (IDE, CLI, API, chat, voice)                                │
└─────────────────────────────────────────────────────────────┘
```

Each layer has its own set of tools, patterns, and failure modes. Most engineers only consciously interact with the top and bottom layers — the middle is where the real leverage is.

---

## PART II — THE MODEL LAYER

### 2.1 Choosing the Right Model

Not all models are equal for all tasks. Match model to workload:

#### Anthropic — Claude Family (as of May 2026)

| Model | Context | Speed | Cost | Best for |
|---|---|---|---|---|
| **Claude Sonnet 4.6** ⭐ | 200K | Fast | $$ | Daily driver — code, debugging, chat, agent tasks. Best quality/cost ratio. |
| **Claude Haiku 4.5** | 200K | Very Fast | $ | Simple lookups, completions, quick Q&A. Cheapest option. |
| **Claude Opus 4.5** | 200K | Slow | $$$ | Deep architecture review, multi-file reasoning, long specs |
| **Claude Opus 4.6** | 200K | Slow | $$$$ | Most capable — use only for hardest problems (expensive; justify each use) |

> **Your primary model:** Sonnet 4.6 covers ~85% of daily work. Reach for Opus 4.6 when Sonnet fails after one retry.

#### OpenAI — GPT Family (as of May 2026)

| Model | Context | Speed | Cost | Best for |
|---|---|---|---|---|
| **GPT-5.5** | 128K | Medium | $$$$ | Broad reasoning, multimodal, complex cross-domain tasks |
| **GPT-5.3-Codex** | 128K | Fast | $$$ | Code-specialized: completions, refactors, test generation |

#### Other Relevant Models

| Model | Strengths | Best for |
|---|---|---|
| **Gemini 2.0 Pro** (Google) | 1M+ token context | Reading full codebases / large specs in one shot |
| **Llama 3 / Mistral / Qwen** (open-source) | Self-hosted, no data leakage | IP-sensitive / air-gapped environments |
| **DeepSeek Coder** | Code-specialized, lightweight | Local completions, edge deployment |

**Key decision criteria:**
- **Cost discipline:** Opus 4.6 / GPT-5.5 only when Sonnet 4.6 fails — they cost 5–10× more per token (approximate; check current pricing).
- **Speed tier:** Use Haiku 4.5 for trivial tasks (autocomplete, simple lookups) — 3–5× faster than Sonnet.
- **Context window:** Gemini 2.0 if you need to ingest a full codebase or long spec in one prompt.
- **Prompt caching:** Both Anthropic and OpenAI support caching system prompts / long static context. Enable it — reduces cost by up to 90% on repeated prompts with the same prefix.
- **Privacy/compliance:** Open-source self-hosted if code cannot leave your perimeter.
- **Code accuracy:** Claude Sonnet 4.6 and GPT-5.3-Codex are current benchmarks for code tasks.

### 2.2 Model Routing — Decision Tree

```
Task received
├── Simple lookup / completion / short fix
│   └── → Claude Haiku 4.5 (or Copilot inline)
├── Code generation, debugging, agent task
│   └── → Claude Sonnet 4.6 (default)
├── Sonnet fails or gives wrong answer after 1 retry
│   └── → Claude Opus 4.6 (or GPT-5.5 for second opinion)
├── Code refactor / test generation at scale
│   └── → GPT-5.3-Codex
├── Full codebase ingestion / 200K+ tokens needed
│   └── → Gemini 2.0 Pro
└── IP-sensitive / cannot use cloud
    └── → Self-hosted Llama 3 / Qwen / DeepSeek Coder

```

### 2.3 Model Selection Anti-Patterns

- ❌ Using Opus 4.6 / GPT-5.5 for every task (expensive, slow, unnecessary)
- ❌ Using the fastest/cheapest model for complex multi-file reasoning (wrong answers)
- ❌ Switching models mid-project without re-establishing context
- ❌ Treating all models as equivalent — each has different failure modes
- ✅ Default to Sonnet 4.6; escalate to Opus only on confirmed failure
- ✅ Route code-volume tasks (batch refactor, test gen) to Codex-class models

---

## PART III — THE INTERFACE LAYER

### 3.1 IDE-Integrated Assistants (Primary Workflow)

| Tool | Interface | Autonomy | Best Fit |
|------|-----------|----------|----------|
| **GitHub Copilot** (in VS Code) | Chat + inline completion + Agent Mode | Medium | Daily pair programming, multi-file edits, test generation |
| **Cursor** | Full AI IDE fork | High | Codebase-wide refactoring, goal-directed autonomous edits |
| **Windsurf** (Codeium) | Full AI IDE fork | Very High | End-to-end task automation, spec-to-PR pipelines |
| **Continue.dev** | VS Code/JetBrains plugin | Medium | Open-source, self-hosted model support, privacy-first |
| **Aider** | CLI | High | Terminal-native engineers, git-integrated coding agent |
| **Claude Code** | CLI | High | Complex multi-file reasoning directly from terminal |

**For embedded/systems engineers:** Copilot + Agent Mode covers 90% of daily needs. Aider or Claude Code for heavy scripting or multi-file automation.

### 3.2 Chat Interfaces

Used for thinking, planning, and research — not code production:

- **Claude.ai** — best for long-form reasoning, document analysis, architecture decisions
- **ChatGPT** — general-purpose, good with visual content (diagrams, images)
- **Gemini Advanced** — best when you need to dump a full codebase into context

**Rule:** Chat interfaces = thinking partner. IDE = execution partner. Don't confuse the two.

### 3.3 CLI / API

For automation, scripting AI into your own tools:

- **Anthropic Claude API** — most complete tool-calling, MCP support, structured output
- **OpenAI API** — widest ecosystem, function calling, Assistants API
- **Ollama** — run open-source models locally (`ollama run llama3`)
- **LM Studio** — GUI for local models with OpenAI-compatible API

---

## PART IV — THE CONTEXT LAYER

> This is where most engineers leave the most performance on the table.

### 4.1 What Context Engineering Is

The shift from "prompt engineering" (craft the right question) to **context engineering** (give the model the right information at the right time) is the defining skill of 2025.

**Context engineering** = the discipline of deciding:
- What information goes into the context window
- When it is injected
- In what form (raw text, structured, summarized)
- What is excluded (noise reduction)

Context window mismanagement causes:
- Hallucinations (model fills gaps with guesses)
- "Lost in the middle" failure (relevant info buried, ignored)
- Ballooning token costs and latency
- Degraded accuracy as context grows

### 4.2 Context Sources (Stack)

```
┌─────────────────────────────────────────────────────────┐
│  STATIC CONTEXT (always present)                        │
│  · System prompt / instructions files                   │
│  · Project memory file (CLAUDE.md, copilot-instructions)│
│  · Architecture docs                                    │
├─────────────────────────────────────────────────────────┤
│  DYNAMIC CONTEXT (retrieved on demand)                  │
│  · RAG from vector database                             │
│  · File contents (read at query time)                   │
│  · Tool outputs (code execution, search, shell)         │
├─────────────────────────────────────────────────────────┤
│  CONVERSATION CONTEXT (accumulated in-session)          │
│  · Turn history                                         │
│  · Session summaries                                    │
│  · Prior tool call results                              │
└─────────────────────────────────────────────────────────┘
```

### 4.3 Project Memory Files — The Most Underused Tool

Every AI tool supports some form of persistent instructions file. These are injected into every session automatically — they are your "standing orders" to the model.

| Tool | File | Location |
|------|------|----------|
| GitHub Copilot | `.github/copilot-instructions.md` | Repo root |
| Claude Code | `CLAUDE.md` | Repo root (or parent dirs) |
| Cursor | `.cursor/rules/*.md` | Repo root (directory of rule files) |
| Aider | `.aider.conf.yml` + system prompts | Config dir |
| Continue.dev | `config.json` with system message | `~/.continue/` |

**What to put in these files:**
```markdown
# Project: [name]

## Tech Stack
- Hardware: imx8mp, Yocto kirkstone, systemd 252
- Key repos: [paths and purposes]
- Critical paths: [filesystem layout, boot sequence]

## Conventions
- Error handling: always log with [context]
- Script style: POSIX sh unless Python is required
- Commit format: [conventional commits pattern]

## Constraints (NEVER violate)
- Do not modify files in meta-roommate without explicit confirmation
- All device-side changes must work without host machine involvement
- Stage6 scripts live in recovery_builder only, not remote_upgrade_learning

## Current Project State
- [brief state, updated regularly]
```

**Rule:** Update these files as your project evolves. They are your persistent memory layer. Stale instructions are worse than none.

### 4.4 RAG — Retrieval-Augmented Generation

For projects where relevant information exceeds what fits in context:

**How it works:**
```
Your question → Embedding → Search vector DB → Retrieve relevant chunks
→ Inject into context → Model answers with grounded info
```

**When you need it:**
- Codebase too large to fit in context window
- Documentation needs to be searchable
- Historical decisions need to be retrievable
- Multiple projects share a knowledge base

**Practical stack for engineers:**
| Component | Lightweight option | Production option |
|-----------|-------------------|-------------------|
| Embedding | `text-embedding-3-small` (OpenAI) | Cohere Embed v3 |
| Vector DB | ChromaDB (local) | Qdrant (self-hosted) |
| Orchestration | LangChain | LlamaIndex |
| Interface | Continue.dev with custom RAG | Custom API |

**Simpler alternative for most engineers:** Keep a well-structured `CLAUDE.md` / `copilot-instructions.md` and rely on the model's in-context reading of files. RAG is only needed when your project exceeds the model's context window.

---

## PART IV-B — THE GRAPH KNOWLEDGE SUBLAYER

> Vector search finds similar text. Graphs find **relationships**. These are fundamentally different retrieval primitives — and for systems engineers, the graph approach is often more natural and more powerful.

### Why Graphs > Vectors for Engineering Context

The core problem with flat vector RAG:
- Retrieves **fragments** ranked by similarity — no understanding of *how concepts connect*
- Cannot answer: "What depends on this module?", "What changed the behavior of X over time?", "What are the architectural clusters in this codebase?"
- "Lost in the middle" — relevant information buried in a list of chunks gets ignored

Graphs store **relationships explicitly as first-class data**:
```
[HAB fuse burn] ──triggers──▶ [CAAM key rotation] ──invalidates──▶ [existing CAAM blobs]
                                        │
                              ──requires──▶ [Stage 6 completion]
```

This structure lets the model reason about causality, dependencies, and sequences — exactly what embedded systems and platform engineering require.

---

### The Four Graph Approaches — Compared

| Approach | What it graphs | Temporal? | Update model | Best for |
|----------|---------------|-----------|--------------|----------|
| **Graphify** | Your codebase / project files | No | On-demand rebuild | Codebase navigation, architecture understanding, PR impact |
| **Graphiti / Zep** | Agent conversation memory + facts | **Yes** | Real-time incremental | Cross-session agent memory, evolving device/project state |
| **Microsoft GraphRAG** | Document corpus → thematic clusters | No | Batch rebuild | Multi-hop reasoning over large document sets |
| **Karpathy Second Brain** | Personal knowledge vault | No | LLM-maintained | Personal knowledge compounding, research notes |

---

### 4B.1 — Graphify: Project Knowledge Graph (YC S26)

**What it is:** A skill/tool that maps your entire project — code, docs, PDFs, images, videos — into an interactive knowledge graph, queryable by any AI assistant.

**How it works:**
```
/graphify .
     │
     ├── AST extraction (local, no API) — 31 languages including .sh, .py, .bb, .yaml
     ├── Doc/PDF/image extraction (via model API)
     └── Graph construction → community detection (Leiden algorithm)
           │
           ▼
     graphify-out/
     ├── graph.html        ← interactive browser UI: click nodes, filter, search
     ├── GRAPH_REPORT.md   ← key concepts, surprising connections, suggested questions
     └── graph.json        ← queryable anytime without re-reading files
```

**Key insight from the report:** "God nodes" — the most-connected concepts everything flows through. For your projects, these would likely be things like `CAAM`, `recovery_builder`, `confme.service` — concepts referenced across many files.

**Querying without re-reading files:**
```bash
graphify query "what connects stage6 to the initramfs boot sequence?"
graphify path "recovery_builder" "CAAM blob"
graphify explain "RateLimiter"
```

**Installing in your environment:**
```bash
pip install graphifyy                   # verify package exists first: https://pypi.org/project/graphifyy/
graphify install                        # installs skill in Claude Code
graphify install --platform copilot     # installs skill in GitHub Copilot CLI
graphify vscode install                 # installs in VS Code Copilot Chat
```
> ⚠️ **Not verified in this environment.** Commands above are from the project README (May 2026). Verify current install instructions at github.com/safishamsi/graphify before running — this is a pre-1.0 tool and CLI may change.

Then in your IDE: just type `/graphify .`

**MCP server mode** — expose the graph as a tool for any MCP-compatible client:
```bash
python -m graphify.serve graphify-out/graph.json
# Gives tools: query_graph, get_node, get_neighbors, shortest_path, list_prs, get_pr_impact
```

**PR impact analysis:**
```bash
graphify prs                  # dashboard: CI state, review status, graph impact
graphify prs 42               # deep dive on PR #42 — what graph communities does it touch?
graphify prs --conflicts       # PRs sharing graph communities — merge-order risk
graphify prs --triage          # AI ranks your review queue
```

**Team workflow:**
- One person runs `/graphify .` and commits `graphify-out/`
- Everyone pulls — their assistant reads the graph immediately
- `graphify hook install` — auto-rebuild after every `git commit` (AST only, zero API cost)
- Automatic merge driver: two devs committing in parallel → graphs are union-merged, never conflict

**Supported file types for your stack:**
- `.sh .bash .py .yaml .yml .md .json` — all standard
- `.bb` (BitBake recipes) — via code extraction
- `.pdf` — requires `pip install "graphifyy[pdf]"`
- Images, video — optional extras

**What the GRAPH_REPORT.md gives you (auto-generated):**
- **God nodes** — the architectural hubs everything depends on
- **Surprising connections** — links between things in different files/modules (ranked by unexpectedness)
- **The "why"** — `# NOTE:`, `# WHY:`, `# HACK:` comments extracted as linked nodes
- **Suggested questions** — 4–5 questions the graph is uniquely positioned to answer
- **Confidence tags** — every relationship tagged `EXTRACTED`, `INFERRED`, or `AMBIGUOUS`

**For your roomboard-linux.github project specifically:**
```bash
cd /Users/vn/ws/platform-development/roomboard-linux.github
graphify install --project
/graphify .
```
The graph would reveal the dependency chains across `meta-roommate`, `RoomMate`, recovery scripts, systemd units, and test specs — without you having to mentally reconstruct it each session.

---

### 4B.2 — Graphiti / Zep: Temporal Agent Memory

**What it is:** An open-source framework (Apache 2.0) for building real-time, temporally-aware knowledge graphs as a **persistent memory layer for AI agents**. Created by the Zep team.

**The key innovation — time:**
```
Vector RAG:   "The CAAM blob configuration uses key K1"  (static fact)

Graphiti:     "The CAAM blob configuration used key K1"
              valid_at: 2026-02-24, invalid_at: 2026-03-02
              THEN: "uses key K2"
              valid_at: 2026-03-02, invalid_at: null  (current)
```

Every fact has a timestamp. The graph knows what was true **when** — not just what is true now. This matters enormously when debugging systems that evolve over time.

**Core properties:**
- **Real-time incremental updates** — new information updates the graph instantly, no batch rebuild
- **Auto-invalidation** — conflicting facts don't delete old ones; they become `invalid_at` with full provenance
- **Hybrid search** — semantic + keyword (BM25) + graph traversal, all three simultaneously
- **Cross-session memory** — agents remember facts from previous sessions natively

**Benchmarks (self-reported by the Zep team):**
- Deep Memory Retrieval (DMR): **94.8%** accuracy (vs MemGPT at 93.4%)
- LongMemEval: **18.5% better accuracy**, **90% lower latency** on temporal reasoning tasks
- _Note: These are from the project's own paper (arxiv.org/abs/2501.13956), not independently replicated._

**Architecture:**
```bash
pip install graphiti-core neo4j
```
```python
from graphiti_core import Graphiti

client = Graphiti("bolt://localhost:7687", "neo4j", "password")

# Add an episode (conversation turn or event)
await client.add_episode(
    name="Stage 6 completed on device 25000",
    episode_body="Device serial 25000: Stage 6 formatting and deployment completed. "
                 "CAAM blobs regenerated with new master key K2.",
    source=EpisodeType.text,
    reference_time=datetime.now()
)

# Query with temporal awareness
results = await client.search("What is the current CAAM key state on device 25000?")
```

**The gap it fills for your workflow:** Your 36% correction rate is partly because Copilot has no memory of what happened in previous sessions. With Graphiti, you'd have a persistent, queryable record of:
- Which devices are at which stage
- What decisions were made and when
- What was tried and failed (and when it was valid)
- Current state of each deployment

---

### 4B.3 — Microsoft GraphRAG: Corpus-Level Knowledge Graphs

**What it is:** An open-source framework from Microsoft Research that builds a hierarchical knowledge graph from a document corpus, then uses community summaries for both local and global queries.

**How it differs from vector RAG:**
```
Vector RAG:   embed chunks → similarity search → retrieve top-k fragments
              Good for: "Find me the section about HAB fuse burning"

GraphRAG:     extract entities + relationships → community detection →
              hierarchical summaries → multi-hop reasoning
              Good for: "What are all the failure modes across our entire 
                         deployment process and how do they relate?"
```

**Benchmarks vs vector RAG:**
- **Global queries** (thematic, "what are the main patterns across all..."):
  GraphRAG is **50–70% more comprehensive**
- **Structured/schema-heavy queries:**
  Vector RAG accuracy drops to 0%; GraphRAG maintains stable accuracy
- **Enterprise analytics tasks:**
  Without graph: <20% accuracy. With GraphRAG: >56%, up to 90%+
- **Cost:** Indexing is orders of magnitude more expensive than vector RAG (10–1000× depending on corpus size and model) — justified only for large, stable corpora

**When to use:**
- Large document corpus (specs, design docs, RFCs, test reports) that needs cross-document reasoning
- Questions that require synthesizing across many documents: "What do all our test reports say about the recovery console failure modes?"
- Compliance / audit: provenance-aware answers

**When NOT to use:**
- Small, frequently changing codebase (use Graphify instead)
- Simple "find this fact" lookups (use vector RAG instead)
- Real-time data (use Graphiti instead)

**For your use case:** Run GraphRAG on your full `doc/specs/` tree + all test reports. Then ask: "What are the recurring failure patterns across all our test reports?" — a query that vector RAG cannot answer well.

```bash
pip install graphrag
graphrag init --root ./my-graphrag-project
graphrag index --root ./my-graphrag-project
graphrag query --root ./my-graphrag-project \
  --method global \
  --query "What are the recurring failure patterns across all test reports?"
```

---

### 4B.4 — Karpathy-Inspired Second Brain: LLM-Maintained Knowledge Vault

**What it is:** A workflow pattern (popularized by Andrej Karpathy, community-implemented at github.com/NicholasSpisak/second-brain) where an LLM agent continuously reads, synthesizes, and maintains an interconnected knowledge vault — designed so the vault itself becomes a high-quality context source for future AI sessions.

**The architecture:**
```
/raw/          ← drop anything here: PDFs, links, notes, transcripts, code snippets
    │
    │  LLM agent reads raw/ periodically
    ▼
/wiki/         ← agent writes structured, interlinked Markdown pages
    ├── concept-CAAM-encryption.md      ← atomic note on one concept
    ├── concept-HAB-fuse-burning.md
    ├── decision-stage6-recovery-only.md
    └── INDEX.md                        ← auto-maintained index + backlinks
```

**Key principles:**
1. **Atomic notes** — one concept per note, self-contained, context-rich
2. **Bidirectional linking** — every note links to related notes; backlinks maintained by LLM
3. **LLM-maintained** — the agent reads raw material and synthesizes wiki pages; you don't write wiki pages manually
4. **Obsidian as the interface** — Markdown vault → Obsidian graph view for visual navigation
5. **"Your notes are a developer API for your future AI copilots"** — written to be machine-readable, not just human-readable

**Why this beats vector RAG for personal knowledge:**
- RAG retrieves fragments. This builds **synthesized understanding** that compounds over time.
- Each wiki page is written at the right level of abstraction, not chopped by token count
- Cross-links make the relationship structure explicit — graphs, not bags of text
- Obsidian graph view shows you knowledge clusters and gaps visually

**Practical implementation for your 2ndBrain vault:**
```
/Users/vn/2ndBrain/
├── raw/
│   ├── session-logs/           ← copilot session exports
│   ├── datasheets/             ← IMX8MP, CAAM docs
│   └── vendor-docs/
└── wiki/
    ├── CAAM-architecture.md
    ├── HAB-secure-boot.md
    ├── Yocto-layer-structure.md
    ├── RoomMate-deployment-stages.md
    └── INDEX.md
```

You already have most of this infrastructure. The missing piece: an automated agent job that reads new raw material and updates wiki pages with synthesis + links.

**Tools to implement it:**
- **Claude Code** — run nightly: `"Read new files in raw/, update relevant wiki pages, add backlinks"`
- **Obsidian + Git** — vault as git repo, changes tracked
- **Obsidian Dataview** — query your vault like a database
- **Obsidian Graph View** — visualize knowledge clusters

---

### 4B.5 — Choosing the Right Graph Approach

```
QUESTION: What do I need?
                │
   ┌────────────┴────────────────────┐
   │                                 │
"Understand my codebase          "Remember facts across
 / find relationships in           sessions / track
 my project files"                 evolving system state"
   │                                 │
   ▼                                 ▼
GRAPHIFY                         GRAPHITI / ZEP
(project graph, /graphify .)     (temporal agent memory)
                │
                │
"Reason across many              "Compound my personal
 documents / specs / reports"     knowledge over time"
                │                         │
                ▼                         ▼
         GRAPHRAG (Microsoft)      KARPATHY SECOND BRAIN
         (corpus-level,            (personal wiki,
          global queries)           Obsidian vault)
```

**For your specific profile — recommended stack:**

| Tool | Use case | Priority |
|------|----------|----------|
| **Graphify** | Map `roomboard-linux.github` codebase | **Start here** — 10 min setup |
| **Graphiti** | Track device states, deployment progress across sessions | Medium-term |
| **Karpathy Second Brain** | You already have 2ndBrain — formalize the raw→wiki pipeline | Medium-term |
| **GraphRAG** | Batch analysis of all test reports | When test corpus is large enough |

---

## PART V — THE TOOL / SKILL / PLUGIN LAYER

### 5.1 What These Are (Definitions)

These terms are often confused. The correct definitions in 2025–2026:

| Term | Definition |
|------|-----------|
| **Tool** | A function the model can call to interact with the outside world (read file, run command, search web, query DB) |
| **Skill** | A packaged, reusable prompt + tool combination designed for a specific task type (analyze a test report, review a PR, generate a commit message) |
| **Plugin** | A module that extends an AI application's capabilities (VS Code extension, Copilot extension, ChatGPT plugin) |
| **MCP Server** | A standardized server that exposes tools and resources to any MCP-compatible client (the new open standard for all of the above) |

### 5.2 Model Context Protocol (MCP) — The Open Standard

**MCP (Model Context Protocol)** is an open standard created by Anthropic in 2024, now adopted across the industry. It defines how LLM applications connect to external tools, data, and templates.

**Think of it as:** USB-C for AI tools. One standard connector, many devices.

```
┌──────────────┐     MCP Protocol      ┌──────────────────┐
│  LLM Client  │ ←──────────────────→ │   MCP Server     │
│  (Copilot,   │                       │   (filesystem,   │
│   Claude,    │  · Resources (data)   │    git, docker,  │
│   Cursor...) │  · Tools (actions)    │    search, DB...) │
│              │  · Prompts (templates)│                  │
└──────────────┘                       └──────────────────┘
```

**MCP core concepts:**
- **Resources:** Read-only data the model can access (files, DB records, API responses)
- **Tools:** Actions the model can trigger (write file, run shell command, create PR)
- **Prompts:** Reusable, parameterized prompt templates (slash commands, workflow starters)
- **Sampling:** Server can request the model to perform inference (enables agent chains)

**Protocol:** JSON-RPC 2.0 over stdio or HTTP/SSE. Language-agnostic.

**Current spec:** `2025-11-25` at modelcontextprotocol.io _(verify for newer versions — MCP evolves rapidly)_

### 5.3 Practical MCP Servers (Install and Use Today)

**Official / widely used:**

| Server | What it gives the model | Use case |
|--------|------------------------|----------|
| `filesystem` | Read/write local files | Let Copilot access project files |
| `git` | Full git operations | Commit, branch, diff, log |
| `github` | GitHub API | PRs, issues, code search, CI status |
| `gitlab` | GitLab API | Same for GitLab |
| `docker` | Container management | Build, run, inspect containers |
| `postgres` | Query databases | DB schema exploration, queries |
| `sqlite` | Local SQLite | Lightweight DB access |
| `brave-search` | Web search | Research, doc lookup |
| `fetch` | HTTP requests | Call any API |
| `sequential-thinking` | Structured reasoning | Complex multi-step planning |
| `memory` | Persistent key-value store | Remember facts across sessions |
| `puppeteer` | Browser automation | Web scraping, UI testing |
| `slack` | Send/read Slack messages | Notifications, status updates |
| `jira` | Jira ticket management | Create/update tickets from code |

**For your profile (embedded Linux / platform engineering):**
```
Priority MCP servers to configure:
1. filesystem     — read/write Yocto layers, scripts, recipes
2. git            — commit, tag, branch operations
3. github         — PR creation, CI status, code search
4. fetch          — call internal APIs, JIRA, Confluence
5. sequential-thinking — complex deployment planning
6. memory         — persist device states, stage progress across sessions
```

### 5.4 Setting Up MCP in VS Code

MCP is fully supported in VS Code (since 2025). Configure in `.vscode/mcp.json`:

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/vn/ws"]
    },
    "git": {
      "command": "uvx",
      "args": ["mcp-server-git", "--repository", "/Users/vn/ws/platform-development/roomboard-linux.github"]
    },
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "${env:GITHUB_TOKEN}" }
    },
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    },
    "sequential-thinking": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
    }
  }
}
```

### 5.5 Function Calling vs. MCP

If you're building custom tools:

| Approach | When to use |
|---------|-------------|
| **OpenAI Function Calling** | Building on OpenAI API, standard tool definition |
| **Anthropic Tool Use** | Building on Claude API, more structured |
| **MCP Server** | Building a reusable tool that works with ANY client |

**Rule:** If the tool is project-specific, use function calling. If the tool should work across projects and clients, build it as an MCP server.

---

## PART VI — THE AGENT LAYER

### 6.1 What an Agent Is

An **agent** is an LLM-powered system that:
1. Receives a goal (not just a question)
2. Plans steps to achieve it
3. Executes tools to gather information and take action
4. Observes results and adapts the plan
5. Loops until the goal is achieved (or it gives up)

The key difference from a chatbot: **agency = planning + execution + observation + iteration**.

### 6.2 The Agentic Loop

```
       ┌──────────────────────────────────────┐
       │                                      ↓
Goal → [Plan] → [Execute Tool] → [Observe] → [Decide: done or loop?]
                     ↑                              │
               (filesystem,                    done → Output
                git, shell,
                search...)
```

**Key properties of a good agentic loop:**
- **Bounded scope:** Agent knows what it can and cannot do
- **Reversibility:** Prefers reversible actions, asks before irreversible ones
- **Transparency:** Shows its reasoning and planned steps
- **Interruption points:** Pauses at defined checkpoints for human validation
- **Context discipline:** Summarizes and prunes context to avoid window bloat

### 6.3 Agent Autonomy Spectrum

```
Low autonomy                                           High autonomy
     │                                                      │
 Autocomplete → Chat → Tool-enabled → Semi-auto → Autonomous
     │              │       │             │              │
  Copilot      Copilot   Copilot       Cursor         Devin/
  inline       Chat    Agent Mode     Windsurf       SWE-agent
```

**Current industry consensus (2025):** Stay in the **semi-autonomous** zone for professional engineering work. Full autonomy agents (Devin-style) have high error rates on complex real-world tasks. Optimal: high autonomy for execution, human approval at key decision points.

### 6.4 GitHub Copilot Agent Mode

Agent Mode in GitHub Copilot (VS Code, 2025) is the semi-autonomous tier:

- Accepts a **goal** (not just a command)
- Reads relevant files autonomously
- Plans multi-step edits across multiple files
- Runs terminal commands (with approval)
- Iterates based on test results
- Uses MCP servers for extended capabilities

**Best used for:**
- "Implement [feature] in [module], add tests, update docs"
- "Review all test reports in REPORTS/ and classify each as CODE-FIX or SPEC-ISSUE"
- "Refactor [service] from polling to event-driven, maintain existing API"

**Not suited for:**
- Tasks requiring hardware interaction (flash, reboot, JTAG)
- Tasks requiring domain context not available in the workspace

### 6.5 Multi-Agent Systems

For large, parallel workloads — multiple specialized agents working together:

```
Orchestrator Agent
   ├── Analysis Agent (reads spec, produces findings)
   ├── Implementation Agent (writes code)
   ├── Test Agent (writes and runs tests)
   └── Review Agent (validates output, reports)
```

**Practical tools:**
- **CrewAI** — define agent roles, goals, tasks; agents collaborate
- **AutoGen** (Microsoft) — multi-agent conversation framework
- **LangGraph** — stateful agent workflows with cycles and branching
- **GitHub Copilot + multiple workspaces** — manual but practical: run parallel sessions

**Your existing pattern:** You already do this — the Apr 24 batch of 30 sessions running the same analysis template in parallel is a manual multi-agent system. Formalizing it with CrewAI or LangGraph would eliminate the manual session-per-report overhead.

---

## PART VII — WORKFLOW LAYER (NON-INTERRUPTION DESIGN)

### 7.1 The Flow State Problem

Every context switch breaks flow state. The average time to return to the original task after an interruption is **~23 minutes** (Gloria Mark, UC Irvine). LLM-augmented work introduces new interruption vectors:

| Interruption type | Cause | Cost |
|------------------|-------|------|
| Wrong answer requiring reframe | Insufficient context | 5–15 min |
| Correction cascade | Symptom fixing instead of goal reset | 10–30 min |
| Context loss between sessions | No session memory | Entire re-orientation |
| Long LLM response (verbose) | No output format constraint | 2–5 min reading |
| Hallucinated API / path | Model fills gap with fiction | 15–60 min debugging |

### 7.2 Non-Interruption Workflow Design

**Principle 1: Front-load context, back-load execution**
Spend 2–3 minutes preparing context before invoking the model. This prevents 15–30 minutes of correction loops.

**Principle 2: Define the stopping condition**
Before starting a session, know what "done" looks like. This prevents drift and scope creep.

**Principle 3: Use checkpoints, not constant supervision**
Define specific points where you review the agent's work — not constant monitoring. Let it run.

**Principle 4: Separate thinking from doing**
- Thinking sessions (planning, design): use chat interface, long-form
- Doing sessions (implementation): use IDE agent, short bounded tasks
- Review sessions (validation): use dedicated review prompts

**Principle 5: Protect the context window**
At session start: inject only what's relevant. Mid-session: summarize and prune when the window grows large. Never let accumulated noise crowd out signal.

### 7.3 The Optimal Task Unit

The ideal unit of work for a single agent session:

```
✅ Good task unit:
- Bounded scope (1 file, 1 service, 1 feature)
- Clear success criterion
- Estimatable in turns (≤15 turns)
- Does not require decisions about unrelated systems
- Has all needed context available in workspace

❌ Bad task unit:
- "Implement the whole stage 6"
- "Fix the boot issues"
- "Review the project"
- Anything requiring physical hardware access mid-task
```

### 7.4 Session Types and Their Optimal Patterns

| Session type | Trigger | Opener style | Expected turns | End state |
|---|---|---|---|---|
| **Exploration** | "How does X work?" | Question + context | 3–8 | Understanding documented |
| **Diagnosis** | Error / failure | Structured error report | 5–15 | Root cause identified |
| **Implementation** | Clear spec | Goal + constraints + scope | 8–20 | Code written + tested |
| **Review** | PR / code / scripts | Review template | 3–10 | Issues listed |
| **Automation** | Repetitive task | Template prompt | 1–3 | Script / workflow generated |
| **Planning** | New phase / project | Context + goal | 5–12 | Plan documented |

---

## PART VIII — THE SKILLS LAYER (REUSABLE PATTERNS)

### 8.1 What Skills Are

A **skill** is a saved, reusable prompt + tool combination that encapsulates a recurring workflow. Instead of re-prompting from scratch each time, you invoke a skill.

Examples from your existing practice (made explicit):
- **Report analysis skill:** Template prompt that reads a report file, compares to specs, classifies findings
- **Stage deployment skill:** Template that checks device state, runs stage N, verifies output
- **Script review skill:** Template that reviews a shell script for logic errors and edge cases

### 8.2 Building Your Skill Library

Format: Markdown files with parameterized templates.

```markdown
# SKILL: analyze-test-report

## Purpose
Analyze a single RoomMate test report and classify findings

## Parameters
- {{REPORT_FILE}} — path to the report file
- {{DEVICE}} — device serial number

## Prompt Template
You are a test analysis agent for the RoomMate embedded platform.

Read this report: {{REPORT_FILE}}
Read the relevant test spec from: RoomMate/doc/specs/test/
Read relevant source code from: RoomMate/

For each failure:
1. Identify the failing component
2. Classify as CODE-FIX or SPEC-ISSUE
3. Write a brief analysis (2-3 sentences)

Output format: structured markdown with one section per failure.
Do not analyze other report files.
Do not ask questions unless classification is truly ambiguous.
```

Store skills in: `.copilot/skills/` or a `prompts/` directory in your project.

### 8.3 GitHub Copilot Skills (Built-In + Custom)

GitHub Copilot CLI (this tool) supports skills natively. Invoke: `skill("skill-name")`.

Built-in skills available in this environment:
- `electronic-schematics` — draw circuit diagrams
- `env-file-environment` — activate Yocto build environment
- `roommate-device-access` — connect to RoomMate device by serial
- `customize-cloud-agent` — configure copilot cloud agent setup

Custom skills can be registered in `copilot-setup-steps.yml`.

---

## PART IX — OBSERVABILITY AND RELIABILITY

### 9.1 Why Observability Matters

Without observability into your AI workflow, you can't improve it. You're flying blind on:
- Which prompts work reliably vs. occasionally
- How often the model hallucinates in your domain
- How much context is being consumed per task
- Where the workflow breaks down

### 9.2 Tools

| Tool | What it measures | Use case |
|------|-----------------|----------|
| **LangSmith** | Full prompt/response logging, token counts, latency | Custom API workflows |
| **PromptLayer** | Prompt versioning, A/B comparison, cost tracking | Iterating on prompts |
| **Helicone** | OpenAI/Anthropic proxy with logging | Drop-in observability |
| **Weights & Biases (Weave)** | LLM experiment tracking | ML-adjacent work |
| **Your session logs** | Session-level interaction audit | Already doing this ✅ |

**For your profile:** Your existing copilot-sessions-keeper is your observability layer. The analysis in `COPILOT-INTERACTION-ANALYSIS.md` is the output. Continue that practice.

### 9.3 Reliability Patterns

**Guardrails:** Validate model output before acting on it
- For code: run linters/tests before committing
- For shell scripts: dry-run flag before live execution
- For irreversible operations: human confirmation checkpoint

**Retry strategy:** If model gives wrong answer:
1. Check if context was complete (most likely cause)
2. Try reformulation (different framing)
3. Try different model (some tasks favor specific models)
4. Break task into smaller steps

**Fallback:** For critical tasks, always have a manual path. Don't design workflows where AI failure = total blockage.

---

## PART X — COMPLETE STACK REFERENCE

### The Minimum Viable LLM Engineer Stack (Start Here)

```
Interface:    GitHub Copilot in VS Code (Agent Mode enabled)
Model:        Claude Sonnet 4.6 / GPT-5.3-Codex (via Copilot)
Context:      .github/copilot-instructions.md per project
Tools:        MCP: filesystem + git + github (3 servers)
Workflow:     Session types defined, skills as prompt files
Observability: Your existing session logging
```

### The Full Professional Stack

```
INTERFACE
├── VS Code + GitHub Copilot Agent Mode (primary)
├── Claude.ai / ChatGPT (planning / thinking)
└── CLI: aider or claude-code (terminal-native work)

MODEL ROUTING
├── Daily coding / debugging / agent tasks → Claude Sonnet 4.6 (default)
├── Hard problems after Sonnet fails → Claude Opus 4.6
├── Deep architecture / long specs → Claude Opus 4.5
├── Code refactor at scale / test gen → GPT-5.3-Codex
├── Cross-domain / multimodal → GPT-5.5
└── Sensitive/IP code → Ollama + local model

CONTEXT ENGINEERING
├── Per-project: .github/copilot-instructions.md
├── Per-repo: CLAUDE.md
├── Session memory: hand-maintained context file
├── ── GRAPH SUBLAYER ──────────────────────────
├── Codebase graph: Graphify (/graphify . per project)
├── Agent memory:   Graphiti/Zep (temporal, cross-session)
├── Corpus queries: GraphRAG (specs + test reports)
├── Personal wiki:  Karpathy Second Brain (2ndBrain vault)
└── (Optional) Vector RAG: ChromaDB + Continue.dev

TOOLS (MCP SERVERS)
├── filesystem, git, github (core)
├── fetch (APIs, Confluence, JIRA)
├── sequential-thinking (planning)
├── memory (cross-session state)
└── Custom MCP server for device access (future)

AGENTS
├── Copilot Agent Mode (semi-autonomous, bounded tasks)
├── Batch templates (your current report analysis pattern)
└── (Future) CrewAI or LangGraph for parallel workflows

SKILLS LIBRARY
├── .copilot/skills/*.md (parameterized templates)
└── Invoked via CLI or Copilot slash commands

OBSERVABILITY
├── copilot-sessions-keeper (existing)
├── daily-dev-tracker (existing)
└── Review cycle: monthly analysis of session patterns
```

### Stack Maturity Levels

| Level | Stack | Investment | Return |
|-------|-------|-----------|--------|
| **L1 – Reactive** | IDE chat, no MCP, no instructions files | Zero | Marginal |
| **L2 – Guided** | Instructions files, structured prompts, MCP core tools | 1–2 hours setup | 2–3x fewer corrections |
| **L3 – Systematic** | Agent Mode, skill library, session types, context discipline | 1–2 days | Reliable, reproducible outcomes |
| **L4 – Automated** | Custom MCP servers, multi-agent, RAG, observability | 1–2 weeks | Workflow runs with minimal oversight |

**You are currently at L2 → L3.** The gap to L3 is:
1. Create `copilot-instructions.md` for roomboard-linux.github
2. Formalize your skill library (your templates already exist)
3. Add MCP servers (filesystem + git + memory = 30 min setup)
4. Define explicit session types for your daily work

---

## PART XI — EMERGING PATTERNS (WATCH LIST)

| Pattern | What it is | Maturity | Worth tracking? |
|---------|-----------|----------|----------------|
| **Computer Use** | LLM controls a desktop/browser | Early | Not yet for engineering |
| **Voice-to-agent** | Speak a goal, agent executes | Early | Yes — for quick task delegation |
| **Context supply chains** | Automated pipelines feeding structured context | Growing | Yes — replacing RAG for teams |
| **Spec-to-test agents** | Feed spec, get full test suite | Promising | Directly relevant to your work |
| **Persistent agent memory** | Agent remembers across sessions natively | Developing | Key missing piece |
| **Local model routing** | Copilot-like but fully local, no cloud | Growing | Important for sensitive IP |
| **AI-native CI/CD** | PR agents that fix their own failures | Emerging | Watch Devin, SWE-bench progress |

---

## References

- **Model Context Protocol:** modelcontextprotocol.io · github.com/modelcontextprotocol
- **MCP Community Directory:** mcp.so
- **Graphify:** github.com/safishamsi/graphify · graphifylabs.ai (YC S26)
- **Graphiti / Zep:** github.com/getzep/graphiti · getzep.com
- **Zep paper:** "Zep: A Temporal Knowledge Graph Architecture for Agent Memory" — arxiv.org/abs/2501.13956
- **Microsoft GraphRAG:** github.com/microsoft/graphrag · arxiv.org/abs/2404.16130
- **Karpathy-inspired Second Brain:** github.com/NicholasSpisak/second-brain (community implementation of Karpathy's ideas)
- **Agentic Context Engineering (ACE) paper:** arxiv.org/abs/2510.04618
- **JetBrains Research — Context Management:** blog.jetbrains.com/research/2025/12/efficient-context-management
- **Google Developers — Multi-Agent Framework:** developers.googleblog.com/architecting-efficient-context-aware-multi-agent-framework
- **Anthropic Prompt Engineering Guide:** anthropic.com/docs/build-with-claude/prompt-engineering
- **GitHub Copilot Agent Mode docs:** docs.github.com/en/copilot
- **Copilot Instructions spec:** docs.github.com/copilot/customizing-copilot/adding-repository-custom-instructions

---

_Related files in this vault:_  
_· `LLM-BEST-PRACTICES.md` — How to interact effectively with LLMs_  
_· `COPILOT-INTERACTION-ANALYSIS.md` — Analysis of your actual session patterns_  
_· `COPILOT-WORKFLOW-ANALYSIS.md` — Workflow and project overview_
