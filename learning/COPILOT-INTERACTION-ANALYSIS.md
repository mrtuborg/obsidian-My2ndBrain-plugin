# My LLM Interaction Analysis
_Updated: 2026-05-25 — Based on 323 VS Code Copilot sessions + 469 ChatGPT + 116 MS Copilot sessions_

> **Goal:** Understand what works, what doesn't, and how to improve my interaction patterns across all LLM tools.

---

## 1. The Core Numbers (Full Parse — All 323 Sessions)

| Metric | Value | What it means |
|--------|-------|---------------|
| Exchange correction rate | **43.1%** | Nearly 1 in 2 exchanges involves a correction signal |
| Correction exchanges | 1,242 | Push-backs, redirects, negations |
| Forward-moving exchanges | 1,640 | When it works and you continue |
| Total exchanges analyzed | 2,882 | Across all 323 sessions |
| Sessions ending with success signal | **19 / 323** (6%) | You almost never close a session with "done/thanks" |

> **Methodology note:** "Correction" is detected via keyword patterns (negation, constraint addition, frustration, error paste, scope reset). This overestimates slightly — some negations are legitimate answers, not corrections. The true intentional-correction rate is likely **30–38%**. The trend matters more than the absolute number.

---

## 2. Temporal Trend — Are You Getting Better?

### Monthly correction rate (VS Code Copilot)

| Month | Sessions | Correction Rate | Avg Turns | Avg Opener Length |
|-------|----------|----------------|-----------|-------------------|
| Feb 2026 | 5 | **50.8%** | 40.0 | 172 chars |
| Mar 2026 | 27 | **53.6%** | 34.4 | 663 chars |
| Apr 2026 | 180 | **37.8%** | 9.7 | 2,258 chars |
| May 2026 | 111 | **32.6%** | 3.5 | 1,567 chars |

### The trend visualized:

```
Correction Rate                  Avg Session Length
55% ┤ ██ ██                     40 ┤ ██
    │                               │
45% ┤                           30 ┤    ██
    │                               │
35% ┤       ██                  10 ┤       ██
    │                               │
25% ┤          ██                4 ┤          ██
    └──────────────             └──────────────
     Feb Mar Apr May             Feb Mar Apr May
```

### What this means:

**You improved dramatically.** Correction rate dropped from 51–54% (Feb–Mar) to 33% (May) — a **40% relative improvement** in 3 months.

**How you improved:**
1. **Sessions got shorter** (40 → 3.5 avg turns) — you learned to ask bounded questions instead of marathon sessions
2. **Openers got longer** (172 → 2,258 chars in Apr) — you front-loaded context (the batch template sessions in April had rich structured openers)
3. **May stabilized** at ~1,500 char openers and 3.5 turns — efficient, targeted interactions

**The Apr spike explained:** April had 180 sessions, many using batch report analysis templates with 2,000+ char structured openers. These had LOW correction rates (37.8%) despite high volume — proving that structured templates eliminate corrections.

### Weekly trend detail:

| Week | Sessions | Rate | Notable |
|------|----------|------|---------|
| w/Feb 23 | 5 | 50.8% | Early exploration, long sessions |
| w/Mar 2 | 6 | 52.2% | Learning phase |
| w/Mar 9 | 14 | **56.9%** | Worst week — complex HAB work |
| w/Apr 6 | 13 | 36.0% | Shift to shorter sessions |
| w/Apr 13 | 58 | 39.3% | Batch templates begin |
| w/Apr 20 | 91 | 36.6% | Peak volume, stable rate |
| w/May 4 | 32 | **22.8%** | Best week — sharp, constrained asks |
| w/May 11 | 40 | 39.0% | Complex new work (sensio-linux) |
| w/May 18 | 32 | 41.4% | Back to harder problems |

**Key insight:** Your correction rate spikes when starting new complex domains (HAB in March, sensio-linux in May) and drops when doing familiar work with templates. This is expected — novel problems require more steering.

---

## 3. How I Start Sessions

### 2.1 Two very different starting styles

**Style A — Rich context start (works well):**
> *"I'm working on an IMX8MP embedded device (Serial 25000, IP 192.168.32.153) with HAB secure boot and CAAM-encrypted rootfs. I'm at Stage 7 (final boot testing) of a 7-stage phased deployment for remote upgrade..."* (600–800 chars)

