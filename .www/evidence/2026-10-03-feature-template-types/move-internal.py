"""Move internal top-level `function` declarations that precede the last public declaration to the end of the file.
Only hoisted function declarations move; const/let/class/type stay where they are."""
import re, sys, pathlib
PUBLIC   = re.compile(r'^export (?:default )?(?:(?:async )?function\b|(?:abstract )?class\b|const \w+\s*(?::[^=]+)?=\s*(?:async\s*)?(?:\(|function\b|\w+\s*=>))')
INTERNAL = re.compile(r'^(?:async )?function\*? \w+')
COMMENT  = re.compile(r'^\s*(?://|/\*|\*)')


def regex_allowed(line, k):
    """A `/` starts a regex literal when the previous significant token cannot end an expression."""
    before = line[:k].rstrip()
    if not before: return True
    if before[-1] in "(,=:[!&|?{};+-*%<>~^": return True
    return any(before.endswith(word) and (len(before) == len(word) or not (before[-len(word) - 1].isalnum() or before[-len(word) - 1] == "_")) for word in ("return", "typeof", "case", "in", "of", "void", "yield", "await"))

def skip_regex(line, k):
    """Index just after the regex literal starting at `k` (flags included)."""
    j, in_class = k + 1, False
    while j < len(line):
        c = line[j]
        if c == "\\": j += 2; continue
        if c == "[": in_class = True
        elif c == "]": in_class = False
        elif c == "/" and not in_class:
            j += 1
            while j < len(line) and line[j].isalpha(): j += 1
            return j
        j += 1
    return len(line)

def block_end(lines, start):
    """Last line of the declaration starting at `start`: where brace depth returns to zero after opening.
    Scans across lines with a mode stack so quotes, template literals (`${}`) and comments never count."""
    stack, depth, opened = ["code"], 0, False
    for j in range(start, len(lines)):
        line, k = lines[j], 0
        while k < len(line):
            mode, c = stack[-1], line[k]
            if mode == "block-comment":
                if line.startswith("*/", k): stack.pop(); k += 2; continue
            elif mode in ("'", '"'):
                if c == "\\": k += 2; continue
                if c == mode: stack.pop()
            elif mode == "`":
                if c == "\\": k += 2; continue
                if c == "`": stack.pop()
                elif line.startswith("${", k): stack.append("expr"); k += 2; continue
            else:  # code or template expression
                if line.startswith("//", k): break
                if line.startswith("/*", k): stack.append("block-comment"); k += 2; continue
                if c == "/" and regex_allowed(line, k):
                    k = skip_regex(line, k); continue
                if c in "'\"`": stack.append(c)
                elif c == "{": depth += 1; opened = True; stack.append("brace")
                elif c == "}":
                    top = stack.pop()
                    if top == "brace": depth -= 1
            k += 1
        if stack[-1] in ("'", '"'): stack.pop()  # unterminated single-line strings end at newline
        if opened and depth == 0 and stack == ["code"]: return j
    raise SystemExit(f"unbalanced block at line {start + 1}")

for name in sys.argv[1:]:
    p = pathlib.Path(name); lines = p.read_text().split("\n")
    publics = [i for i, l in enumerate(lines) if PUBLIC.match(l)]
    first_public = publics[-1] if publics else None  # last public: internal functions between publics move too
    if first_public is None: print(name, "no public"); continue
    blocks, i = [], 0
    while i < first_public:
        if INTERNAL.match(lines[i]):
            start = i
            while start > 0 and COMMENT.match(lines[start - 1]): start -= 1
            end = block_end(lines, i)
            blocks.append((start, end)); i = end + 1
        else: i += 1
    if not blocks: print(name, "nothing"); continue
    moved = [lines[s:e + 1] for s, e in blocks]
    keep = []; skip = set()
    for s, e in blocks: skip.update(range(s, e + 1))
    for idx, l in enumerate(lines):
        if idx in skip: continue
        if l == "" and keep and keep[-1] == "" : continue
        keep.append(l)
    while keep and keep[-1] == "": keep.pop()
    # blank lines between moved blocks follow the original grouping: one-liners stay packed, multi-line get a blank
    out = keep + [""]
    for b, block in enumerate(moved):
        if b and (len(block) > 1 or len(moved[b - 1]) > 1): out.append("")
        out.extend(block)
    if sorted(l for l in lines if l.strip()) != sorted(l for l in out if l.strip()):
        raise SystemExit(f"{name}: not a pure move — aborting")
    p.write_text("\n".join(out) + "\n")
    print(name, "moved", len(blocks))
