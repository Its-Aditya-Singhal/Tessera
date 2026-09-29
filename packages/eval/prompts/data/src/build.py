"""Regenerates ../prompts.jsonl from the source files in this directory.

    python3 packages/eval/prompts/data/src/build.py
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

from common import ITEMS  # noqa: E402
import coding, writing, summarizing, reasoning, formatting, tamil, hindi, hinglish  # noqa: E402,F401

ids = [i["id"] for i in ITEMS]
dupes = {i for i in ids if ids.count(i) > 1}
if dupes:
    sys.exit(f"duplicate ids: {sorted(dupes)}")

out = os.path.join(HERE, "..", "prompts.jsonl")
with open(out, "w", encoding="utf-8") as f:
    for item in ITEMS:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")
print(f"wrote {len(ITEMS)} items to {os.path.normpath(out)}")
