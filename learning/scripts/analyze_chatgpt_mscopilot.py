#!/usr/bin/env python3
"""
ChatGPT + Microsoft Copilot Session Analyzer
=============================================
Parses ChatGPT conversation exports and MS Copilot daily session files to:
- Count conversations by month, language, topic
- Classify topics via keyword matching on titles/headers
- Compare interaction styles across platforms
- Build cross-platform usage summary

Usage:
    python3 analyze_chatgpt_mscopilot.py

Input:
    - ChatGPT: {CHATGPT_BASE}/conversations-*.json (OpenAI export format)
    - MS Copilot: {MS_BASE}/2026/MM/DD.md (daily markdown files with ## headers per thread)

Output:
    - Console: Full statistics report with cross-platform comparison table
    - /tmp/multi_llm_analysis.json: Machine-readable results

Created: 2026-05-25
"""
import os, re, json, glob
from collections import defaultdict, Counter
from datetime import datetime

# ========== CHATGPT ==========
print("=== CHATGPT SESSIONS (482 conversations) ===\n")

CHATGPT_BASE = "/Users/vn/vaults/Sources/chatgpt-sessions"
all_convos = []
for f in sorted(glob.glob(os.path.join(CHATGPT_BASE, "conversations-*.json"))):
    with open(f) as fh:
        all_convos.extend(json.load(fh))

# Filter to 2026 and sort
all_convos.sort(key=lambda x: x.get('create_time', 0))
convos_2026 = [c for c in all_convos if c.get('create_time', 0) > 1735689600]

print(f"Total conversations: {len(all_convos)}")
print(f"2026 conversations: {len(convos_2026)}")
print(f"Date range: {datetime.fromtimestamp(all_convos[0]['create_time']).date()} to {datetime.fromtimestamp(all_convos[-1]['create_time']).date()}")

# Language detection (Russian vs English)
def detect_lang(text):
    if not text:
        return 'unknown'
    cyrillic = len(re.findall(r'[а-яА-ЯёЁ]', text))
    latin = len(re.findall(r'[a-zA-Z]', text))
    if cyrillic > latin:
        return 'russian'
    return 'english'

# Analyze ChatGPT conversations
chatgpt_monthly = defaultdict(lambda: {'count': 0, 'langs': Counter(), 'avg_turns': 0, 'titles': []})
chatgpt_topics = Counter()
topic_keywords = {
    'electronics': r'(circuit|resistor|capacitor|op.?amp|LTspice|schematic|voltage|current|PCB|oscillat|bridge|wheatstone)',
    'embedded': r'(yocto|bitbake|systemd|imx8|roommate|kernel|u-boot|linux|device.?tree)',
    'python': r'(python|pip|django|flask|pandas|numpy|script\.py)',
    'automation': r'(automat|pipeline|CI|CD|github.?action|docker|cron|webhook)',
    'ai_llm': r'(LLM|GPT|Claude|copilot|prompt|model|AI|neural|token)',
    'knowledge_mgmt': r'(obsidian|notion|wiki|confluence|markdown|vault|note)',
    'networking': r'(SSH|VPN|IP|network|server|port|DNS|HTTP|API)',
    'security': r'(encrypt|crypt|HAB|fuse|secure|key|certificate|TLS|SSL)',
    'math_physics': r'(formula|equation|calcul|integral|derivative|frequency|impedance|modulus)',
    'personal': r'(visa|bank|travel|apartment|insurance|health|recipe|cook)',
}

total_turns_chatgpt = 0
for c in convos_2026:
    dt = datetime.fromtimestamp(c['create_time'])
    month = dt.strftime('%Y-%m')
    title = c.get('title', '') or ''
    
    # Count turns
    mapping = c.get('mapping', {})
    user_turns = sum(1 for v in mapping.values() 
                     if v.get('message', {}) and 
                     v['message'].get('author', {}).get('role') == 'user')
    total_turns_chatgpt += user_turns
    
    chatgpt_monthly[month]['count'] += 1
    chatgpt_monthly[month]['langs'][detect_lang(title)] += 1
    chatgpt_monthly[month]['titles'].append(title)
    
    # Topic classification
    for topic, pattern in topic_keywords.items():
        if re.search(pattern, title, re.IGNORECASE):
            chatgpt_topics[topic] += 1

print(f"\nTotal user turns (2026): {total_turns_chatgpt}")
print(f"\nMonthly breakdown:")
for month in sorted(chatgpt_monthly.keys()):
    m = chatgpt_monthly[month]
    print(f"  {month}: {m['count']} convos, langs: {dict(m['langs'])}")