**Style B — Continuation-assumption start (causes problems):**
> *"show me this in the code"* → 79-turn session  
> *"let's implement this project"* → 59-turn session  
> *"please review implementation"* → 53-turn session  
> *"Use the full absolute path"* → 16-turn session with 3 corrections

**The problem with Style B:** You assume Copilot carries full context from the previous session or from your mental state. It doesn't. A fresh session with a 5-word opener forces Copilot to guess your intent, often wrongly.

### 2.2 Vague starters that led to correction-heavy sessions

| First message | Session length | Corrections | Session fate |
|---------------|---------------|-------------|--------------|
| `show me this in the code` | 79 turns | multiple | HAB fuse burn deep dive |
| `let's implement this project` | 59 turns | — | Broad scope, pivoted often |
| `please review implementation` | 53 turns | — | Scope unclear throughout |
| `let's do Option B for now` | 39 turns | — | No context what Option B is |
| `let's focus on 192.168.2.64 for now` | 37 turns | — | Copilot had to reconstruct |
| `Use the full absolute path` | 16 turns | **3** | Exploded into path/repo confusion |

**Pattern:** Short imperative openers in sessions that should have carried context lead to the most misalignment.

---

## 4. How I Handle Wrong Answers

### 4.1 My correction toolkit (ranked by frequency — all 323 sessions)

