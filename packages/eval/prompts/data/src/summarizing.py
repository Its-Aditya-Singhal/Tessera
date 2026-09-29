from common import add, words, bullets, contains, all_of

S = "summarizing"

# Source passages are fictional and written for this dataset.
P_LIBRARY = """The Kothrud public library will close for renovation from 1 November to 15 January. During the closure, members can borrow books from the Aundh branch, which will extend its hours to 8 pm on weekdays. Late fees will be waived for any book due during the closure period. The renovated library will add a children's reading room, twelve new computer terminals, and a ramp at the main entrance. The municipal corporation has budgeted 2.4 crore rupees for the work. Members with questions can email the head librarian, Ms. Deshpande."""

P_STANDUP = """Anil: Finished the login page redesign, it's in review. Blocked on the icon set from design.
Meera: Still debugging the payment timeout. It only happens on Jio networks, I think it's the 10s gateway timeout. Will try raising it to 20s today.
Farhan: Wrote the migration for the new orders table. Needs someone to review before Thursday's deploy.
Anil: I can review Farhan's migration after lunch.
Meera: Also, the staging database ran out of disk yesterday, I cleared old logs but we need an alert for this."""

P_RESEARCH = """A six-month study of 240 small farms in Tamil Nadu compared drip irrigation with traditional flood irrigation for banana cultivation. Farms using drip irrigation used 38% less water and reported yields 12% higher on average. However, the upfront cost of installing drip systems, around 1.1 lakh rupees per acre, was the main barrier to adoption; only 9% of farmers without subsidies installed the systems, compared with 47% of farmers who received a government subsidy covering half the cost. The authors note the study period included an unusually dry monsoon, which may have exaggerated the water savings."""

P_INCIDENT = """At 14:05 UTC on 3 March, a configuration change to the rate limiter was deployed to all regions at once instead of region by region. The new config set the per-user limit to 10 requests per minute instead of 10 per second. From 14:07, about 60% of API requests returned HTTP 429. On-call engineers were paged at 14:09 and rolled back the change at 14:31. Error rates returned to normal by 14:34. No data was lost. Follow-ups: require staged rollouts for config changes, add a unit check that rejects rate limits below 5 per second, and add an alert on 429 rates above 5%."""

P_REVIEW = """I bought this pressure cooker two months ago. Cooking is fast and the steel feels solid, and the whistle is loud enough to hear from the next room. But the gasket started leaking steam after about six weeks, and the handle gets hot near the lid. Customer service replaced the gasket for free within four days, which I appreciated. For the price (₹2,899) it's decent, but I'd check the gasket regularly."""

P_POLICY = """Employees may work remotely up to three days per week, subject to manager approval. Remote days must be recorded in the HR portal by Monday of the relevant week. Employees in customer-facing roles must be in the office on the first working day of each month for the monthly review. Equipment for home offices, up to 15,000 rupees per employee per year, can be reimbursed with receipts. This policy does not apply to employees in their probation period."""

P_ARTICLE = """India's first solar-powered ferry service began operating in Kerala in 2017, connecting Vaikom and Thavanakkadavu across Vembanad Lake. The 75-seat boat runs entirely on energy from panels on its roof, with batteries that allow it to operate for a few hours without sunlight. Operators say it saves about 30,000 litres of diesel each year compared with a conventional ferry on the same route. The success of the pilot led the state water transport department to order several more solar vessels, and other states have since studied the design."""

add("sum-001", S, "en", "vague", "summarize\n\n" + P_LIBRARY)
add("sum-002", S, "en", "vague", "tldr\n\n" + P_STANDUP)
add("sum-003", S, "en", "vague", "summary pls\n\n" + P_RESEARCH)
add("sum-004", S, "en", "vague", "what happened here\n\n" + P_INCIDENT)
add("sum-005", S, "en", "vague", "is this good or not\n\n" + P_REVIEW)
add("sum-006", S, "en", "vague", "short version\n\n" + P_POLICY)
add("sum-007", S, "en", "vague", "sum up\n\n" + P_ARTICLE)

add("sum-008", S, "en", "typical", "Summarize this notice in two sentences.\n\n" + P_LIBRARY,
    check=all_of(contains("Aundh"), words(max=70)))
add("sum-009", S, "en", "typical", "List the action items from this standup and who owns each.\n\n" + P_STANDUP,
    check=all_of(contains("Farhan"), contains("alert")))
add("sum-010", S, "en", "typical", "Summarize the key findings of this study, including any caveats.\n\n" + P_RESEARCH,
    check=all_of(contains("38"), contains("monsoon", "dry")))
add("sum-011", S, "en", "typical", "Write a short incident summary for non-technical stakeholders.\n\n" + P_INCIDENT,
    check=contains("no data was lost", "no data loss", "data was not lost", "without data loss", "no data lost"))
add("sum-012", S, "en", "typical", "Summarize the pros and cons in this review.\n\n" + P_REVIEW,
    check=contains("gasket"))
add("sum-013", S, "en", "typical", "What are the main rules in this policy?\n\n" + P_POLICY,
    check=contains("three days", "3 days"))
add("sum-014", S, "en", "typical", "Give me the gist of this article in one paragraph.\n\n" + P_ARTICLE,
    check=contains("Vaikom", "Vembanad", "Kerala"))

add("sum-015", S, "en", "well-specified", "Summarize the notice below in exactly 3 bullet points for library members. Include the closure dates and where to borrow books meanwhile. No other text.\n\n" + P_LIBRARY,
    check=all_of(bullets(exact=3), contains("Aundh"), contains("15 January", "January 15", "Jan 15", "15 Jan")))
add("sum-016", S, "en", "well-specified", "From the standup notes below, produce a table with columns Person | Done | Next | Blocker. Use '-' where there is nothing. Output only the Markdown table.\n\n" + P_STANDUP,
    check=all_of(contains("| Person"), contains("Meera")))
add("sum-017", S, "en", "well-specified", "Summarize this study in under 60 words for a farmer's newsletter. Keep the numbers exact and mention the subsidy finding.\n\n" + P_RESEARCH,
    check=all_of(words(max=60), contains("47"), contains("subsid")))
add("sum-018", S, "en", "well-specified", "Write a 3-line incident summary: line 1 what broke, line 2 impact and duration, line 3 the follow-ups. Use times in UTC as given.\n\n" + P_INCIDENT,
    check=all_of(contains("14:"), contains("429", "rate limit")))
add("sum-019", S, "en", "well-specified", "Summarize this review in one sentence of at most 25 words, then give a verdict of 'Recommend', 'Recommend with caveats', or 'Don't recommend'.\n\n" + P_REVIEW,
    check=contains("Recommend with caveats", "Recommend", "Don't recommend"))
add("sum-020", S, "en", "well-specified", "Summarize this policy as a checklist for a new (post-probation) customer-facing employee. At most 5 bullet points.\n\n" + P_POLICY,
    check=all_of(bullets(min=2, max=5), contains("first working day")))
add("sum-021", S, "en", "well-specified", "Summarize the article below in 2 sentences. Do not add any facts that are not in the text.\n\n" + P_ARTICLE,
    check=all_of(contains("2017"), words(max=70)))
add("sum-022", S, "en", "typical", "Explain to a new team member what caused this outage and what we are changing so it doesn't happen again.\n\n" + P_INCIDENT,
    check=contains("staged", "region by region", "gradual"))
