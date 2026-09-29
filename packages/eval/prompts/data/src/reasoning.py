from common import add, num, contains

R = "reasoning"

# Answers are computed here, not typed, so they cannot drift from the question.

add("reason-001", R, "en", "vague", "15% tip on 64 dollars split 3 ways how much each",
    check=num(round(64 * 1.15 / 3, 2), tol=0.01), notes="Bill plus tip, per person.")
add("reason-002", R, "en", "vague", "how many seconds in a week", check=num(7 * 24 * 3600))
add("reason-003", R, "en", "vague", "if i save 2500 a month how long till 1 lakh (months)", check=num(100000 / 2500))
add("reason-004", R, "en", "vague", "train leaves 9:40 arrives 14:15 how long in minutes", check=num((14 * 60 + 15) - (9 * 60 + 40)))
add("reason-005", R, "en", "vague", "bat and ball 1.10 bat costs 1 more than ball price of ball", check=num(0.05, tol=0.001))
add("reason-006", R, "en", "vague", "whats 17% of 2340", check=num(round(0.17 * 2340, 2), tol=0.01))
add("reason-007", R, "en", "vague", "5 machines 5 minutes 5 widgets. 100 machines 100 widgets how long", check=num(5),
    notes="Classic trick question; answer is 5 minutes.")
add("reason-008", R, "en", "vague", "is 391 prime", check=contains("17", "not prime", "isn't prime", "is not a prime", "not a prime"),
    notes="391 = 17 x 23.")
add("reason-009", R, "en", "vague", "avg speed 60kmh there 40kmh back", check=num(48),
    notes="Harmonic mean of 60 and 40.")
add("reason-010", R, "en", "vague", "compound interest on 10000 at 8% for 3 years how much interest",
    check=num(round(10000 * 1.08 ** 3 - 10000, 2), tol=1.0), notes="Interest only, compounded annually.")

add("reason-011", R, "en", "typical", "A shop sells pens at 3 for ₹25. How much do 18 pens cost?", check=num(18 // 3 * 25))
add("reason-012", R, "en", "typical", "If a rectangle's length is 3 times its width and its perimeter is 64 cm, what is its area in square cm?",
    check=num((64 / 8) * (3 * 64 / 8)))
add("reason-013", R, "en", "typical", "A tank fills in 6 hours with pipe A and 4 hours with pipe B. How many hours to fill it with both pipes open?",
    check=num(round(1 / (1 / 6 + 1 / 4), 2), tol=0.01))
add("reason-014", R, "en", "typical", "What day of the week was 15 August 1947?", check=contains("Friday"))
add("reason-015", R, "en", "typical", "I have 3 red, 5 blue and 2 green marbles in a bag. If I draw two without replacement, what's the probability both are blue? Give it as a decimal.",
    check=num(round((5 / 10) * (4 / 9), 4), tol=0.001))
add("reason-016", R, "en", "typical", "A laptop costs ₹60,000 after a 20% discount. What was the original price?", check=num(60000 / 0.8))
add("reason-017", R, "en", "typical", "How many ways can 5 people sit in a row if two of them insist on sitting next to each other?",
    check=num(2 * 24))
add("reason-018", R, "en", "typical", "Priya is older than Ravi. Ravi is older than Sam. Sam is older than Tara. Who is the second youngest?",
    check=contains("Sam"))
add("reason-019", R, "en", "typical", "What is the sum of all integers from 1 to 200 that are divisible by 3 or 5?",
    check=num(sum(i for i in range(1, 201) if i % 3 == 0 or i % 5 == 0)))
add("reason-020", R, "en", "typical", "A car uses 6.5 litres of petrol per 100 km. Petrol costs ₹104 per litre. What does a 420 km trip cost in petrol?",
    check=num(round(420 / 100 * 6.5 * 104, 2), tol=0.5))
add("reason-021", R, "en", "typical", "If today is Wednesday, what day will it be 100 days from now?", check=contains("Friday"),
    notes="100 mod 7 = 2.")
add("reason-022", R, "en", "typical", "Convert 98.6 degrees Fahrenheit to Celsius.", check=num(37, tol=0.05))

add("reason-023", R, "en", "well-specified", """Solve step by step, then give the final answer on its own line as "Answer: <number>".
A school has 480 students. 45% are girls. One-third of the girls and one-quarter of the boys take music. How many students take music?""",
    check=num(480 * 0.45 / 3 + 480 * 0.55 / 4))
add("reason-024", R, "en", "well-specified", """Answer with a single integer and a one-sentence justification.
How many times does the digit 7 appear when you write all the integers from 1 to 100?""",
    check=num(sum(str(i).count("7") for i in range(1, 101))))
add("reason-025", R, "en", "well-specified", """A loan of ₹2,00,000 is repaid in equal monthly instalments over 12 months at 12% annual interest, compounded monthly (1% per month). Compute the monthly EMI to the nearest rupee. Show the formula you used, then "Answer: <number>".""",
    check=num(round(200000 * 0.01 * 1.01 ** 12 / (1.01 ** 12 - 1)), tol=1))
add("reason-026", R, "en", "well-specified", """Three friends split a restaurant bill. Asha pays ₹1,200, Bilal pays ₹450 and Chitra pays ₹0. They want to share the ₹1,650 total equally. Who pays whom, and how much? List each transfer. Then state the total amount of money that changes hands as "Total transferred: <number>".""",
    check=num(1200 - 550), notes="Each owes 550: Bilal pays 100 and Chitra 550 to Asha, 650 in total.")
add("reason-027", R, "en", "well-specified", """Logic puzzle. Four houses in a row are painted red, green, blue and yellow (not necessarily in that order).
- The green house is immediately to the left of the blue house.
- The red house is at one of the ends.
- The yellow house is not next to the red house.
- The red house is not the leftmost.
From left to right, what are the colours? Give the answer as four words separated by commas.""",
    check=contains("yellow, green, blue, red", "yellow,green,blue,red"),
    notes="Red is house 4; yellow can't be 3, so green-blue is 2-3 and yellow is 1.")
add("reason-028", R, "en", "well-specified", """What is the smallest positive integer that leaves remainder 1 when divided by 2, 3, 4, 5 and 6, and is divisible by 7? Explain briefly and end with "Answer: <number>".""",
    check=num(next(n for n in range(1, 10000) if all(n % d == 1 for d in (2, 3, 4, 5, 6)) and n % 7 == 0)))
add("reason-029", R, "en", "well-specified", """A clock shows 3:15. What is the smaller angle, in degrees, between the hour hand and the minute hand? Give only the number.""",
    check=num(abs((3 * 30 + 15 * 0.5) - 15 * 6)))
add("reason-030", R, "en", "well-specified", """A recipe for 4 people uses 250 g of rice. I'm cooking for 7 people and rice is sold only in 1 kg packs costing ₹90. How much rice in grams do I need, and how much will the rice cost? Give the grams as "Rice: <number> g" and the cost as "Cost: <number>".""",
    check=num(90), notes="437.5 g needed, one pack. Final number is the cost.")
