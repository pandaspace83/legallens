# Golden set v1

37 questions on smith_msa_v3.pdf, exhibit_b_invoices.pdf, email_from_acme_counsel.eml, email_from_smith_client.eml; bge-m3 + bge-reranker-v2-m3; rewrite model llama3.2:3b.

| Model | Correct | Right document cited | All citations verified | Correct 'not found' | Invented answers | Avg per question |
|---|---|---|---|---|---|---|
| qwen2.5:7b-instruct | 27/27 | 26/27 | 27/27 | 10/10 | 0 | 10.0 s |

## Per question

| Model | Question | Result | State | Citations | Answer (start) |
|---|---|---|---|---|---|
| qwen2.5:7b-instruct | How much notice is needed to terminate for convenience? | ok | found | 1 | "To terminate for convenience, sixty (60) days' written notice is needed. [1]\n\n“Either part" |
| qwen2.5:7b-instruct | What interest applies to late payments? | ok | found | 1 | 'Late payments accrue interest at one percent (1%) per month. [1] "Late amounts accrue inte' |
| qwen2.5:7b-instruct | What is the cap on each party's liability? | ok | found | 1 | "Each party's total liability under this Agreement is capped at the fees paid in the twelve" |
| qwen2.5:7b-instruct | What is the monthly fee for warehousing? | ok | found | 1 | 'The monthly fee for warehousing is $8,500 [1]. "Warehousing $8,500 Monthly in advance" [1]' |
| qwen2.5:7b-instruct | How much is the freight brokerage fee? | ok | found | 1 | 'The freight brokerage fee is $12,000 monthly in arrears. [1] "Freight brokerage $12,000 Mo' |
| qwen2.5:7b-instruct | What is the charge for expedited handling? | ok | found | 1 | 'The charge for expedited handling is $450 per load [1].' |
| qwen2.5:7b-instruct | How must a termination notice be delivered? | ok | found | 1 | 'Notice must be delivered by courier or certified mail to the address in Schedule 2 [1]' |
| qwen2.5:7b-instruct | How long does a party have to cure a material breach? | ok | found | 1 | 'A party has thirty (30) days to cure a material breach before the other party can terminat' |
| qwen2.5:7b-instruct | Within how many days must Confidential Information be returned? | ok | found | 1 | "Each party shall return or destroy the other party's Confidential Information within ten (" |
| qwen2.5:7b-instruct | How long does the agreement last? | ok | found | 1 | 'The agreement lasts for three (3) years from the Effective Date unless terminated earlier.' |
| qwen2.5:7b-instruct | When did the agreement take effect? | ok | partial | 1 | 'The agreement took effect on March 1, 2025. [1] "1.1 \'Effective Date\' means March 1, 2025.' |
| qwen2.5:7b-instruct | Can we end the agreement early? | ok | found | 1 | "Yes, either party can terminate the agreement early by giving sixty (60) days' written not" |
| qwen2.5:7b-instruct | What happens if Acme pays late? | ok | found | 1 | 'If Acme pays late, interest accrues at one percent (1%) per month on the late amounts [1].' |
| qwen2.5:7b-instruct | Where should notices to Smith be sent? | ok | found | 3 | 'From your documents:\n\n- smith_msa_v3, p. 1, 4.3: “Either party may terminate on thirty (30' |
| qwen2.5:7b-instruct | Is either side liable for consequential damages? | ok | found | 1 | 'Neither party is liable for indirect or consequential damages. [1] "7.1 Neither party is l' |
| qwen2.5:7b-instruct | How many days does Acme have to pay an invoice? | ok | found | 1 | 'Acme has thirty (30) days from receipt of an invoice to pay it. [1] "Acme shall pay each i' |
| qwen2.5:7b-instruct | What is the total unpaid amount on the invoices? | ok | found | 1 | 'The total unpaid amount on the invoices is $48,500.\n\n[1] "Total unpaid as of September 1, ' |
| qwen2.5:7b-instruct | Which invoices are unpaid? | ok | found | 1 | 'Unpaid invoices are INV-2077 and INV-2103. [1]' |
| qwen2.5:7b-instruct | How much was invoice INV-2103 for? | ok | found | 1 | 'Invoice INV-2103 was for $24,500 [1].' |
| qwen2.5:7b-instruct | Which invoice has been paid? | ok | found | 1 | 'INV-2041 has been paid. [1]' |
| qwen2.5:7b-instruct | Why is Acme withholding payment of INV-2077? | ok | found | 1 | 'Payment of invoice INV-2077 is withheld pending resolution of the late delivery dispute [1' |
| qwen2.5:7b-instruct | What settlement amount did Acme's counsel propose, and by when? | ok | found | 1 | "Acme's counsel proposed a settlement of $40,000, which was to be paid by October 15, 2026 " |
| qwen2.5:7b-instruct | Who sent the settlement email? | ok | found | 1 | 'The settlement email was sent by Dana Whitfield [1]. "From (sent by): Dana Whitfield <dwhi' |
| qwen2.5:7b-instruct | Who sent the email about the delivery logs? | ok | found | 1 | 'The email about the delivery logs was sent by Priya Raman [1]. "From (sent by): Priya Rama' |
| qwen2.5:7b-instruct | On what dates did Acme sign for the July deliveries? | ok | found | 1 | 'Acme signed for the July deliveries on July 9 and July 23. [1] "Acme\'s receiving clerk sig' |
| qwen2.5:7b-instruct | When did the July deliveries leave the Oakland warehouse? | ok | found | 1 | 'The July deliveries left the Oakland warehouse on July 8 and July 22. [1] "Our dispatch lo' |
| qwen2.5:7b-instruct | What do the settlement terms say about claims? | MISS | found | 1 | 'The settlement terms state that each party releases all claims under the Master Services A' |
| qwen2.5:7b-instruct | What law governs this agreement? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: law, governs, ' |
| qwen2.5:7b-instruct | What is the recipe for blueberry pancakes? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: recipe, bluebe' |
| qwen2.5:7b-instruct | Who is the chief executive of Acme Corp? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: chief, executi' |
| qwen2.5:7b-instruct | Is there an arbitration clause? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: arbitration, c' |
| qwen2.5:7b-instruct | What insurance must Smith carry? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: insurance, mus' |
| qwen2.5:7b-instruct | What is the warranty period for the services? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: warranty, peri' |
| qwen2.5:7b-instruct | How many employees does Smith Logistics have? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: many, employee' |
| qwen2.5:7b-instruct | Does the agreement include a non-compete? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: agreement, inc' |
| qwen2.5:7b-instruct | What is the capital of France? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: capital, franc' |
| qwen2.5:7b-instruct | What is the weather forecast for Tokyo tomorrow? | ok | not_found | 0 | 'Not found in your documents. I searched all 5 documents in this matter for: weather, forec' |
