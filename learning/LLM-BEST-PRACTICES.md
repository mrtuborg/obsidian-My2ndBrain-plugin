# LLM Interaction Best Practices
## Golden Standard for AI-Augmented Engineering
_Profile: Embedded Linux / Platform Engineer · May 2026_

> This document combines industry best practices (Anthropic, OpenAI, Google, GitHub Copilot guidelines, 2024–2025 research) with patterns specific to systems/platform engineering work. It is written for engineers who interact with LLMs daily as a core part of their technical workflow — not occasional users.

---

## PART I — MENTAL MODEL

### 1.1 What an LLM Actually Is (For This Context)

Treat the LLM as a **brilliant but amnesiac colleague**:
- Extremely knowledgeable about your domain
- Has no memory between sessions
- Cannot see your screen, your terminal, or your file system unless you show it
- Will confidently fill in gaps with plausible-sounding but wrong assumptions
- Performs dramatically better when given constraints than when given freedom

**The fundamental rule:** The quality of your output is determined by the quality of your input. Every second invested in framing the question saves minutes in corrections.

### 1.2 The Three Failure Modes

| Failure mode | What it looks like | Root cause |
|---|---|---|
| **Assumption drift** | LLM works on the wrong file, repo, or component | Missing explicit scope |
| **Goal mismatch** | LLM solves a different problem than you intended | Ambiguous or incomplete intent |
| **Hallucination spiral** | LLM keeps refining a wrong approach | You corrected symptoms, not the direction |

Most wasted interactions trace back to one of these three.

---

## PART II — SESSION STRUCTURE

### 2.1 The Session Opening — The Most Critical Moment

The first message is the strongest predictor of session quality (observed in this dataset — sessions with rich openers had dramatically fewer corrections). Every session opener should contain:

```
[SCOPE]      What project / workspace / repo / component
[STATE]      What already exists / what stage you're at  
[GOAL]       What you want to achieve by end of this session
[CONSTRAINT] What is off-limits or must be preserved
[FORMAT]     How you want the answer (script, explanation, review, etc.)
```

**Bad opener:**
> `"show me this in the code"`

**Good opener:**
> `"In the HAB secure boot serial loader at /Users/vn/ws/platform-support/imx_roommate_serial_loader, show me how fuse burning is triggered. I'm trying to understand whether it happens before or after CAAM encryption. Just read the code and explain the sequence — don't modify anything."`

**Rule of thumb:** If your opener is under 50 words and contains no paths, component names, or constraints — rewrite it.

### 2.2 Continuation Sessions — The Second Most Common Mistake

Every new Copilot session starts **with zero memory**. This is the single most common source of misalignment.

**Minimum continuation opener:**
```
"Continuing from previous work on [project]. 
Current state: [1 sentence — what was just done / what's broken / where we stopped].
Goal for this session: [what you want to achieve now].
[Add constraint if changed]"
```

**Examples:**
```
BAD:  "let's implement this project"
GOOD: "Continuing the slack-topic-keeper project. The API client is done. 
       Now implement the Slack webhook handler in handler.py — 
       keep it under 100 lines, no external deps beyond what's in requirements.txt"
```

```
BAD:  "show me this in the code"  
GOOD: "In imx_roommate_serial_loader, show me where HAB fuse burning is called in the 
       stage6 flow — I need to verify it runs before CAAM blob creation, not after."
```

### 2.3 Structuring Long Sessions

For sessions that will require 10+ turns:

1. **State the full goal upfront**, not just the first step
2. **Declare what's out of scope** — prevents Copilot from "improving" things you didn't ask about
3. **Name the phases** if multi-step: "First we'll X, then Y, then Z"
4. **At turn 5+**: if the conversation drifts, restate the current goal explicitly

---

## PART III — PROMPT PATTERNS

### 3.1 The Context Frame (Most Important Pattern)

Before giving the task, establish context. Especially critical for embedded/systems work where the environment is highly specific.

**Template:**
```
CONTEXT:
- Hardware: [device, chip, relevant peripherals]
- OS/Platform: [Yocto, systemd version, kernel version if relevant]
- Stage/Phase: [where in the workflow you are]
- Relevant paths: [actual paths if Copilot needs to read files]
- What already works: [don't let Copilot "fix" things that are fine]

TASK: [specific, bounded ask]

CONSTRAINTS:
- [what must not change]
- [dependencies or compatibility requirements]
- [scope limits: "only in this file / service / script"]
```

