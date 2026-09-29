from common import add, num, words, bullets, contains, script, all_of

L = "hinglish"
ROMAN = script("latin", 0.8)  # a Hinglish answer should stay in Roman script

P_HG_CHAT = """Rohit: bhai kal ka plan kya hai?
Neha: Lonavala chalte hain, subah 6 baje nikalenge
Rohit: car kiski?
Neha: meri car, but petrol ka paisa split karenge
Karan: main 7 baje tak hi aa paunga, office ka call hai
Neha: theek hai, phir 7 baje Karan ke ghar se pick karenge
Rohit: lunch wahi dhaba jo pichli baar gaye the?"""

add("hg-001", "coding", L, "vague", "bhai python me dictionary ko value se sort kaise kare", check=contains("sorted(", "sort("))
add("hg-002", "coding", L, "typical", "Mera React app production me blank screen dikha raha hai but local pe theek chal raha hai. Kya check karu? Short me batao.")
add("hg-003", "coding", L, "well-specified", """Ek JavaScript function likho `formatINR(n)` jo number ko Indian format me convert kare, jaise 1234567 ko "12,34,567". Intl API use karo, aur explanation Hinglish me 2-3 lines me do.""",
    check=all_of(contains("en-IN"), contains("formatINR")))

add("hg-004", "writing", L, "vague", "gf ke liye sorry msg likh do", check=ROMAN)
add("hg-005", "writing", L, "typical", "Ek Instagram caption likho meri Goa trip ki photo ke liye, thoda funny, Hinglish me.", check=ROMAN)
add("hg-006", "writing", L, "typical", "Office group me message likho ki kal ki meeting 11 baje ki jagah 3 baje hogi. Hinglish me, casual tone.",
    check=all_of(ROMAN, contains("3")))
add("hg-007", "writing", L, "well-specified", """Mere dost Arjun ke liye birthday wish likho, Hinglish me, 40 words se kam. Usko cricket bahut pasand hai, toh ek cricket wala joke daalo. Emojis mat daalna.""",
    check=all_of(ROMAN, words(max=40), contains("Arjun")))

add("hg-008", "summarizing", L, "vague", "isme kya decide hua\n\n" + P_HG_CHAT, check=contains("Lonavala"))
add("hg-009", "summarizing", L, "typical", "Is group chat ka summary do, Hinglish me, 2-3 lines.\n\n" + P_HG_CHAT, check=all_of(ROMAN, contains("7")))
add("hg-010", "summarizing", L, "well-specified", "Is chat se trip ke final plan ke 3 bullet points banao (time, pickup, car). Sirf bullets, aur kuch nahi.\n\n" + P_HG_CHAT,
    check=all_of(bullets(exact=3), contains("Karan")))

add("hg-011", "reasoning", L, "vague", "250 ka 12 percent GST kitna", check=num(30))
add("hg-012", "reasoning", L, "typical", "Agar main roz 45 minute walk karu, toh ek mahine (30 din) me total kitne ghante walk karunga?", check=num(45 * 30 / 60))
add("hg-013", "reasoning", L, "typical", "4 dost ne dinner kiya, bill ₹2,360 aaya aur 10% tip dena hai. Har ek ko kitna dena padega?", check=num(2360 * 1.1 / 4))
add("hg-014", "reasoning", L, "well-specified", """Ek phone ka price ₹18,000 hai. Pehle 10% discount milta hai, phir discounted price pe 5% cashback. Final effective price kitna hua? Step by step batao aur last line me "Answer: <number>" likho.""",
    check=num(18000 * 0.9 * 0.95))

add("hg-015", "format", L, "typical", "Mujhe 5 healthy breakfast ideas do, bullet points me, Hinglish me.", check=all_of(bullets(exact=5), ROMAN))
add("hg-016", "format", L, "well-specified", """Neeche ke sentence ka sentiment batao, sirf ek word me: POSITIVE, NEGATIVE ya NEUTRAL.
"Yaar movie itni boring thi ki interval me hi neend aa gayi.\"""",
    check=all_of(words(max=2), contains("NEGATIVE")))
