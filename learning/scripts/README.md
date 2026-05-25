# LLM Session Analysis Scripts

Scripts for analyzing LLM interaction patterns across multiple platforms.

## Scripts

| Script | What it does | Input | Output |
|--------|-------------|-------|--------|
| `analyze_vscode_sessions.py` | Parse VS Code Copilot sessions: correction rates, temporal trends, opener analysis | `../2026-*/copilot-sessions/*.md` | Console + `/tmp/vscode_analysis.json` |
| `analyze_chatgpt_mscopilot.py` | Parse ChatGPT + MS Copilot: topics, language, platform comparison | ChatGPT JSON export + MS Copilot daily `.md` | Console + `/tmp/multi_llm_analysis.json` |
| `analyze_wiki_git.py` | Cross-reference: wiki overlap + git commit correlation | Confluence wiki + git repos | Console + `/tmp/wiki_git_analysis.json` |

## Usage

```bash
# Run all three (no dependencies beyond Python 3 stdlib)
python3 analyze_vscode_sessions.py
python3 analyze_chatgpt_mscopilot.py
python3 analyze_wiki_git.py
```

## Paths (hardcoded — update if dirs move)

- VS Code sessions: `/Users/vn/vaults/Sources/myMac/2026-*/`
- ChatGPT export: `/Users/vn/vaults/Sources/chatgpt-sessions/conversations-*.json`
- MS Copilot: `/Users/vn/vaults/Sources/Microsoft copilot/2026/`
- Confluence wiki: `/Users/vn/vaults/Sources/Sensio-Confluence/RoomMate Development/`
- Git repos: `roomboard-linux.github`, `sensio-linux`

## Re-running

Safe to re-run at any time. Scripts are read-only — they don't modify source files.
JSON outputs go to `/tmp/` and are overwritten each run.

_Created: 2026-05-25_
