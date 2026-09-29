"""Helpers shared by the dataset source files. Run build.py to regenerate prompts.jsonl."""

ITEMS = []


def add(id, category, lang, style, prompt, check=None, notes=None):
    item = {"id": id, "category": category, "lang": lang, "style": style, "prompt": prompt.strip("\n")}
    if check is not None:
        item["check"] = check
    if notes:
        item["notes"] = notes
    ITEMS.append(item)


def num(answer, tol=None):
    c = {"type": "numeric", "answer": answer}
    if tol is not None:
        c["tolerance"] = tol
    return c


def words(min=None, max=None):
    c = {"type": "wordCount"}
    if min is not None:
        c["min"] = min
    if max is not None:
        c["max"] = max
    return c


def bullets(exact=None, min=None, max=None):
    c = {"type": "bulletCount"}
    for k, v in (("exact", exact), ("min", min), ("max", max)):
        if v is not None:
            c[k] = v
    return c


def contains(*xs, case=False):
    c = {"type": "contains", "anyOf": list(xs)}
    if case:
        c["caseSensitive"] = True
    return c


def not_contains(*xs, case=False):
    c = {"type": "notContains", "noneOf": list(xs)}
    if case:
        c["caseSensitive"] = True
    return c


def regex(pattern, flags=None):
    c = {"type": "regex", "pattern": pattern}
    if flags:
        c["flags"] = flags
    return c


def json_keys(*keys):
    return {"type": "json", "requiredKeys": list(keys)}


def script(name, ratio):
    return {"type": "script", "script": name, "minRatio": ratio}


def all_of(*checks):
    return {"type": "all", "checks": list(checks)}
