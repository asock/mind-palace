---
name: mind-palace
description: >
  A persistent knowledge capture system that stores thinking, reasoning, and responses 
  in an eternally accessible "mind palace". Use to capture important concepts, long-term 
  context, decisions, or user preferences, and search through them later via keywords, 
  semantic tags, or metadata.
---

# Mind Palace Skill

This skill allows you to capture and search your "thoughts" (data, logic, preferences, architecture notes) in a persistent, indexed SQLite + JSONL storage system.

## Usage

Use the CLI script `mind-palace.js` located in `~/.openclaw/workspace/skills/mind-palace/`.

### Capture a thought
```bash
~/.openclaw/workspace/skills/mind-palace/mind-palace.js -c "The user prefers to avoid writing boilerplate code, use concise generators."
```

### Search thoughts by keyword
```bash
~/.openclaw/workspace/skills/mind-palace/mind-palace.js -k "boilerplate"
```

### Search thoughts by semantic concept (keyword fallback)
```bash
~/.openclaw/workspace/skills/mind-palace/mind-palace.js -s "coding style preferences"
```

### Search with filters
```bash
~/.openclaw/workspace/skills/mind-palace/mind-palace.js --tag "preference" --limit 5
```

### See stats
```bash
~/.openclaw/workspace/skills/mind-palace/mind-palace.js --stats
```

## Note for the Agent
1. When you learn something new about the user or a long-running project, run a capture command.
2. Before answering a complex question about past architecture, use the search command to retrieve prior thoughts.