### 3.2 The Assumption Exposure Pattern

Before Copilot writes any code or makes changes, ask it to surface its assumptions:

```
"Before you implement this — what assumptions are you making about 
[X / Y / Z]? List them so I can confirm before you proceed."
```

This is extremely high-value. Used correctly, it:
- Catches wrong-repo or wrong-path assumptions before damage
- Forces Copilot to reason about edge cases
- Gives you a natural checkpoint to correct direction

**When to use it:**
- First time working in an unfamiliar area
- Any task touching multiple repos or paths
- After a mind-change or direction pivot
- Before any destructive operation (format, overwrite, delete)

### 3.3 The Constraint Injection Pattern

When you need Copilot to work within specific limits, state them as negatives AND positives:

```
"Do X — but:
- WITHOUT modifying files on my host (device-side only)  
- ONLY in the recovery_builder module, not in remote_upgrade_learning
- DO NOT create new scripts — work within existing ones
- KEEP the current API signature, only change the internal logic"
```

Constraints dramatically improve output quality. The LLM is better at satisfying a constrained problem than an open one.

### 3.4 The Binary-State Feedback Pattern

When pasting output (logs, terminal, error messages), always include a verdict:

```
BAD:  [paste raw output]
GOOD: [paste raw output]
      "This is WRONG — I expected [X] but got [Y]. The issue is probably in [Z area]."

BAD:  "still nothing"
GOOD: "Applied your change. Still no output on the LCD. 
       Here's the current output of [command]: [output]. 
       The display was working before your change."
```

Never paste raw output without telling Copilot whether it represents success or failure and what you expected.

### 3.5 The Verification Checkpoint Pattern

After a long series of changes or explanations, verify alignment before proceeding:

```
"Before we continue — summarize what you understand to be:
1. The current state of the system
2. What we're trying to achieve
3. What you're about to do next"
```

This catches accumulated misunderstanding early. Cheaper than discovering it at turn 20.

### 3.6 The Direction Reset Pattern

When a correction doesn't work after 2 attempts, **stop correcting and restart the goal**:

```
"Let's step back. Forget the last [N] messages about [X].
Here's the actual goal: [restate from scratch].
Current state: [actual state right now].
What's the simplest correct path forward?"
```

Cascading corrections compound errors. A clean reframe is faster than a fourth correction.

### 3.7 The "Explain Before Execute" Pattern

For any task with irreversible consequences or high complexity:

```
"Don't do this yet. First, explain step-by-step what you would do and why. 
I'll confirm before you proceed."
```

Especially important for:
- Git operations (rebase, force push, tag moves)
- Filesystem operations on running devices
- Script changes that run on remote hardware
- Any multi-repo operation

---

## PART IV — DEBUGGING WITH LLMs

### 4.1 The Structured Error Report

Don't just paste an error. Give Copilot the full diagnostic frame:

```
SYMPTOM: [what you see]
EXPECTED: [what you expected to see]
CONTEXT: [what you were doing when it happened]
WHAT I TRIED: [previous attempts and their outcomes]
OUTPUT: [paste actual output / logs]
CONSTRAINT: [what must not change in the fix]
```

**Example:**
```
SYMPTOM: LCD shows nothing after applying LCD init changes
EXPECTED: Nokia 5110 should display test pattern on boot
CONTEXT: Running on Raspberry Pi Pico with GME128128-01-IIC display over SPI
WHAT I TRIED: Applied your SPI config, rebooted. No change.
OUTPUT: [paste MicroPython repl output]
CONSTRAINT: Don't change the display library — it's used by other modules
```

### 4.2 Log Analysis Pattern

For embedded/systemd logs, frame the ask precisely:

```
"Analyze this journalctl output. 
Focus only on [service name] errors between [timestamp range].
Ignore [known irrelevant noise — e.g., caam pkc registration messages].
Tell me: is this a config issue, a timing issue, or a code bug?
Here's the log: [paste]"
```

Filtering noise before analysis saves multiple back-and-forth turns.

### 4.3 The Investigation-Before-Fix Pattern

For non-obvious failures, separate diagnosis from repair:

```
Step 1: "Don't fix anything yet. Analyze [X] and explain what's wrong and why."
Step 2: [Review explanation, confirm or correct understanding]
Step 3: "Now implement the fix based on your diagnosis."
```

Skipping step 1 is the most common cause of fixing the wrong thing.

