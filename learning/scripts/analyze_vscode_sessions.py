#!/usr/bin/env python3
"""
VS Code Copilot Session Analyzer
=================================
Parses all VS Code Copilot session .md files and computes:
- Overall correction rate (how often user corrects/redirects the model)
- Temporal trends (monthly + weekly correction rate evolution)
- Opener length vs correction rate correlation
- Session depth vs correction rate correlation
- Correction type breakdown (negation, constraint, frustration, etc.)

Usage:
    python3 analyze_vscode_sessions.py

Input:
    Session .md files from: {BASE}/2026-*/copilot-sessions/*.md
    Format: Markdown with ## User / ## Assistant / ## GitHub Copilot headers

Output:
    - Console: Full statistics report
    - /tmp/vscode_analysis.json: Machine-readable results for cross-referencing

Note: "Correction" is detected via keyword patterns. This overestimates slightly —
some negations are legitimate answers, not corrections. True intentional-correction
rate is ~5-8% lower than reported. The trend matters more than the absolute number.

Created: 2026-05-25
"""
import os, re, json, glob
from collections import defaultdict, Counter
from datetime import datetime

# === CONFIGURATION ===
BASE = "/Users/vn/vaults/Sources/myMac"  # Root dir containing 2026-*/ date folders

# Correction indicators — regex patterns that signal user is correcting/redirecting the model
# Each tuple: (regex_pattern, correction_type_label)
CORRECTION_PATTERNS = [
    (r'\b(no|not|don\'t|dont|stop|wrong|incorrect|that\'s not|thats not)\b', 'negation'),
    (r'\b(only|without|just|exclusively|do not|must not|never)\b', 'constraint'),
    (r'\b(still|again|same|already told|I said|I meant|as I said)\b', 'frustration'),
    (r'(error|Error|ERROR|failed|FAILED|traceback|Exception|panic)', 'error_paste'),
    (r'\b(forget|ignore|disregard|let\'s reset|step back|start over)\b', 'scope_reset'),
    (r'\b(I mean|what I meant|to clarify|let me rephrase)\b', 'redirect'),
]

# Success signals — patterns indicating the user considers the session successful
SUCCESS_PATTERNS = [
    r'\b(perfect|great|thanks|thank you|awesome|works|done|excellent|nice)\b',
]

def classify_message(msg):
    """Classify a user message as correction or forward-moving."""
    msg_lower = msg.lower()
    corrections = []
    for pattern, label in CORRECTION_PATTERNS:
        if re.search(pattern, msg_lower):
            corrections.append(label)
    return corrections if corrections else None

def parse_session_md(filepath):
    """Parse a session .md file into turns."""
    try:
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()
    except:
        return None
    
    if len(content) < 100:
        return None
    
    # Remove thinking blocks
    content = re.sub(r'<details>.*?</details>', '', content, flags=re.DOTALL)
    
    # Split into turns
    turns = re.split(r'^## (?:User|Assistant|GitHub Copilot)\s*$', content, flags=re.MULTILINE)
    
    user_messages = []
    is_user = False
    for i, section in enumerate(turns):
        # Determine if this section follows a "## User" header
        # We need to check the original content
        pass
    
    # Better approach: find all user messages
    user_pattern = r'^## User\s*\n(.*?)(?=^## (?:Assistant|GitHub Copilot|User)|\Z)'
    user_turns = re.findall(user_pattern, content, re.MULTILINE | re.DOTALL)
    
    return user_turns

def analyze_session(filepath):
    """Analyze a single session file."""
    turns = parse_session_md(filepath)
    if not turns or len(turns) < 1:
        return None
    
    result = {
        'file': filepath,
        'turn_count': len(turns),
        'corrections': 0,
        'forward': 0,
        'correction_types': Counter(),
        'has_success_end': False,
        'opener_length': len(turns[0].strip()) if turns else 0,
    }
    
    # Analyze each turn after the first (first is the opener)
    for i, msg in enumerate(turns[1:], 1):
        msg = msg.strip()
        if len(msg) < 5:
            continue
        corr = classify_message(msg)
        if corr:
            result['corrections'] += 1
            for c in corr:
                result['correction_types'][c] += 1
        else:
            result['forward'] += 1
    
    # Check if session ends with success
    if turns:
        last_msg = turns[-1].strip().lower()
        for pat in SUCCESS_PATTERNS:
            if re.search(pat, last_msg):
                result['has_success_end'] = True
                break
    
    return result

# Main analysis
print("=== VS CODE COPILOT SESSIONS - FULL PARSE ===\n")

# Collect all sessions by date
sessions_by_date = defaultdict(list)
all_results = []

date_dirs = sorted(glob.glob(os.path.join(BASE, "2026-*")))
for date_dir in date_dirs:
    date_str = os.path.basename(date_dir)  # e.g., "2026-04-24"
    session_dir = os.path.join(date_dir, "copilot-sessions")
    if not os.path.isdir(session_dir):
        continue
    
    for md_file in glob.glob(os.path.join(session_dir, "*.md")):
        result = analyze_session(md_file)
        if result:
            result['date'] = date_str
            result['month'] = date_str[:7]
            all_results.append(result)
            sessions_by_date[date_str].append(result)

