#!/usr/bin/env python3
"""
Wiki Cross-Reference + Git Commit Correlation
==============================================
Two analyses in one script:

Script 3 — Wiki Cross-Reference:
    Compares VS Code Copilot session opener topics against Confluence wiki page topics.
    Identifies "retrieval failures" — sessions where you asked AI about something
    already documented in the company wiki.

Script 4 — Git Commit Correlation:
    Matches session dates against git commit dates to measure:
    - What percentage of session-days produce commits
    - Optimal sessions-per-day for commit output
    - Monthly session-to-commit efficiency ratio

Usage:
    python3 analyze_wiki_git.py

Input:
    - Wiki: {WIKI_BASE}/**/*.md (Confluence export as markdown)
    - Sessions: {SESSIONS_BASE}/2026-*/copilot-sessions/*.md
    - Git repos: roomboard-linux.github, sensio-linux

Output:
    - Console: Full statistics report
    - /tmp/wiki_git_analysis.json: Machine-readable results

Created: 2026-05-25
"""
import os, re, json, glob, subprocess
from collections import defaultdict, Counter
from datetime import datetime, timedelta

# ========== SCRIPT 3: WIKI CROSS-REFERENCE ==========
print("=== WIKI CROSS-REFERENCE ===\n")

WIKI_BASE = "/Users/vn/vaults/Sources/Sensio-Confluence/RoomMate Development"
SESSIONS_BASE = "/Users/vn/vaults/Sources/myMac"

# Build wiki topic index (extract titles and key terms from wiki pages)
wiki_topics = {}
wiki_files = glob.glob(os.path.join(WIKI_BASE, "**/*.md"), recursive=True)
print(f"Wiki pages: {len(wiki_files)}")

wiki_keywords = set()
for wf in wiki_files:
    # Get relative path as topic identifier
    rel = os.path.relpath(wf, WIKI_BASE)
    try:
        with open(wf, 'r', encoding='utf-8', errors='ignore') as f:
            content = f.read()[:2000]  # First 2000 chars for keyword extraction
    except:
        continue
    
    # Extract significant terms from filename and content headers
    terms = set()
    # From filename
    name_parts = re.findall(r'[A-Za-z]+', os.path.basename(wf).replace('.md', ''))
    terms.update(w.lower() for w in name_parts if len(w) > 3)
    # From headers
    headers = re.findall(r'^#+\s+(.+)$', content, re.MULTILINE)
    for h in headers:
        terms.update(w.lower() for w in re.findall(r'[A-Za-z]+', h) if len(w) > 3)
    
    wiki_topics[rel] = terms
    wiki_keywords.update(terms)

# Get key concepts from wiki
wiki_concepts = Counter()
for rel, terms in wiki_topics.items():
    for t in terms:
        wiki_concepts[t] += 1