### 4.4 Root Cause vs. Symptom Discipline

When Copilot offers a fix, always ask:

```
"Is this fixing the root cause or the symptom? 
What's the underlying reason this happened?"
```

If Copilot can't answer this, it's likely patching a symptom.

---

## PART V — MULTI-SESSION PROJECTS

### 5.1 The Project Context File

For any project spanning multiple sessions (>3 sessions), maintain a short context file:

```markdown
# PROJECT: [name]
Updated: [date]

## State
- [What's done]
- [What's in progress]
- [What's blocked and why]

## Architecture
- [Key paths, components, repos]
- [Dependencies]

## Decisions Made
- [Why X was chosen over Y]
- [Constraints that were established]

## Next Session Should Start With
- [Specific goal for next session]
```

At the start of each session: `"Read [path to context file] and give me a 3-line summary of where we are."`

### 5.2 The Session Close Pattern

Before ending a session where work was done, write a brief close:

```
"Summarize what was accomplished in this session in 3-4 bullets 
and what the next step should be. I'll save this as context."
```

Paste that summary into your context file. This eliminates continuation-assumption openers.

### 5.3 Staged Milestones — Naming Convention

For phased work (deployment stages, migration steps, test phases):

- **Always reference the stage name** when prompting: `"In Stage 6..."`
- **Never assume Copilot knows which stage you're on** — state it explicitly each session
- **When transitioning between stages**: explicitly say `"Stage 5 is complete. We're now moving to Stage 6. The goal of Stage 6 is [X]."`

---

## PART VI — CODE REVIEW AND SCRIPTING

### 6.1 Script Review Prompt Template

```
"Review this [bash/Python/Ruby] script for:
1. Logical errors and edge cases
2. Error handling gaps
3. Assumptions that might be wrong in [specific environment: Yocto, systemd, recovery console]
4. Anything that would fail silently

Script: [paste]

Context: This runs on [device/environment] during [stage/process].
Do NOT suggest refactoring style — only flag actual problems."
```

### 6.2 The "Never Tested" Flag

When giving Copilot a script that hasn't been verified:

```
"This script was never tested in production. 
Before we run it, identify all assumptions it makes about 
[device state / file existence / environment / permissions] 
that we should verify first."
```

### 6.3 Code Change Scope Control

Prevent Copilot from "improving" things you didn't ask about:

```
"Make ONLY this change: [specific change].
Do not refactor other parts of the file.
Do not change function signatures.
Do not add logging unless I ask.
Show me a diff of exactly what changed."
```

---

## PART VII — GITHUB COPILOT SPECIFIC

### 7.1 Workspace Instructions (`.github/copilot-instructions.md`)

GitHub Copilot supports a workspace-level instructions file. For any significant project, create:

```markdown
# Copilot Instructions

## Project Context
[Brief description of what this repo does]

## Tech Stack
- [Language, version]
- [Key frameworks]
- [Key constraints: e.g., "must work on Yocto kirkstone", "must be POSIX-compatible bash"]

## Conventions
- [Naming conventions]
- [Error handling approach]
- [Logging style]

## What NOT to do
- Don't add external dependencies without asking
- Don't modify the public API without confirmation
- Don't create new files without explaining why
```

This instruction file is included in every session context automatically.

### 7.2 Reference Files as Context

When starting a Copilot Chat session for code work, explicitly reference key files:

```
"Read these files first:
- [path/to/architecture.md]
- [path/to/relevant-script.sh]  
- [path/to/spec.md]
Then answer: [question]"
```

### 7.3 Controlling Copilot Output Defaults

Some Copilot CLI behaviors can be suppressed per-session or permanently.

**`Co-authored-by` trailer in commits** — Copilot CLI adds this to every commit message by default:
```
Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
```

To suppress for the **whole session**: tell Copilot at session start — *"no Co-authored-by"* — it respects this for all commits in that session.

To suppress **permanently** via VS Code settings:
```json
// settings.json
"github.copilot.chat.commitMessageGeneration.instructions": [
  { "text": "Never include Co-authored-by trailers." }
]
```

**General principle:** Copilot CLI follows instructions about its own output format just like any other instruction. You can suppress, reformat, or redirect any default behavior by stating it explicitly — either at session start or in `copilot-instructions.md`.

---

### 7.4 The `/new` vs. Continuation Decision