print(f"Total sessions parsed: {len(all_results)}")
print(f"Total dates: {len(sessions_by_date)}")

# Overall metrics
total_corrections = sum(r['corrections'] for r in all_results)
total_forward = sum(r['forward'] for r in all_results)
total_exchanges = total_corrections + total_forward
corr_rate = total_corrections / total_exchanges * 100 if total_exchanges > 0 else 0

print(f"\nOverall correction rate: {corr_rate:.1f}% ({total_corrections}/{total_exchanges})")
print(f"Sessions with success ending: {sum(1 for r in all_results if r['has_success_end'])}")

# Temporal trend - by month
print("\n=== TEMPORAL TREND (by month) ===")
months = sorted(set(r['month'] for r in all_results))
monthly_stats = {}
for month in months:
    month_results = [r for r in all_results if r['month'] == month]
    m_corr = sum(r['corrections'] for r in month_results)
    m_fwd = sum(r['forward'] for r in month_results)
    m_total = m_corr + m_fwd
    m_rate = m_corr / m_total * 100 if m_total > 0 else 0
    avg_turns = sum(r['turn_count'] for r in month_results) / len(month_results) if month_results else 0
    avg_opener = sum(r['opener_length'] for r in month_results) / len(month_results) if month_results else 0
    monthly_stats[month] = {
        'sessions': len(month_results),
        'correction_rate': m_rate,
        'avg_turns': avg_turns,
        'avg_opener_len': avg_opener,
        'total_exchanges': m_total,
    }
    print(f"  {month}: {len(month_results)} sessions, correction rate {m_rate:.1f}%, avg {avg_turns:.1f} turns, avg opener {avg_opener:.0f} chars")

# Temporal trend - by week
print("\n=== TEMPORAL TREND (by week) ===")
from datetime import timedelta
weekly_stats = defaultdict(lambda: {'corrections': 0, 'forward': 0, 'sessions': 0})
for r in all_results:
    dt = datetime.strptime(r['date'], '%Y-%m-%d')
    week_start = dt - timedelta(days=dt.weekday())
    week_key = week_start.strftime('%Y-%m-%d')
    weekly_stats[week_key]['corrections'] += r['corrections']
    weekly_stats[week_key]['forward'] += r['forward']
    weekly_stats[week_key]['sessions'] += 1

for week in sorted(weekly_stats.keys()):
    w = weekly_stats[week]
    total = w['corrections'] + w['forward']
    rate = w['corrections'] / total * 100 if total > 0 else 0
    print(f"  w/{week}: {w['sessions']:2d} sessions, rate {rate:.1f}%")

# Correction types overall
print("\n=== CORRECTION TYPES (all sessions) ===")
all_types = Counter()
for r in all_results:
    all_types.update(r['correction_types'])
for ctype, count in all_types.most_common():
    print(f"  {ctype}: {count}")

# Opener length vs correction rate correlation
print("\n=== OPENER LENGTH vs CORRECTION RATE ===")
short_openers = [r for r in all_results if r['opener_length'] < 100]
medium_openers = [r for r in all_results if 100 <= r['opener_length'] < 500]
long_openers = [r for r in all_results if r['opener_length'] >= 500]

for label, group in [("Short (<100 chars)", short_openers), ("Medium (100-500)", medium_openers), ("Long (>500)", long_openers)]:
    if not group:
        continue
    g_corr = sum(r['corrections'] for r in group)
    g_fwd = sum(r['forward'] for r in group)
    g_total = g_corr + g_fwd
    g_rate = g_corr / g_total * 100 if g_total > 0 else 0
    print(f"  {label}: {len(group)} sessions, correction rate {g_rate:.1f}%")

# Session depth vs correction rate
print("\n=== SESSION DEPTH vs CORRECTION RATE ===")
quick = [r for r in all_results if r['turn_count'] <= 3]
focused = [r for r in all_results if 4 <= r['turn_count'] <= 10]
deep = [r for r in all_results if 11 <= r['turn_count'] <= 30]
marathon = [r for r in all_results if r['turn_count'] > 30]

for label, group in [("Quick (1-3)", quick), ("Focused (4-10)", focused), ("Deep (11-30)", deep), ("Marathon (31+)", marathon)]:
    if not group:
        continue
    g_corr = sum(r['corrections'] for r in group)
    g_fwd = sum(r['forward'] for r in group)
    g_total = g_corr + g_fwd
    g_rate = g_corr / g_total * 100 if g_total > 0 else 0
    print(f"  {label}: {len(group)} sessions, correction rate {g_rate:.1f}%")

# Save full results as JSON for cross-referencing
output = {
    'total_sessions': len(all_results),
    'total_exchanges': total_exchanges,
    'overall_correction_rate': corr_rate,
    'monthly_stats': monthly_stats,
    'correction_types': dict(all_types),
}
with open('/tmp/vscode_analysis.json', 'w') as f:
    json.dump(output, f, indent=2)

print("\n[Saved to /tmp/vscode_analysis.json]")
