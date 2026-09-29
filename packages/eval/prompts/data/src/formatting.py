from common import add, words, bullets, contains, not_contains, regex, json_keys, all_of

F = "format"

add("fmt-001", F, "en", "vague", "json for a user with name email age", check=json_keys("name", "email", "age"),
    notes="Passes only if the whole answer is JSON (optionally fenced).")
add("fmt-002", F, "en", "vague", "3 tips for sleep", check=bullets(exact=3))
add("fmt-003", F, "en", "vague", "one word for very happy", check=words(max=3))
add("fmt-004", F, "en", "vague", "yes or no is the earth round", check=all_of(words(max=5), contains("yes")))
add("fmt-005", F, "en", "vague", "csv of 3 fruits and their colors",
    check=regex(r"^\s*\w+\s*,\s*\w+\s*$", "m"))
add("fmt-006", F, "en", "vague", "table of planets and moons count", check=contains("|"))

add("fmt-007", F, "en", "typical", "List the 7 days of the week in French, one per line, with no numbering or bullets.",
    check=all_of(contains("lundi"), contains("dimanche"), bullets(max=0)))
add("fmt-008", F, "en", "typical", "Give me a JSON array of the first five prime numbers.",
    check=regex(r"\[\s*2\s*,\s*3\s*,\s*5\s*,\s*7\s*,\s*11\s*\]"))
add("fmt-009", F, "en", "typical", "Describe the colour blue in exactly 10 words.", check=words(min=10, max=10))
add("fmt-010", F, "en", "typical", "Answer in one word: what is the capital of Australia?", check=all_of(words(max=2), contains("Canberra")))
add("fmt-011", F, "en", "typical", "Write the ISO 8601 date for the 5th of March 2026 and nothing else.", check=regex(r"^\s*`?2026-03-05`?\s*$"))
add("fmt-012", F, "en", "typical", "Give me 4 bullet points on why unit tests are useful.", check=bullets(exact=4))
add("fmt-013", F, "en", "typical", "Write a sentence about cats that does not use the letter 'e'.",
    check=regex(r"^[^eE]*$"), notes="Hard constraint; small models often fail it.")

add("fmt-014", F, "en", "well-specified", """Return a JSON object (no prose, no code fence) describing this book with keys "title", "author", "year" and "genres" (an array of strings):
"The Guide" by R. K. Narayan, published in 1958, a novel of comedy and drama.""",
    check=all_of(json_keys("title", "author", "year", "genres"), contains("1958")))
add("fmt-015", F, "en", "well-specified", """Classify each review as POSITIVE, NEGATIVE or MIXED. Output exactly three lines in the form "<number>: <LABEL>" and nothing else.
1. Delivery was fast and the phone works great.
2. Screen cracked in a week, support never replied.
3. Great camera, but the battery barely lasts a day.""",
    check=all_of(regex(r"^\s*1:\s*POSITIVE\s*$", "m"), regex(r"^\s*2:\s*NEGATIVE\s*$", "m"), regex(r"^\s*3:\s*MIXED\s*$", "m")))
add("fmt-016", F, "en", "well-specified", """Extract every email address from the text below and return them as a JSON array of strings, in order of appearance, with no other text.
"Contact sales@example.com for pricing, or write to Ravi (ravi.k@example.org). Bounced mail goes to noreply@example.net.\"""",
    check=regex(r'\[\s*"sales@example\.com"\s*,\s*"ravi\.k@example\.org"\s*,\s*"noreply@example\.net"\s*\]'))
add("fmt-017", F, "en", "well-specified", """Write a limerick (5 lines, AABBA rhyme) about a lazy cat. Output only the five lines, no title.""",
    check=regex(r"^(?:[^\n]+\n){4}[^\n]+\s*$"))
add("fmt-018", F, "en", "well-specified", """Answer in fewer than 30 words and do not use any bullet points: what is the main benefit of version control?""",
    check=all_of(words(max=29), bullets(max=0)))
add("fmt-019", F, "en", "well-specified", """Convert this list to a Markdown table with columns City | Population (millions). Sort by population, largest first. Output only the table.
Chennai 11.9, Mumbai 21.3, Kolkata 15.3, Bengaluru 13.6""",
    check=regex(r"Mumbai[\s\S]*Kolkata[\s\S]*Bengaluru[\s\S]*Chennai"))
add("fmt-020", F, "en", "well-specified", """Give a YAML snippet (no code fence, no explanation) with keys name: "tessera", version: "0.1.0" and a list "sites" containing chatgpt, claude and gemini.""",
    check=all_of(regex(r"^name:\s*\"?tessera\"?\s*$", "m"), regex(r"^sites:\s*$", "m"), not_contains("```")))