print(f"\nTopic distribution (by title keyword matching):")
for topic, count in chatgpt_topics.most_common():
    print(f"  {topic}: {count}")

# Detect interaction style - sample some conversations for turn analysis
print(f"\nInteraction style (sampled from recent conversations):")
short_convos = sum(1 for c in convos_2026 if len(c.get('mapping', {})) <= 6)
medium_convos = sum(1 for c in convos_2026 if 6 < len(c.get('mapping', {})) <= 20)
long_convos = sum(1 for c in convos_2026 if len(c.get('mapping', {})) > 20)
print(f"  Short (1-2 turns): {short_convos}")
print(f"  Medium (3-8 turns): {medium_convos}")
print(f"  Long (9+ turns): {long_convos}")

# Sample first messages to understand opener style
print(f"\nRecent titles (last 30):")
for c in convos_2026[-30:]:
    dt = datetime.fromtimestamp(c['create_time']).strftime('%m-%d')
    print(f"  {dt}: {c.get('title', '?')}")

# ========== MICROSOFT COPILOT ==========
print("\n\n=== MICROSOFT COPILOT SESSIONS (116 files) ===\n")

MS_BASE = "/Users/vn/vaults/Sources/Microsoft copilot/2026"
ms_monthly = defaultdict(lambda: {'count': 0, 'topics': Counter(), 'total_sections': 0})

ms_files = sorted(glob.glob(os.path.join(MS_BASE, "*/*.md")))
print(f"Total session files: {len(ms_files)}")

ms_topics = Counter()
ms_all_sections = 0
ms_langs = Counter()

for filepath in ms_files:
    parts = filepath.split('/')
    month = f"2026-{parts[-2]}" if len(parts[-2]) == 2 else "unknown"
    
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        continue
    
    # Count sections (## headers = separate conversations in one day)
    sections = re.findall(r'^## (.+)$', content, re.MULTILINE)
    ms_all_sections += len(sections)
    ms_monthly[month]['count'] += 1
    ms_monthly[month]['total_sections'] += len(sections)
    
    # Language
    lang = detect_lang(content[:500])
    ms_langs[lang] += 1
    
    # Topics from headers
    for section in sections:
        for topic, pattern in topic_keywords.items():
            if re.search(pattern, section, re.IGNORECASE):
                ms_topics[topic] += 1

print(f"Total conversation threads: {ms_all_sections}")
print(f"Languages: {dict(ms_langs)}")

print(f"\nMonthly breakdown:")
for month in sorted(ms_monthly.keys()):
    m = ms_monthly[month]
    print(f"  {month}: {m['count']} days, {m['total_sections']} threads")

print(f"\nTopics:")
for topic, count in ms_topics.most_common(10):
    print(f"  {topic}: {count}")

# Sample recent MS Copilot content to understand interaction style
print(f"\nRecent session headers (last file):")
try:
    with open(ms_files[-1], 'r') as f:
        content = f.read()
    headers = re.findall(r'^## (.+)$', content, re.MULTILINE)
    for h in headers[:10]:
        print(f"  - {h}")
except:
    pass

# ========== CROSS-PLATFORM COMPARISON ==========
print("\n\n=== CROSS-PLATFORM COMPARISON ===\n")
print("Platform        | Period    | Sessions | Threads  | Primary Language | Primary Use")
print("VS Code Copilot | Feb-May26 | 323      | 323      | English (99%)    | Code: debug, review, implement")
print(f"ChatGPT         | 2024-2026 | {len(convos_2026):3d}(2026)| {total_turns_chatgpt:4d} turns| Russian (~70%)   | Electronics, math, personal")
print(f"MS Copilot      | Jan-May26 | {len(ms_files):3d}      | {ms_all_sections:4d}     | Russian (~80%)   | Automation, knowledge, research")

# Save
output = {
    'chatgpt': {
        'total_2026': len(convos_2026),
        'total_turns': total_turns_chatgpt,
        'topics': dict(chatgpt_topics),
        'monthly': {k: {'count': v['count']} for k, v in chatgpt_monthly.items()},
    },
    'ms_copilot': {
        'total_files': len(ms_files),
        'total_threads': ms_all_sections,
        'topics': dict(ms_topics),
    }
}
with open('/tmp/multi_llm_analysis.json', 'w') as f:
    json.dump(output, f, indent=2)

print("\n[Saved to /tmp/multi_llm_analysis.json]")