Start a **new session** when:
- Switching to a different component or repo
- Current session has accumulated many wrong assumptions
- More than ~30 minutes have passed since last turn
- You're starting a genuinely new task

**Continue the same session** when:
- You're iterating on the same code/script/problem
- The last response was on the right track
- You're in a tight debugging loop

---

## PART VIII — ANTI-PATTERNS (WHAT NOT TO DO)

### ❌ The Vague Continuation
```
"go on" / "proceed" / "continue"
```
Only works if Copilot was mid-task and direction is clear. Otherwise Copilot invents a direction.

### ❌ The Frustration Signal
```
"still nothing" / "that didn't work" / "you're doing it wrong again"
```
Tells Copilot it failed but gives zero new diagnostic information. Result: another guess.

### ❌ The Single-Word Pivot
```
"I change my mind. Modify service working dir instead."
```
Incomplete restatement causes compounding errors. Always restate the **full new goal**.

### ❌ The Assumption Handoff
```
"same as before but for the other service"
```
What "before" means, what "the other service" is — these must be explicit.

### ❌ The Raw Paste
```
[paste 200 lines of output with no explanation]
```
Copilot doesn't know if this output is good, bad, or expected. Always add verdict + expectation.

### ❌ Correcting Symptoms in a Loop
```
[correction 1] → [wrong fix] → [correction 2] → [still wrong] → [correction 3]
```
After two failed corrections, the problem is framing, not the answer. Restate the goal from scratch.

### ❌ The Implicit Scope
```
"commit and move the tag"
```
Which repo? Which branch? Which tag? In multi-repo projects, always be explicit.

---

## PART IX — QUICK REFERENCE CARD

