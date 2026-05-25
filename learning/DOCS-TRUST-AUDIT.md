# Documentation Trust Audit
_Self-review: 2026-05-25 — Critical analysis of the 4-document set_

---

## Overall Trust Ratings

| Document | Trust | Confidence basis |
|----------|-------|-----------------|
| `COPILOT-WORKFLOW-ANALYSIS.md` | **85%** | Real data, heuristic classification adds noise |
| `COPILOT-INTERACTION-ANALYSIS.md` | **80%** | Sample-based (157/322), pattern-coded with heuristics |
| `LLM-BEST-PRACTICES.md` | **90%** | Mostly sourced from official guides; Bloom's section is solid |
| `LLM-ENGINEERING-STACK.md` | **70%** | Contains most unverifiable claims — tool specifics, benchmarks |

**Bottom line:** The *patterns* and *architecture thinking* are sound. The risk is in **specific claims** — numbers, commands, tool behaviors — that were written from single web fetches or inference, not verified by running the tools.

---

## 🔴 HARD ERRORS (things that are wrong or unverifiable)

### 1. Graphify — "YC S26" claim
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV-B  
**Problem:** YC S26 = Summer 2026. We're in May 2026. This batch may not have demo'd yet. The claim came from a single GitHub page fetch and may be aspirational (application/acceptance) rather than completed.  
**Fix:** Change to "YC-backed startup" or verify current status.

### 2. Graphify — `pip install graphifyy` (double-y) and CLI commands
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV-B  
**Problem:** The package name, CLI commands (`graphify install --platform copilot`, `graphify vscode install`, `graphify query`, `graphify prs`), and MCP server mode were all documented from a single README fetch. None were tested. If the package doesn't exist on PyPI right now, or the CLI API changed, these instructions will fail silently.  
**Risk:** HIGH — a reader following these steps will hit immediate errors if anything is off.  
**Fix:** Add a note: "Verify current install instructions at github.com/safishamsi/graphify before running." Better: actually test `pip install graphifyy` before publishing.

### 3. Graphiti benchmarks — "94.8% on DMR", "18.5% better, 90% lower latency"
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV-B  
**Problem:** Self-reported benchmarks from the project's own paper/README. Not independently replicated. Marketing numbers.  
**Fix:** Add "(self-reported)" qualifier. These are directional, not absolute.

### 4. GraphRAG — "1000× more expensive to index"
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV-B  
**Problem:** This ratio depends entirely on corpus size, model used, and whether you count just API calls or total infra. The 1000× figure is hyperbolic shorthand from blog posts, not a measured constant.  
**Fix:** Change to "orders of magnitude more expensive" or "10–1000× depending on corpus size."

### 5. MCP spec date — "2025-11-25"
**Location:** `LLM-ENGINEERING-STACK.md`, Part V  
**Problem:** MCP has been evolving rapidly. By May 2026, the spec version is likely newer. This could mislead someone checking compatibility.  
**Fix:** Check modelcontextprotocol.io for current version.

### 6. Karpathy Second Brain — misleading attribution
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV-B  
**Problem:** The linked repo (`github.com/NicholasSpisak/second-brain`) is a community implementation inspired by Karpathy's videos/tweets. Karpathy himself doesn't maintain it. Calling it "Karpathy's Second Brain" implies his authorship.  
**Fix:** Rename to "Karpathy-inspired Second Brain pattern" and note it's a community implementation of his ideas.

### 7. Missing reference — Chain-of-Thought paper removed
**Location:** `LLM-BEST-PRACTICES.md`, Sources section  
**Problem:** During the Bloom's Taxonomy addition, the reference to "Chain-of-Thought Prompting (Wei et al., 2022) — arxiv.org/abs/2201.11903" was accidentally replaced. This is a foundational prompting paper that should remain.  
**Fix:** Restore the reference.

### 8. Cursor — `.cursorrules` is outdated
**Location:** `LLM-ENGINEERING-STACK.md`, section 4.3  
**Problem:** Cursor moved to `.cursor/rules/` directory structure. The single-file `.cursorrules` approach is deprecated.  
**Fix:** Update to current format.

---

## 🟡 SOFT CLAIMS (directionally correct but presented too assertively)

### 1. "The first message determines 80% of the session quality"
**Location:** `LLM-BEST-PRACTICES.md`, Part II, section 2.1  
**Status:** This is my heuristic from the session analysis, not a researched finding.  
**Fix:** Reword as "In my sessions, the first message is the strongest predictor of session quality" — attribute to observation, not universal law.

### 2. "Context engineering is the defining skill of 2025"
**Location:** `LLM-ENGINEERING-STACK.md`, Part IV  
**Status:** Industry trend, widely discussed, but "defining" is editorial opinion.  
**Fix:** Acceptable as written (clearly an opinion in context), but don't cite it elsewhere as fact.

### 3. "15–23 minutes" cognitive recovery cost
**Location:** `LLM-ENGINEERING-STACK.md`, Part VII  
**Status:** Originates from Gloria Mark's research. The 23-minute figure is time to *return to original task*, not "cognitive recovery cost." Slightly misrepresented.  
**Fix:** More precise: "average 23 minutes to return to the original task after an interruption (Mark et al.)"

### 4. Model context windows — "200K" for Claude, "128K" for GPT
**Location:** `LLM-ENGINEERING-STACK.md`, Part II  
**Status:** These are ballpark. Actual windows may differ per model variant and may have changed. "200K" is stated for all 3 Claude models which may not be accurate for Opus 4.5 vs 4.6.  
**Fix:** Add "(verify current limits)" or check latest docs.

