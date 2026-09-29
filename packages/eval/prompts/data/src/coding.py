from common import add, contains, regex, all_of, not_contains

C = "coding"

# --- vague: the kind of one-liners people actually type -----------------------
add("code-001", C, "en", "vague", "fix my code it doesnt work\n\ndef avg(xs):\n    return sum(xs) / len(xs)\n\nprint(avg([]))",
    check=contains("ZeroDivisionError", "empty", "len(xs) == 0", "if not xs"),
    notes="Crashes on an empty list; a good answer handles that case.")
add("code-002", C, "en", "vague", "regex for email")
add("code-003", C, "en", "vague", "how to reverse a string in js")
add("code-004", C, "en", "vague", "sql to get top customers")
add("code-005", C, "en", "vague", "make this faster\n\nresult = []\nfor x in data:\n    if x not in result:\n        result.append(x)",
    check=contains("set(", "dict.fromkeys", "seen"),
    notes="Quadratic de-duplication; expected fix uses a set or dict.fromkeys.")
add("code-006", C, "en", "vague", "python read csv")
add("code-007", C, "en", "vague", "whats wrong\n\nconst total = items.map(i => i.price).reduce((a, b) => a + b)",
    check=contains("initial", "empty array", ", 0)"),
    notes="reduce with no initial value throws on an empty array.")
add("code-008", C, "en", "vague", "git undo last commit")
add("code-009", C, "en", "vague", "dockerfile for node app")
add("code-010", C, "en", "vague", "explain promises")

# --- typical: a real request with some context --------------------------------
add("code-011", C, "en", "typical", "Write a Python function that checks whether a string is a palindrome, ignoring case and non-alphanumeric characters.",
    check=all_of(regex(r"def\s+\w+\s*\("), contains("isalnum", "re.sub", "[^a-z0-9]", "[^A-Za-z0-9]")))
add("code-012", C, "en", "typical", "Write a TypeScript function `chunk<T>(arr: T[], size: number): T[][]` that splits an array into chunks of the given size.",
    check=regex(r"function\s+chunk|const\s+chunk"))
add("code-013", C, "en", "typical", "My React component re-renders on every keystroke and the whole list flickers. The list is rendered with items.map((item, i) => <Row key={i} ... />). What's likely going on?",
    check=contains("key"))
add("code-014", C, "en", "typical", "How do I make an HTTP GET request with a 5 second timeout in Node.js without any libraries?",
    check=contains("AbortSignal.timeout", "AbortController", "setTimeout", "timeout"))
add("code-015", C, "en", "typical", "Write a bash one-liner that finds the 10 largest files under the current directory.",
    check=contains("du", "find", "sort", "ls -S"))
add("code-016", C, "en", "typical", "In Postgres, how do I find duplicate rows in a table `users` based on the `email` column?",
    check=all_of(contains("GROUP BY", case=False), contains("HAVING", case=False)))
add("code-017", C, "en", "typical", "Explain the difference between `==` and `===` in JavaScript with two short examples.")
add("code-018", C, "en", "typical", "Write a Python generator that yields the Fibonacci sequence forever.",
    check=contains("yield"))
add("code-019", C, "en", "typical", "I get 'TypeError: Cannot read properties of undefined (reading 'map')' in my React app when the page first loads. The data comes from a fetch in useEffect. How do I fix it?",
    check=contains("initial", "useState([])", "optional chaining", "?.", "undefined"))
add("code-020", C, "en", "typical", "Convert this callback code to async/await:\n\nfs.readFile('a.txt', 'utf8', (err, data) => {\n  if (err) return console.error(err);\n  console.log(data.length);\n});",
    check=all_of(contains("await"), contains("try", "catch")))
add("code-021", C, "en", "typical", "Write a unit test with Vitest for a function `slugify(s: string): string` that lowercases, trims, and replaces runs of non-alphanumerics with a single dash.",
    check=all_of(contains("expect("), contains("vitest")))
add("code-022", C, "en", "typical", "What is the time complexity of binary search and why?",
    check=contains("log n", "log(n)", "O(log", "logarithmic"))

# --- well-specified: already good prompts (the gate should leave these alone) --
add("code-023", C, "en", "well-specified", """Write a Python 3 function `merge_intervals(intervals: list[tuple[int, int]]) -> list[tuple[int, int]]` that merges overlapping closed intervals.
Requirements:
- Input may be unsorted and may be empty.
- Touching intervals like (1, 2) and (2, 3) should merge into (1, 3).
- Return the result sorted by start.
- Include 3 doctest examples.
Output only the code in one ```python block.""",
    check=all_of(regex(r"def\s+merge_intervals\s*\("), contains(">>>"), contains("```python")))
add("code-024", C, "en", "well-specified", """In TypeScript (strict mode), write a `debounce` function with this signature:

function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): ((...args: A) => void) & { cancel(): void }

It should call `fn` with the latest arguments after `ms` milliseconds without new calls, and `cancel()` should drop any pending call. No dependencies. Add a short usage example after the code.""",
    check=all_of(regex(r"function\s+debounce"), contains("clearTimeout"), contains("cancel")))
add("code-025", C, "en", "well-specified", """Review this Go function for bugs. List each bug with the line it is on and a one-line fix. Do not rewrite the whole function.

```go
func sumPositive(nums []int) int {
    var total int
    for i := 0; i <= len(nums); i++ {
        if nums[i] > 0 {
            total += nums[i]
        }
    }
    return total
}
```""",
    check=contains("<= len", "i < len", "out of range", "off-by-one", "off by one"))
add("code-026", C, "en", "well-specified", """Write a SQL query (PostgreSQL) against these tables:
orders(id, customer_id, created_at timestamptz, total_cents int)
customers(id, name)
Return each customer's name and their total spend in rupees for calendar year 2025, highest first, only customers who spent more than 10,000 rupees. total_cents is in paise.""",
    check=all_of(contains("JOIN", case=False), contains("GROUP BY", case=False), contains("HAVING", case=False), contains("100")))
add("code-027", C, "en", "well-specified", """Explain what this regular expression matches, part by part, then give two strings that match and two that don't:

^(?=.*[A-Z])(?=.*\\d)[A-Za-z\\d]{8,}$""",
    check=contains("lookahead", "look-ahead", "at least one"))
add("code-028", C, "en", "well-specified", """Write a Python function `parse_duration(s: str) -> int` that converts strings like "1h30m", "45s", "2h", "1h5m10s" into total seconds. Raise ValueError on anything else, including an empty string. Keep it under 20 lines and use the `re` module.""",
    check=all_of(regex(r"def\s+parse_duration"), contains("ValueError"), contains("re.")))
add("code-029", C, "en", "well-specified", """I'm writing a Chrome extension (Manifest V3). My content script needs to send a message to the service worker and wait for a response. Show the minimal code for both sides using chrome.runtime.sendMessage and chrome.runtime.onMessage, including how to respond asynchronously.""",
    check=all_of(contains("sendMessage"), contains("onMessage"), contains("return true", "sendResponse")))
add("code-030", C, "en", "well-specified", """Write a Rust function `fn word_freq(text: &str) -> Vec<(String, usize)>` that counts case-insensitive word frequencies (words are runs of ASCII letters) and returns them sorted by count descending, then alphabetically. Use only the standard library.""",
    check=all_of(contains("HashMap", "BTreeMap"), contains("sort")))