### Before you type the first message:
- [ ] What is the **exact scope** (repo, file, service, stage)?
- [ ] What is the **current state** (what exists, what's broken)?
- [ ] What is the **goal** (what should be true at the end)?
- [ ] What is **off limits** (what must not change)?
- [ ] Is this a **fresh start** or a **continuation** — did I give enough context for a fresh start?

### When Copilot gets it wrong:
- [ ] Did I give it enough context to get it right? (If not — add context, don't just correct)
- [ ] Is this the **same wrong answer twice**? (If yes — reframe the goal, not the correction)
- [ ] Am I fixing a **symptom** or the **root cause**?

### Before Copilot executes anything irreversible:
- [ ] Ask: `"What assumptions are you making? List them before you proceed."`
- [ ] Use: `"Explain what you'll do step by step — I'll confirm before you run it."`

### Prompt structure checklist for complex tasks:
```
SCOPE:      [what / where]
STATE:      [current situation]  
GOAL:       [desired outcome]
CONSTRAINT: [what must not change]
FORMAT:     [how you want the answer]
```

---

## PART X — PROMPT TEMPLATES LIBRARY

### Template 1: Fresh complex task
```
I'm working on [project] in [workspace/repo path].
Current state: [brief — what exists, what's running, what stage].
Goal: [specific outcome for this session].
Constraints: [list what must not change / be avoided].
Please [analyze / implement / review / explain] [specific thing].
Don't [common mistake to avoid].
```

### Template 2: Debugging a failure
```
SYMPTOM:   [observable failure]
EXPECTED:  [what should have happened]
CONTEXT:   [what I was doing / what changed]
TRIED:     [what I already attempted]
OUTPUT:    [paste actual output]
GOAL:      [what I need from you — diagnosis / fix / explanation]
CONSTRAINT:[what must not change in any fix]
```

### Template 3: Script / code review
```
Review this [script/function/service] for problems.
Focus: [logical errors / edge cases / environment assumptions / silent failures].
Ignore: [style / formatting / refactoring suggestions].
Context: This runs on [environment] during [process/stage].
[paste code]
```

### Template 4: Continuing a multi-session project
```
Continuing work on [project].
Last session: [1-2 sentences — what was done / decided].
Current state: [what's true right now].
This session goal: [specific bounded objective].
Key constraint: [if anything changed from previous constraint].
```

### Template 5: Assumption exposure before execution
```
Before implementing this, tell me:
1. What files/repos/services you'll touch
2. What you're assuming about [X / Y / Z]
3. What could go wrong
I'll confirm before you proceed.
```

### Template 6: Direction reset after failed corrections
```
Let's reset. Ignore the last [N] messages.
Here's the actual situation:
  - Current state: [clean description]
  - What I need: [clean goal statement]  
  - Hard constraints: [what must not change]
What's the correct approach?
```

---

## PART XI — BLOOM'S TAXONOMY FOR PROMPT DESIGN

> Source: Michelle Kassorla & Eugenia Novokshanova — _"Inverted Bloom's for the Age of AI"_  
> michellekassorla.substack.com/p/inverted-blooms-for-the-age-of-ai

### 11.1 Traditional Bloom's — A Cognitive Ladder

Bloom's Taxonomy (1956, revised 2001) classifies cognitive operations from lowest to highest order:

```
▲  CREATE    — synthesize, design, produce something new         ← HOTS
│  EVALUATE  — judge, critique, assess against criteria
│  ANALYZE   — break down, distinguish, deconstruct
│  APPLY     — execute, use, implement in a new context
│  UNDERSTAND — explain, interpret, classify
▼  REMEMBER  — recall, list, recognize facts                     ← LOTS
```

HOTS = Higher Order Thinking Skills. LOTS = Lower Order Thinking Skills.

The original model says: you must Remember before you can Understand, Understand before you can Apply, and so on — building toward Create as the pinnacle.

---

### 11.2 Inverted Bloom's — What the AI Age Changed

In the AI era, the order is **reversed** in practice. With a single prompt, anyone can jump straight to **Create** — generating an essay, a script, a solution — without having gone through Remember → Understand → Apply first.

```
▲  REMEMBER  — the human internalizes, retains, can recall later  ← where real value is
│  UNDERSTAND — human makes connections, reflects on meaning
│  APPLY      — human independently acts without AI assistance
│  ANALYZE    — human breaks down AI output, understands components
│  EVALUATE   — human judges AI output using criteria they may not fully grasp
▼  CREATE     — AI generates the output from a prompt             ← where most people start
```

**The danger:** If you always start at Create (AI generates) and stop at Evaluate (you judge with AI-provided criteria), you never reach Remember — you never actually own the knowledge. You get output without understanding.

**The opportunity:** Use this inversion deliberately. Start at Create — let AI generate — then **deliberately climb back up the pyramid** through Evaluate → Analyze → Apply → Understand → Remember.

---

### 11.3 Applying Inverted Bloom's to Your LLM Prompts

Map every prompt you write to a cognitive level. Different levels require different prompt structures.

| Bloom Level | Your role | AI role | Prompt type | Example |
|-------------|-----------|---------|-------------|---------|
| **CREATE** | Requester | Generator | Open generation | `"Write a stage6 recovery script for imx8mp"` |
| **EVALUATE** | Judge (with AI criteria) | Critic | Review request | `"Review this script for errors and edge cases"` |
| **ANALYZE** | Investigator | Decomposer | Root cause / breakdown | `"Why does this fail? Break down the failure sequence"` |
| **APPLY** | Actor | Advisor | Constrained execution | `"Apply this fix — only to recovery_builder, don't touch the rest"` |
| **UNDERSTAND** | Learner | Explainer | Conceptual explanation | `"Explain why CAAM blobs become invalid after fuse burn"` |
| **REMEMBER** | Owner | (minimal) | Verification / test yourself | `"Without reading the code, what do you think stage6 does? I'll verify"` |

---

### 11.4 The Engineer's Inversion Pattern

For engineers using Copilot, the healthy interaction cycle is:

```
1. AI CREATES  →  you get a script / answer / plan
                         ↓
2. You EVALUATE →  "Is this correct? Does it match my constraints?"
   (don't use AI criteria — use YOUR domain knowledge)
                         ↓
3. You ANALYZE  →  "Why did it do X here? What assumption led to Y?"
   (interrogate the reasoning, not just the output)
                         ↓
4. You APPLY    →  run it, test it, observe real behavior
                         ↓
5. You UNDERSTAND → "Now I see why it failed. The CAAM timing assumption
                     was wrong because..."
                         ↓
6. You REMEMBER →  you can explain this to someone else without AI.
                   You own this knowledge.
```

**The trap most engineers fall into:** Staying in the Create → Evaluate → Create loop forever. AI generates, you spot a problem, AI generates again. This is fast but shallow. You accumulate output without accumulating understanding.

**Signal you're in the trap:** Your correction rate is high (you keep correcting AI output but can't articulate *why* it was wrong). You feel productive but can't explain what you built.

---

### 11.5 Prompt Structures by Bloom Level

**CREATE prompts** — when you want AI to generate:
```
"Generate a [thing] that does [function] under [constraints]."
```
Use when: you need a first draft, boilerplate, or options to evaluate.

**EVALUATE prompts** — when you want AI to critique:
```
"Review [X] against [your specific criteria — not AI's generic ones].
 Flag anything that violates [your constraints].
 Do not suggest refactoring — only identify problems."
```
Critical: supply **your own evaluation criteria**. If you let AI define what "good" looks like, you're evaluating with someone else's standards.

**ANALYZE prompts** — when you want AI to decompose:
```
"Don't fix this yet. Explain what's happening step by step.
 What assumptions does the code make about [X]?
 Where in the sequence does it break, and why?"
```
This is Analyze, not Create. Force the model into decomposition mode before solution mode.

**APPLY prompts** — when you want targeted execution:
```
"Apply [specific change] to [specific scope].
 Do not generalize. Do not improve other parts.
 Show me exactly what changes."
```

**UNDERSTAND prompts** — when you want to build YOUR understanding:
```
"Explain [concept] as if I need to teach it to someone tomorrow.
 What are the 3 things I must understand to reason about this independently?"
```
These prompts are for you, not for the output. The goal is your comprehension.

**REMEMBER prompts** — verification of your own internalization:
```
"I'm going to explain [X] and you tell me if I'm right:
 [your explanation].
 What did I miss or get wrong?"
```
This is the highest-value pattern. You generate, AI evaluates. The inversion of the usual flow.

---

### 11.6 Mapping to Your Actual Patterns

From the session analysis (`COPILOT-INTERACTION-ANALYSIS.md`):

| Your pattern | Bloom level | Diagnosis |
|---|---|---|
| "analyze this / review this" (50% of sessions) | EVALUATE | Good — but check: are you using YOUR criteria or accepting AI's? |
| "fix this / debug this" (47% of sessions) | CREATE (AI generates fix) | Risk zone — do you understand why the fix works? |
| Paste error + wait for answer | EVALUATE (surface) | Goes straight to Create for fix — skips Analyze |
| "show me this in the code" | UNDERSTAND | Good — but follow up: can you explain it without looking? |
| Correction cascades | Stuck at CREATE | You never climbed to ANALYZE — you didn't know WHY it was wrong |

**The highest-leverage change:** Before accepting any AI fix, spend 30 seconds at ANALYZE level:  
`"Before you implement the fix — explain what caused the bug and why your fix addresses the root cause."`

This one habit moves you from Create-loop to the full pyramid — and dramatically reduces correction cascades because you catch wrong-direction fixes before they're written.

---

### 11.7 Quick Reference — Bloom Verbs for Prompts

Use these verbs to anchor your prompt to the right cognitive level:

| Level | Prompt verbs |
|-------|-------------|
| **REMEMBER** | list, define, recall, identify, name, recognize |
| **UNDERSTAND** | explain, summarize, interpret, classify, describe, paraphrase |
| **APPLY** | implement, use, execute, demonstrate, apply, show |
| **ANALYZE** | break down, compare, distinguish, examine, deconstruct, trace |
| **EVALUATE** | assess, judge, justify, critique, argue, validate |
| **CREATE** | design, generate, build, construct, compose, synthesize |

**A well-designed session uses multiple levels.** A session that only uses CREATE verbs is a session where you're not learning — you're delegating.

---

## Sources & Further Reading

- **Anthropic Prompt Engineering Guide** — anthropic.com/docs/build-with-claude/prompt-engineering
- **OpenAI Prompt Engineering** — platform.openai.com/docs/guides/prompt-engineering
- **Google AI Prompting Essentials** — cloud.google.com/discover/what-is-prompt-engineering
- **GitHub Copilot Best Practices** — docs.github.com/en/copilot/using-github-copilot
- **Prompting Guide (community)** — promptingguide.ai
- **Chain-of-Thought Prompting (Wei et al., 2022)** — arxiv.org/abs/2201.11903
- **Inverted Bloom's for the Age of AI** — michellekassorla.substack.com/p/inverted-blooms-for-the-age-of-ai
- **Bloom's Taxonomy (revised)** — Anderson & Krathwohl, 2001
- _Personal session data: 322 sessions, Feb–May 2026 — see `COPILOT-INTERACTION-ANALYSIS.md`_

---

_Last updated: 2026-05-25_  
_Related files: `COPILOT-WORKFLOW-ANALYSIS.md` · `COPILOT-INTERACTION-ANALYSIS.md`_