### 5. "5–10× more per token" for Opus vs Sonnet
**Location:** `LLM-ENGINEERING-STACK.md`, Part II  
**Status:** Directionally correct but the exact ratio fluctuates with pricing changes.  
**Fix:** Acceptable as rough guidance. Note it as approximate.

---

## 🟠 COMPLETENESS GAPS

### Missing from Model Layer:
1. **Claude Haiku 4.5** — fast/cheap tier, important for routing simple tasks
2. **Gemini Flash** — speed-optimized tier
3. **Prompt caching** — Anthropic and OpenAI both offer it; significant cost/latency optimization you can use today

### Missing from Stack:
4. **Token economics** — no section on managing cost. When to be terse vs. verbose in prompts, how to estimate session cost, budget alerts.
5. **Copilot Extensions** — GitHub's growing marketplace for domain-specific tools
6. **Web search in-context** — guidance on when to use Copilot's web search vs manual research

### Missing from Interaction Analysis:
7. **No industry baseline** — Is 36% correction rate high or low? No public benchmarks exist for this metric. Should acknowledge this explicitly rather than let the reader assume it's definitively "bad."

### Missing from Best Practices:
8. **Model-specific failure modes** — different models fail differently. Claude tends toward over-compliance; GPT tends toward verbosity. No guidance on adapting prompts per model.

### Missing from all documents:
9. **Consolidated action plan** — recommendations are scattered. No single "what to do first Monday morning" section with prioritized steps.

---

## 🔵 STRUCTURAL ISSUES

### 1. Part numbering broken in Stack doc
`LLM-ENGINEERING-STACK.md` goes: Part I → II → III → IV → IV-B → then section "5.1" with NO "PART V" heading → Part VI → VII → VIII → IX → X → XI.  
The Part V header was lost. Readers scanning headings will be confused.

### 2. Domain topic counts are misleading
`COPILOT-WORKFLOW-ANALYSIS.md` section 3: "Testing / QA: 265 sessions" out of 322 total. This counts keyword *presence*, not primary topic. A session about HAB fuse burning that mentions "test" once would be counted. The column header says "sessions where the topic appears" which is technically correct — but visually it reads like 82% of sessions are about testing, which is misleading.

### 3. Sample bias in interaction analysis
`COPILOT-INTERACTION-ANALYSIS.md`: Built from 157 sessions with parseable content out of 322 total. The other 165 may have been short/empty. But the correction rate (36%) is presented as a universal metric, not as "36% within the sample of longer sessions." Short sessions (which were excluded) likely have LOWER correction rates because they're simple Q&A. Real overall rate is probably lower than 36%.

### 4. Cross-doc redundancy risk
The session opening checklist appears in both `LLM-BEST-PRACTICES.md` (Part IX) and `COPILOT-INTERACTION-ANALYSIS.md`. If one is updated and the other isn't, they'll diverge.

---

## ✅ WHAT YOU CAN FULLY TRUST

1. **The patterns identified in your sessions** — even with heuristic noise, the core patterns (vague openers → corrections, constraint addition as the best fix, 65% abandoned sessions) are clearly real.

2. **The architectural layering** — Model → Interface → Context → Tools → Agents → Workflow. This is industry consensus, well-sourced.

3. **Best practices Part I–IX** — sourced from Anthropic, OpenAI, and GitHub official guides. These are established patterns.

4. **Bloom's taxonomy framework** — sourced from a specific article, correctly applied. The inversion concept is sound.

5. **MCP protocol architecture** — the concepts (Resources, Tools, Prompts over JSON-RPC 2.0) are correct and well-documented upstream.

6. **The interaction anti-patterns** — "vague continuation", "frustration signal", "raw paste" — all clearly evidenced from your actual sessions.

7. **The session type taxonomy** — Exploration, Diagnosis, Implementation, Review, Automation, Planning — practical and grounded.

---

## 🛠️ RECOMMENDED FIXES (Priority Order)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Actually test `pip install graphifyy` — verify the package exists and commands work | 5 min | Prevents reader from hitting dead end |
| 2 | Add "PART V" header before section 5.1 in stack doc | 1 min | Structural clarity |
| 3 | Restore Chain-of-Thought reference in best practices Sources | 1 min | Completeness |
| 4 | Add Claude Haiku 4.5 to model layer + note on prompt caching | 5 min | Practical completeness |
| 5 | Add "(self-reported)" to Graphiti benchmarks | 1 min | Honesty |
| 6 | Change "1000×" to "orders of magnitude" for GraphRAG cost | 1 min | Accuracy |
| 7 | Add sample-size caveat to 36% correction rate | 2 min | Statistical honesty |
| 8 | Update Cursor to `.cursor/rules/` directory | 1 min | Accuracy |
| 9 | Rename "Karpathy Second Brain" to "Karpathy-inspired pattern" | 1 min | Attribution honesty |
| 10 | Verify MCP spec version is current | 2 min | Currency |

---

## SUMMARY VERDICT

**The documents are useful and directionally correct.** The architecture, patterns, and frameworks are solid — you can trust the structure and act on the recommendations.

**Where to be cautious:** Specific tool commands (Graphify CLI), benchmark numbers (Graphiti, GraphRAG), and version-specific claims (MCP spec, Cursor config). Before running any install command from the stack doc, verify it against the current upstream README.

**The biggest risk is not errors — it's staleness.** This landscape moves fast. These docs will need a refresh in 2–3 months, particularly:
- Model list (new releases quarterly)
- MCP ecosystem (new servers constantly)
- Tool commands (Graphify is pre-1.0, expect breaking changes)

**Recommendation:** Add a "Last verified" date to each major section. When you re-read the doc 8 weeks from now, you'll know which sections might be stale.

---

_Generated: 2026-05-25_
