# copilot-instructions.md — Draft for roomboard-linux.github
# ============================================================
# This is your LEARNING COPY. Read the annotations (lines starting with #).
# When ready to deploy: copy the content below the dashed line into:
#   /Users/vn/ws/platform-development/roomboard-linux.github/.github/copilot-instructions.md
# (Create the .github/ folder if it doesn't exist.)
# ============================================================
#
# WHAT THIS FILE DOES:
#   GitHub Copilot injects this file into EVERY session automatically — you never
#   need to paste context again. It's your "standing orders" to the model.
#
# EFFECT ON YOUR METRICS:
#   Based on your session data, ~40% of your corrections happen because Copilot
#   assumes the wrong repo, path, or component. This file eliminates that by
#   pre-loading the constraints that currently live only in your head.
#
# HOW IT WORKS (technically):
#   VS Code reads .github/copilot-instructions.md at session start and prepends
#   it to the system prompt as a hidden context block. You don't see it in the
#   chat — but Copilot does, on every single turn.
#
# MAINTENANCE RULE:
#   Update this file when: the project changes phase, new constraints are established,
#   or a component is renamed/moved. Stale instructions are worse than none.
#
# ============================================================

# ---- COPY EVERYTHING BELOW THIS LINE INTO THE REAL FILE ----

# Copilot Instructions — roomboard-linux.github

## Project

RoomMate/RoomBoard platform — embedded Linux product (Variscite imx8mp SOM).
Security-hardened, OTA-upgradeable, systemd-based. Yocto kirkstone BSP.
Primary branch: `kirkstone-dev`.

## Repository Structure

| Path | Purpose |
|------|---------|
| `RoomMate/` | Application source: alarm, argus, confme-client, platform services |
| `meta-roommate/` | Yocto layer: recipes, systemd units, initrd scripts |
| `meta-roommate-arm/` | Yocto layer for ARM-specific overrides |
| `ci/` | CI/CD pipeline scripts (build, package, distupgrade) |
| `docs/` | Test reports, PR notes, specs |
| `REPORTS/` | Test report archive |
| `build_roomboard/` | Active Yocto build directory |
| `docker-yocto-env/` | Docker build environment setup |

## Key Components

- **confme** — configuration management service (`meta-roommate/recipes-roommate/confme/`)
- **argus** — sensor/camera management (`RoomMate/argus/`)
- **alarm** — alarm subsystem (`RoomMate/alarm/`)
- **distupgrade** — OTA upgrade system (`meta-roommate/recipes-roommate/distupgrade/`)
- **initrdscripts** — recovery initramfs scripts (`meta-roommate/recipes-roommate/initrdscripts/`)

## Hard Constraints (NEVER violate without explicit confirmation)

- Do NOT modify files in `meta-roommate/` without being asked — it's a submodule.
- Do NOT create new scripts in `RoomMate/` unless asked — work within existing files.
- Do NOT touch `poky_tmp/` or `build_roomboard/` — these are generated build artifacts.
- When working device-side: changes must work WITHOUT involving the host Mac.
- Stage 6 recovery scripts live in `recovery_builder` only, NOT in `remote_upgrade_learning`.

## Conventions

- Shell scripts: POSIX sh unless Python is explicitly required
- Commit format: `component: description` (e.g., `meta-roommate: fix VPN boot deadlock`)
- Error handling: always log with context (`echo "[ERROR] context: $reason"`)
- Systemd units live in `meta-roommate/recipes-roommate/roommate/`
- Device IP range: 192.168.x.x (lab) / 10.x.x.x (production VPN)

## Security Context

- HAB secure boot enabled (fuse-burned, irreversible)
- CAAM hardware encryption for rootfs blobs
- Do NOT suggest disabling security features as a debugging shortcut
- dm-crypt/LUKS on data partition

## When I give you a task

1. **State which file/component you'll touch** before making changes
2. **Ask for confirmation** before any git operation (commit, tag, rebase)
3. **Never assume the path** — if you're unsure whether something is in `RoomMate/` vs `meta-roommate/`, ask
4. **Prefer minimal changes** — don't refactor or "improve" code outside the asked scope

## Useful reference files

- Build setup: `init.sh`, `env/`
- CI pipeline: `ci/build_image.sh`, `ci/build_distroupgrade.sh`
- Test specs: `docs/SPEC-*.md`
- Test reports: `docs/REPORT-*.md`, `REPORTS/`


# ============================================================
# LEARNING NOTES — Read before deploying
# ============================================================
#
# [1] WHY the "hard constraints" section matters most:
#     Your session logs show 8+ sessions where Copilot worked in the wrong
#     repo (RoomMate vs meta-roommate). Adding explicit "NEVER" rules
#     prevents this without needing to re-state it every session.
#
# [2] WHY list paths explicitly:
#     Copilot can't see your filesystem unless you use MCP. With just this
#     file, it knows WHERE things are conceptually — reducing path guessing.
#
# [3] WHY "When I give you a task" section:
#     This is essentially pre-loading the "Assumption Exposure" pattern from
#     your best practices doc — making it automatic for every session.
#
# [4] WHAT TO ADD OVER TIME:
#     As you discover new constraints (e.g., "never use apt on device"),
#     add them here. This file compounds in value — the more accurate it is,
#     the fewer corrections you make.
#
# [5] HOW TO TEST IT'S WORKING:
#     After deploying, open a new Copilot session and ask:
#     "What do you know about this project?"
#     It should describe the RoomMate platform, the repo structure, and the
#     constraints without you having said anything yet.
#
# [6] NEXT FILES TO CREATE (in order):
#     a. .github/copilot-instructions.md (this file — DO THIS FIRST)
#     b. .vscode/mcp.json (MCP: filesystem + git servers — 30 min)
#     c. .copilot/skills/analyze-test-report.md (your batch template — 10 min)
#
# Deploy command (when ready):
#     mkdir -p /Users/vn/ws/platform-development/roomboard-linux.github/.github
#     cp <this-file-without-comments> /Users/vn/ws/platform-development/roomboard-linux.github/.github/copilot-instructions.md
# ============================================================