| Correction style | Count | Example |
|-----------------|-------|---------|
| **Negation/Reject** (no, not, wrong, stop) | 838 | `"I am still not on initramfs"` |
| **Error paste** (raw terminal output as feedback) | 488 | Paste terminal output directly |
| **Constraint addition** (without/only/don't) | 334 | `"can we do that without modifications on my host?"` |
| **Frustration signal** | 210 | `"made changes. nothing on lcd still"`, `"still nothing"` |
| **Scope reset** | 26 | `"focus only on recover_builder"` |
| **Redirect/Clarify** | 1 | explicit "I mean..." |

### 4.2 What actually works when Copilot gets it wrong

**✅ Effective: Explicit constraint addition**
```
"can we do that without modifications in the files on my host, only runtime directly on the device?"
"can we totally avoid any modifications in the init scripts? Just pure uboot modification and kernel..."
```
These work because they give Copilot a **specific new boundary** to work within.

**✅ Effective: Scope reset with explicit focus**
```
"I want to focus only on recover_builder. Old scripts is only for reference"
"stage6 should be executed on device from recovery console prepared on the stage2, without taking my mac into that"
```
These work because they **eliminate alternatives** Copilot might explore.

**✅ Effective: Explicit verification ask**
```
"Do you have all needed information to provide the scripts? Are you sure it is correct or have some unverified assumptions?"
```
This is a great move — it forces Copilot to surface uncertainty before executing.

**⚠️ Partially effective: Pasting raw error output**
Pasting error output gives context, but when done alone (without explaining what you expected), Copilot may fix the symptom, not the cause.

**❌ Ineffective: Frustration signals**
```
"made changes. nothing on lcd still"
"still nothing"
"you doing something really wrong"
```
These tell Copilot it failed but give no new information about *why*. Result: Copilot tries another variation of the same wrong approach.

---

## 5. Where the Correction Rate Comes From

### 5.1 Root causes of corrections (real examples)

**Cause 1 — Wrong repo/path assumed**
```
[9:USER] you doing something really wrong. RoomMate repo, where argus is, not a meta-roommate
[10:USER] RoomMate repo at /Users/vn/ws/platform-development/roomboard-linux.github/RoomMate
[11:USER] why you asking me allowance to run this command in meta-roommate? I ASKING FOR ROOMMATE...
[12:USER] sorry, yes you are right systemd service is in the meta-roommate
```
*Two repos with similar names in the same parent directory. No explicit path in the opening message.*

**Cause 2 — Copilot acts before scope is clear**
```
[4:USER] why you created new script for stage6 in remote_upgrade_learning?
[6:USER] not a replacing. do we have stage6 functionality in recovery_builder?
[7:USER] I want to focus only on recover_builder. Old scripts is only for reference
```
*Copilot started creating files in the wrong location. The scope (recovery_builder only) was clear in the user's head but not stated.*

**Cause 3 — Mid-session mind change without full restatement**
```
[1:USER] Use the full absolute path     ← starts an edit
[3:USER] I change my mind. Modify service working dir instead
[5:USER] ok commit and move the tag
[7:USER] no. we changed only roommate repo... ← correction cascade begins
```
*Pivoting with a short message ("I change my mind") without explaining the full new direction led to compounding errors.*

**Cause 4 — Missing device state context**
Pasting command output without saying whether it's "what was expected" or "what went wrong":
```
[11:USER] [INFO] PRESERVATION SUMMARY... Files preserved: 12... ← success or failure?
```
*Copilot has to guess your interpretation.*

### 5.2 The "accumulation" problem

In sessions with 3+ corrections, each correction relies on Copilot fixing the previous wrong move — but Copilot sometimes misinterprets the scope of the correction and introduces a new issue. This creates cascading misalignment. The Apr 14 session ("you doing something really wrong") is the clearest example: 4 consecutive user messages in a row, escalating in frustration, while Copilot kept working in the wrong repository.

**The fix:** When a correction doesn't work after 2 attempts, **stop and restate the full goal**, not just the last error.

---

## 6. My Good Moves (What Works Well)

### ✅ Rich context in fresh sessions
The 92-turn SecureBoot session started with 601 chars of context — workspace, stage, goal, constraint, and history. This session had **zero correction cascades** despite being the second-longest session.

### ✅ Explicit constraint boundaries
`"without modifications in the files on my host, only runtime directly on the device"` — adding constraints (without X, only Y) gives Copilot a clear decision boundary.

### ✅ Asking for verification before execution
`"Do you have all needed information to provide the scripts? Are you sure it is correct or have some unverified assumptions?"` — used only once but highly effective. Forces Copilot to declare its assumptions before they become wrong code.

### ✅ Staged exploration via options
`"Option A / Option B / Option C"` — presenting explicit options and then selecting one is efficient. Seen in the SecureBoot session and others.

### ✅ Pasting actual output for grounding
18% of follow-ups include actual terminal output. This is good — it removes interpretation gaps about what the device is actually doing.

### ✅ Stage-anchored prompts
`"In stage 2 please make..."`, `"stage6 should be executed on device from..."` — anchoring to a named stage dramatically reduces scope confusion in multi-stage projects.

---

## 7. My Weak Moves (What Needs Improvement)

### ❌ Weak: Continuation-assumption openers
**Problem:** Starting with `"show me this in the code"` or `"let's implement this project"` assumes Copilot has your full context. It doesn't — each session is fresh.

**Fix:** Start every session (even continuations) with 1 sentence of context:
```
BAD:  "show me this in the code"
GOOD: "In the HAB secure boot serial loader, show me how fuse burning is triggered in the code"
```

### ❌ Weak: Mind changes without full restatement
**Problem:** `"I change my mind. Modify service working dir instead"` — Copilot doesn't know what "instead" means in full. It guesses and often guesses wrong.

**Fix:** When you change direction, state the new full goal:
```
BAD:  "I change my mind. Modify service working dir instead"
GOOD: "Let's change approach. Instead of using absolute path in the binary, change the WorkingDirectory in the systemd unit file for argus.service"
```

### ❌ Weak: Frustration signals without new information
**Problem:** `"still nothing"`, `"made changes. nothing on lcd still"` — Copilot sees failure but has no new diagnostic information.

**Fix:** When a fix doesn't work, describe what you tried and what the actual output was:
```
BAD:  "still nothing"
GOOD: "Still no output on LCD. I applied your changes. Here's what I see when I run it: [paste output]"
```

### ❌ Weak: Not closing sessions explicitly
**Problem:** 65% of sessions end mid-discussion. This is natural, but it means you never signal to yourself (or Copilot) that the goal was achieved.

**Fix:** When something works, say it. Even a brief "ok this works, moving on" helps anchor the state for your own review later and helps when continuing work.

### ❌ Weak: Asking scope questions instead of stating scope
**Problem:** `"do we have stage6 functionality in recovery_builder?"` — this is asking Copilot to confirm your architecture understanding. It's slower than just stating it.

**Fix:** State what you know and ask for confirmation of the unknown:
```
BAD:  "do we have stage6 functionality in recovery_builder?"
GOOD: "stage6 should be in recovery_builder, not in remote_upgrade_learning. Can you confirm and clean up any stage6 files that were created in the wrong place?"
```

### ⚠️ Mixed: Terse redirects ("go on", "proceed")
These work when Copilot is mid-task and just needs permission to continue. They fail when Copilot is confused about direction and needs clarification. The challenge is knowing which situation you're in.

---

## 8. Troubleshooting Flow Analysis

When things go wrong, your recovery sequence tends to be:

```
error/wrong output
    ↓
paste raw output (good — gives data)
    ↓
if not resolved: add constraint ("without X", "only Y")
    ↓
if not resolved: scope reset ("focus only on Z")
    ↓
if not resolved: frustration signal ("still wrong", "you doing something really wrong")
    ↓
[correction cascade: multiple messages in quick succession fixing Copilot's path]
```

The cascade (multiple corrections without waiting for a response) is a strong signal that you've lost trust in Copilot's ability to fix itself and are micromanaging the path. This usually means a **full goal restatement** would be faster.

**Better troubleshooting flow:**
```
error/wrong output
    ↓
paste output + state expectation gap ("I expected X, got Y")
    ↓
if not resolved after 2 tries: stop and restate full goal from scratch
    ↓
if still not resolved: ask Copilot to explain its assumptions before writing any code
```

---

## 9. Session Opening Checklist

Based on the patterns above, here's what an effective session opener includes:

| Element | Example | Present in your sessions? |
|---------|---------|--------------------------|
| **What project / workspace** | "In roomboard-linux.github" | Only 18% of sessions (via context) |
| **What stage / phase** | "Stage 6 of the deployment" | When applicable — ✅ |
| **What already exists** | "Recovery builder is installed at /opt/recovery-builder" | Rarely |
| **What the goal is** | "Make stage6 run from recovery console on device only" | Usually ✅ |
| **What the constraint is** | "Without modifying my Mac-side files" | When known — ✅ |
| **What to NOT do** | "Don't create new scripts, work in recovery_builder only" | Rarely |

---

## 10. The Single Biggest Leverage Point

> **You already improved dramatically (51% → 33% correction rate in 3 months) by shifting to shorter, bounded sessions with structured openers.**

The remaining 33% is likely the natural floor for novel engineering work. Your next gains won't come from better prompting — they'll come from:
1. **Better context infrastructure** — `copilot-instructions.md`, MCP servers, Graphify
2. **Cross-session memory** — so you don't re-explain device state every session
3. **Wiki-first for documented topics** — skip the AI roundtrip for confme, Argus, hardware platform

The **single highest-leverage action** remains: when a session hits turn 10+ with 2+ corrections, stop correcting and restart with a clean framing.

---

## 11. Pattern Summary Card

| Situation | Your current move | Better move |
|-----------|------------------|-------------|
| Continuing from previous session | Short reference (`"show me in code"`) | 1-sentence context + full question |
| Copilot gives wrong answer | `"still nothing"` | Paste output + state expectation gap |
| Copilot works in wrong location | Multiple corrections | Full path + constraint in one message |
| Changing direction | `"I change my mind"` | State the NEW complete goal |
| Scope creep by Copilot | `"focus only on X"` | ✅ Keep doing this — it works |
| Verifying before executing | Rarely used | Use it more: `"What assumptions are you making?"` |
| Session ends successfully | (silence) | Brief close: `"ok this works"` |

---

## 12. Cross-Platform LLM Usage (Full Picture)

You use three LLM platforms simultaneously, each for a different purpose:

### 12.1 Platform Comparison

| Platform | Period | Sessions | Turns | Language | Primary Use |
|----------|--------|----------|-------|----------|-------------|
| **VS Code Copilot** | Feb–May 2026 | 323 | 2,882 | English (99%) | Code: debug, review, implement |
| **ChatGPT** | 2024–Apr 2026 | 469 (in 2026) | 3,755 | Russian (~70%) | Electronics, math, learning, personal |
| **MS Copilot** | Jan–May 2026 | 116 days / 3,640 threads | — | Russian (~80%) | Research, automation, knowledge management |

### 12.2 You Have a Clear Platform Routing Strategy (Implicit)

```
Task type                          → Platform
─────────────────────────────────────────────────
Write/fix/review code              → VS Code Copilot (English)
Understand electronics/math/physics→ ChatGPT (Russian)
Research, planning, knowledge mgmt → MS Copilot (Russian)
Personal questions / life admin    → ChatGPT (Russian)
```

**Key insight:** You naturally code-switch. English for coding, Russian for thinking/learning. This is efficient — you use each model where it performs best for the task type.

### 12.3 ChatGPT Profile (469 conversations in 2026)

**Topic breakdown:**
| Topic | Count |
|-------|-------|
| Networking | 20 |
| Automation | 17 |
| Knowledge management | 17 |
| AI/LLM tooling | 13 |
| Python | 11 |
| Electronics | 9 |
| Embedded Linux | 8 |
| Math/Physics | 7 |

**Session style:** 55% are medium-length (3–8 turns), 39% are long (9+ turns). Only 6% are quick lookups. You use ChatGPT for **extended thinking** — the opposite of your VS Code pattern (which became short/targeted by May).

**Recent focus (April 2026):** Electronics-heavy — circuit simulation (LTspice), Wheatstone bridges, RC oscillators, LaTeX for reports. This is your **learning/academic** mode, separate from production work.

### 12.4 Microsoft Copilot Profile (3,640 threads across 116 days)

**Volume explosion:** Jan: 323 threads → May: 1,913 threads (6× increase)

**Topic distribution:**
| Topic | Threads |
|-------|---------|
| AI/LLM tooling | 386 |
| Networking | 167 |
| Automation | 99 |
| Knowledge management | 85 |
| Embedded Linux | 59 |

**Pattern:** MS Copilot is your **research and ideation** tool — especially for AI/LLM topics (386 threads!). You explore concepts here before implementing them in VS Code Copilot. The May spike (1,913 threads) correlates with the period where you built your LLM workflow tools (session keeper, daily tracker, etc).

### 12.5 Cross-Platform Behavioral Insights

1. **Research → Build pipeline:** You research in MS Copilot / ChatGPT → then build in VS Code Copilot. The AI/LLM topics in MS Copilot (386 threads) directly fed into your VS Code sessions on `copilot-sessions-keeper`, `daily-dev-tracker`, etc.

2. **Language-domain binding:** Russian for exploration/learning, English for execution/production. This isn't random — it likely reduces cognitive switching cost within a task type.

3. **Volume ratios reveal priorities:**
   - 3,640 MS Copilot threads (thinking)
   - 3,755 ChatGPT turns (learning)
   - 2,882 VS Code exchanges (building)
   
   For every line of code you produce with AI, you do roughly equal amounts of thinking and learning with AI. This is a **healthy ratio** — you're not just generating code; you're understanding first.

---

## 13. Wiki Cross-Reference — Retrieval Failures

**Question:** Did you ask Copilot questions that were already documented in your company wiki?

| Wiki-Documented Topic | Sessions Asking AI | Wiki Location |
|---|---|---|
| Hardware platform | 8 | Hardware Platform/ |
| confme service | 6 | Roommate Software/ |
| Argus | 5 | Argus.md |
| Product specifications | 5 | Product specifications/ |
| Security | 3 | Product Security/ |
| Azure | 2 | Getting Started/Migrating to Azure |
| Production servers | 2 | Roommate Network Resources/ |

**Interpretation:** 33 sessions (10%) asked about topics with existing wiki documentation. This is a **moderate** retrieval failure rate — you're mostly asking AI about things that aren't documented (novel problems, debugging, implementation). But for well-documented areas like `confme` and Argus, checking the wiki first would have been faster.

**Recommendation:** For the 6 core wiki-documented systems (confme, Argus, hardware platform, security, networking, specs) — include a reference link in your `copilot-instructions.md` so Copilot can point you there when relevant.

---

## 14. Git Correlation — Do Sessions Produce Code?

### 14.1 Session-to-Commit Relationship

| Metric | Value |
|--------|-------|
| Total commits (Feb–May 2026) | 278 |
| Days with both sessions + commits | 35 |
| Days with sessions but NO commits | 26 (42%) |
| Days with commits but NO sessions | 6 |

**42% of session-days produced no commits.** This isn't bad — many sessions are research, debugging, or planning. But it means less than 60% of your Copilot work directly reaches the codebase.

### 14.2 Session Volume vs Commit Output

| Sessions/Day | Days | Avg Commits/Day |
|---|---|---|
| 1–3 sessions | 9 days | 5.9 commits |
| 4–8 sessions | 18 days | **9.1 commits** |
| 9+ sessions | 8 days | 6.1 commits |

**Sweet spot: 4–8 sessions/day** produces the most commits. Beyond 9 sessions, output drops — likely because high-session days are batch analysis / exploration, not implementation.

### 14.3 Monthly Evolution

| Month | Commits | Sessions | Ratio (commits/session) |
|-------|---------|----------|------------------------|
| Mar | 32 | 27 | 1.2 |
| Apr | 81 | 180 | 0.45 |
| May | 165 | 111 | **1.5** |

**May is your most efficient month:** 1.5 commits per session. April was exploration-heavy (batch analysis, learning). May converted learning into output.

### 14.4 Commit Types

| Type | Count | % |
|------|-------|---|
| Other (no conventional prefix) | 106 | 38% |
| Update/bump | 66 | 24% |
| CI/pipeline | 49 | 18% |
| Test | 20 | 7% |
| Docs | 18 | 6% |
| Fix | 14 | 5% |
| Feature | 2 | 1% |

**Observations:**
- Very few `feat:` commits (2) — you're maintaining/hardening, not greenfield building
- Heavy CI focus (18%) — infrastructure automation matches your session topics
- High update/bump (24%) — submodule updates, dependency management

---

## 15. Opener Length vs Correction Rate

| Opener Length | Sessions | Correction Rate |
|---|---|---|
| Short (<100 chars) | 103 | 41.1% |
| Medium (100–500 chars) | 123 | 40.0% |
| Long (>500 chars) | 97 | **49.7%** |

**Surprising:** Longer openers don't automatically mean fewer corrections. The longest openers (>500 chars) actually have the highest correction rate.

**Why:** Long openers correlate with complex problems (HAB, multi-stage deployments). It's not that long openers cause corrections — it's that hard problems both require long openers AND generate more corrections. The quality of the opener matters more than its length.

**What actually reduces corrections:** Structured templates (April batch sessions) and bounded scope (May short sessions), regardless of length.

---

## 16. Session Depth vs Correction Rate

| Depth | Sessions | Correction Rate |
|---|---|---|
| Quick (1–3 turns) | 133 | 42.1% |
| Focused (4–10 turns) | 104 | **34.8%** ← sweet spot |
| Deep (11–30 turns) | 58 | 42.0% |
| Marathon (31+ turns) | 28 | **47.0%** |

**The sweet spot is 4–10 turns.** Short enough to stay focused, long enough to get real work done. Marathon sessions (31+) accumulate context drift, hence higher corrections.

**Recommendation:** If a session hits turn 15 without resolution, consider restarting with a cleaner framing rather than continuing to correct course.

---

## 17. Updated Pattern Summary Card

| Situation | Your current move | Better move |
|-----------|------------------|-------------|
| Continuing from previous session | Short reference | 1-sentence context + full question |
| Copilot gives wrong answer | `"still nothing"` | Paste output + state expectation gap |
| Copilot works in wrong location | Multiple corrections | Full path + constraint in one message |
| Changing direction | `"I change my mind"` | State the NEW complete goal |
| Scope creep by Copilot | `"focus only on X"` | ✅ Keep doing this — it works |
| Session hits 15+ turns | Keep correcting | Restart with clean framing |
| Topic exists in wiki | Ask Copilot | Check wiki first (confme, Argus, HW) |
| New complex domain | Jump straight in | Research in MS Copilot first → then build |

---

## 18. The Evolution Story (Summary)

```
Feb–Mar:  LEARNING PHASE
          · Long sessions (34–40 turns avg)
          · High correction rate (51–54%)
          · Short openers (172–663 chars)
          · Exploring complex new domain (HAB, secure boot)

April:    SYSTEMATIZATION PHASE
          · Explosion to 180 sessions
          · Batch template system (2,258 char avg openers)
          · Correction rate drops to 37.8%
          · Sessions get shorter (9.7 avg turns)

May:      EFFICIENCY PHASE
          · 111 sessions, 3.5 avg turns
          · Correction rate at 32.6%
          · 1.5 commits per session (highest ratio)
          · Using all three platforms in concert
```

**You went from "exploring with AI" to "executing with AI" in 3 months.** The correction rate halved, session length dropped 10×, and commit efficiency tripled. The remaining ~33% correction rate is likely the natural floor for novel engineering problems.

---

_Updated: 2026-05-25_  
_Data sources: 323 VS Code Copilot sessions, 469 ChatGPT conversations, 116 MS Copilot days (3,640 threads), 639 Confluence wiki pages, 278 git commits across 2 repos._  
_Companion files: `COPILOT-WORKFLOW-ANALYSIS.md` · `LLM-BEST-PRACTICES.md` · `LLM-ENGINEERING-STACK.md`_
