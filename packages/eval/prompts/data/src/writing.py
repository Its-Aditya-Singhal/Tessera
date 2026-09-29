from common import add, words, bullets, contains, not_contains, all_of

W = "writing"

add("write-001", W, "en", "vague", "write an email to my boss asking for leave")
add("write-002", W, "en", "vague", "linkedin post about my new job")
add("write-003", W, "en", "vague", "make this sound better: we are sorry for the delay in your order it will come soon")
add("write-004", W, "en", "vague", "cover letter for software engineer")
add("write-005", W, "en", "vague", "write something for my mom's birthday")
add("write-006", W, "en", "vague", "product description for a water bottle")
add("write-007", W, "en", "vague", "tweet about climate change")
add("write-008", W, "en", "vague", "reply to this: Hi, are you free to meet tomorrow to discuss the project?")
add("write-009", W, "en", "vague", "story about a dragon")

add("write-010", W, "en", "typical", "Write a polite email to a client explaining that the website launch will move from 10 October to 17 October because of a payment-gateway integration issue.",
    check=all_of(contains("17 October", "October 17", "17th October", "Oct 17", "17 Oct"), contains("payment")))
add("write-011", W, "en", "typical", "Write a short apology message to a friend for missing their wedding because my flight was cancelled.",
    check=contains("flight"))
add("write-012", W, "en", "typical", "Rewrite this paragraph to be more concise without losing any facts: 'The meeting, which was originally scheduled to take place on Monday, has now been moved to Wednesday due to the fact that several of the team members who were supposed to attend will be unavailable on Monday because of a company offsite.'",
    check=all_of(contains("Wednesday"), contains("offsite", "off-site"), words(max=40)))
add("write-013", W, "en", "typical", "Write a 4-line poem about monsoon rain in Mumbai.")
add("write-014", W, "en", "typical", "Give me 5 name ideas for a small bakery that specialises in sourdough bread.",
    check=bullets(min=5, max=6))
add("write-015", W, "en", "typical", "Write a README introduction paragraph for an open-source CLI tool called `tidy` that removes unused dependencies from JavaScript projects.",
    check=contains("tidy"))
add("write-016", W, "en", "typical", "Write a job posting for a part-time bookkeeper at a 10-person architecture firm in Pune.",
    check=all_of(contains("Pune"), contains("part-time", "part time")))
add("write-017", W, "en", "typical", "Write a message to my landlord asking them to fix a leaking kitchen tap that has been dripping for a week.",
    check=contains("tap", "faucet"))
add("write-018", W, "en", "typical", "Write the opening paragraph of a mystery novel set in a hill station during a power cut.")

add("write-019", W, "en", "well-specified", """Write a 120-150 word thank-you email from me (Priya, product manager) to the QA team after they found a critical bug two days before our release. Tone: warm but professional. Mention that the bug would have broken checkout for UPI users. No subject line, no emojis.""",
    check=all_of(words(min=100, max=175), contains("UPI"), contains("Priya")))
add("write-020", W, "en", "well-specified", """Rewrite the following sentence in plain English for a 12-year-old, in one sentence, keeping the meaning:
"Photosynthesis is the process by which chlorophyll-containing organisms convert light energy into chemical energy stored in glucose."
Output only the rewritten sentence.""",
    check=words(max=35))
add("write-021", W, "en", "well-specified", """Write exactly three taglines for a budgeting app aimed at college students in India. Each tagline must be under 8 words. Return them as a numbered list and nothing else.""",
    check=bullets(exact=3))
add("write-022", W, "en", "well-specified", """Draft a two-paragraph message declining a job offer from Acme Robotics. Paragraph 1 thanks them and declines; paragraph 2 says I'd like to stay in touch. Do not give a reason for declining. Sign off as "Rahul".""",
    check=all_of(contains("Acme"), contains("Rahul")))
add("write-023", W, "en", "well-specified", """Write a haiku (5-7-5 syllables) about a cup of filter coffee. Output only the three lines.""",
    check=words(max=20))
add("write-024", W, "en", "well-specified", """Edit this paragraph for grammar and spelling only. Do not change the wording otherwise. Return only the corrected paragraph.

"Their going to the market tomorow, but they has not decided wich vegetables to buy. Its going to rain so they should carry a umbrella.\"""",
    check=all_of(contains("They're", "They are"), contains("tomorrow"), contains("an umbrella")))
add("write-025", W, "en", "well-specified", """Write a 3-sentence product description for a stainless-steel lunch box (3 compartments, leak-proof lid, 1.2 litres, dishwasher-safe). Audience: office workers. Don't invent features that aren't listed.""",
    check=all_of(contains("1.2"), not_contains("microwave")))
add("write-026", W, "en", "well-specified", """Write a short, friendly reminder message (under 60 words) to a WhatsApp group of parents that the school picnic fee of ₹450 is due this Friday. Mention they can pay by UPI to the class teacher.""",
    check=all_of(words(max=60), contains("450"), contains("UPI"), contains("Friday")))