# Extract session opener topics
session_openers = []
for date_dir in sorted(glob.glob(os.path.join(SESSIONS_BASE, "2026-*"))):
    session_dir = os.path.join(date_dir, "copilot-sessions")
    if not os.path.isdir(session_dir):
        continue
    for md_file in glob.glob(os.path.join(session_dir, "*.md")):
        try:
            with open(md_file, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()[:3000]
        except:
            continue
        # Get first user message
        match = re.search(r'^## User\s*\n(.+?)(?=^## )', content, re.MULTILINE | re.DOTALL)
        if match:
            opener = match.group(1).strip()[:500]
            session_openers.append({
                'file': os.path.basename(md_file),
                'date': os.path.basename(date_dir),
                'opener_words': set(w.lower() for w in re.findall(r'[A-Za-z]+', opener) if len(w) > 3),
            })

# Find sessions that asked about things documented in wiki
print(f"Session openers analyzed: {len(session_openers)}")

# Key wiki-documented concepts
wiki_key_concepts = {
    'vpn': 'Roommate Network Resources/Remote Access',
    'openvpn': 'Roommate Network Resources/Remote Access',
    'onboarding': 'Getting Started/New Employee On-boarding',
    'azure': 'Getting Started/Migrating to Azure',
    'production': 'Roommate Network Resources/Production servers',
    'confme': 'Roommate Software',
    'roomobjects': 'Roommate Software',
    'mqtt': 'Roommate Software',
    'algorithm': 'The Algorithm',
    'security': 'Product Security',
    'regulatory': 'Regulatory requirements',
    'anno': 'Anno-Tool',
    'argus': 'Argus',
    'specifications': 'Product specifications',
    'hardware': 'Hardware Platform',
    'fhir': 'VKP - FHIR R4',
}

wiki_overlap_sessions = []
for s in session_openers:
    for concept, wiki_loc in wiki_key_concepts.items():
        if concept in s['opener_words']:
            wiki_overlap_sessions.append({
                'session': s['file'],
                'date': s['date'],
                'concept': concept,
                'wiki_page': wiki_loc,
            })

print(f"\nSessions asking about wiki-documented topics: {len(wiki_overlap_sessions)}")
overlap_concepts = Counter(s['concept'] for s in wiki_overlap_sessions)
for concept, count in overlap_concepts.most_common(10):
    print(f"  '{concept}': {count} sessions (documented in: {wiki_key_concepts[concept]})")

# ========== SCRIPT 4: GIT COMMIT CORRELATION ==========
print("\n\n=== GIT COMMIT CORRELATION ===\n")

repos = [
    ("/Users/vn/ws/platform-development/roomboard-linux.github", "roomboard-linux"),
    ("/Users/vn/va/sensio-linux", "sensio-linux"),
]

all_commits = []
for repo_path, repo_name in repos:
    try:
        result = subprocess.run(
            ['git', '--no-pager', '-C', repo_path, 'log', 
             '--since=2026-02-24', '--until=2026-05-26',
             '--format=%H|%ai|%s', '--all'],
            capture_output=True, text=True, timeout=30
        )
        lines = [l for l in result.stdout.strip().split('\n') if l]
        for line in lines:
            parts = line.split('|', 2)
            if len(parts) == 3:
                commit_hash, date_str, message = parts
                commit_date = date_str[:10]
                all_commits.append({
                    'repo': repo_name,
                    'date': commit_date,
                    'message': message,
                    'hash': commit_hash[:8],
                })
    except Exception as e:
        print(f"  Error reading {repo_name}: {e}")

print(f"Total commits (Feb-May 2026): {len(all_commits)}")

# Group commits by date
commits_by_date = defaultdict(list)
for c in all_commits:
    commits_by_date[c['date']].append(c)

# Get sessions by date
sessions_by_date = defaultdict(int)
for date_dir in sorted(glob.glob(os.path.join(SESSIONS_BASE, "2026-*"))):
    date_str = os.path.basename(date_dir)
    session_dir = os.path.join(date_dir, "copilot-sessions")
    if os.path.isdir(session_dir):
        count = len(glob.glob(os.path.join(session_dir, "*.md")))
        sessions_by_date[date_str] = count

# Correlation: days with sessions vs commits
session_dates = set(d for d, c in sessions_by_date.items() if c > 0)
commit_dates = set(commits_by_date.keys())
both_dates = session_dates & commit_dates
session_only = session_dates - commit_dates
commit_only = commit_dates - session_dates

print(f"\nDays with both sessions + commits: {len(both_dates)}")
print(f"Days with sessions but no commits: {len(session_only)}")
print(f"Days with commits but no sessions: {len(commit_only)}")

# Sessions-per-day vs commits-per-day correlation
print(f"\nSession count vs commit count (daily):")
daily_pairs = []
for d in sorted(both_dates):
    s_count = sessions_by_date[d]
    c_count = len(commits_by_date[d])
    daily_pairs.append((s_count, c_count))

# Simple bucket analysis
low_session_days = [(s, c) for s, c in daily_pairs if s <= 3]
med_session_days = [(s, c) for s, c in daily_pairs if 3 < s <= 8]
high_session_days = [(s, c) for s, c in daily_pairs if s > 8]

for label, group in [("1-3 sessions/day", low_session_days), 
                     ("4-8 sessions/day", med_session_days), 
                     ("9+ sessions/day", high_session_days)]:
    if group:
        avg_commits = sum(c for _, c in group) / len(group)
        print(f"  {label}: {len(group)} days, avg {avg_commits:.1f} commits/day")

# Monthly commit breakdown
print(f"\nMonthly commit breakdown:")
commits_monthly = defaultdict(int)
for c in all_commits:
    month = c['date'][:7]
    commits_monthly[month] += 1
for month in sorted(commits_monthly.keys()):
    sessions_in_month = sum(sessions_by_date[d] for d in sessions_by_date if d.startswith(month))
    print(f"  {month}: {commits_monthly[month]} commits, {sessions_in_month} sessions")

# Commit messages matching session-driven patterns
ai_commit_patterns = [
    (r'fix:|Fix:', 'fix'),
    (r'feat:|Feature:', 'feature'),
    (r'refactor:', 'refactor'),
    (r'test|spec', 'test'),
    (r'docs|README|wiki', 'docs'),
    (r'ci|pipeline|workflow', 'ci'),
    (r'bump|update|upgrade', 'update'),
]
commit_types = Counter()
for c in all_commits:
    for pat, label in ai_commit_patterns:
        if re.search(pat, c['message'], re.IGNORECASE):
            commit_types[label] += 1
            break
    else:
        commit_types['other'] += 1

print(f"\nCommit types:")
for ctype, count in commit_types.most_common():
    print(f"  {ctype}: {count}")

# Save
output = {
    'wiki_overlap': {
        'total_sessions_with_wiki_topic': len(wiki_overlap_sessions),
        'concepts': dict(overlap_concepts),
    },
    'git': {
        'total_commits': len(all_commits),
        'days_both': len(both_dates),
        'days_session_only': len(session_only),
        'monthly': dict(commits_monthly),
        'commit_types': dict(commit_types),
    }
}
with open('/tmp/wiki_git_analysis.json', 'w') as f:
    json.dump(output, f, indent=2)

print("\n[Saved to /tmp/wiki_git_analysis.json]")
