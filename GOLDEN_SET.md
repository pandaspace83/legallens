# Golden set v1

34 questions on smith_msa_v3.pdf, exhibit_b_invoices.pdf, email_from_acme_counsel.eml; bge-m3 + bge-reranker-v2-m3; rewrite model llama3.2:3b.

| Model | Correct | Right document cited | All citations verified | Correct 'not found' | Invented answers | Avg per question |
|---|---|---|---|---|---|---|
| qwen2.5:7b-instruct | 23/24 | 22/24 | 20/24 | 10/10 | 0 | 23.2 s |
| qwen2.5:14b-instruct | 23/24 | 22/24 | 21/24 | 10/10 | 0 | 42.5 s |

## Per question

| Model | Question | Result | State | Citations | Answer (start) |
|---|---|---|---|---|---|
| qwen2.5:7b-instruct | How much notice is needed to terminate for convenience? | ok | partial | 1 | '[1] "Either party may terminate this Agreement on sixty (60) days\' written notice to the o' |
| qwen2.5:7b-instruct | What interest applies to late payments? | ok | found | 1 | 'Late amounts accrue interest at one percent (1%) per month. [1]' |
| qwen2.5:7b-instruct | What is the cap on each party's liability? | ok | found | 1 | "The cap on each party's liability is the fees paid in the twelve (12) months before the cl" |
| qwen2.5:7b-instruct | What is the monthly fee for warehousing? | ok | found | 1 | 'The monthly fee for warehousing is $8,500 [1]. "Warehousing $8,500 Monthly in advance" [1]' |
| qwen2.5:7b-instruct | How much is the freight brokerage fee? | ok | found | 1 | 'The freight brokerage fee is $12,000 per month. [1] "Freight brokerage $12,000 Monthly in ' |
| qwen2.5:7b-instruct | What is the charge for expedited handling? | ok | found | 1 | 'The charge for expedited handling is $450 per load [1]. "Expedited handling $450 per load ' |
| qwen2.5:7b-instruct | How must a termination notice be delivered? | ok | partial | 1 | 'Notice must be delivered by courier or certified mail to the address in Schedule 2, and: “' |
| qwen2.5:7b-instruct | How long does a party have to cure a material breach? | ok | found | 1 | '[1] "Acme shall pay each invoice within thirty (30) days of receipt. Late amounts accrue i' |
| qwen2.5:7b-instruct | Within how many days must Confidential Information be returned? | ok | found | 1 | "Each party shall return or destroy the other party's Confidential Information within ten (" |
| qwen2.5:7b-instruct | How long does the agreement last? | ok | found | 1 | 'The agreement lasts for three (3) years from the Effective Date unless terminated earlier.' |
| qwen2.5:7b-instruct | When did the agreement take effect? | ok | found | 1 | 'The agreement took effect on March 1, 2025. [1] "This Master Services Agreement (the "Agre' |
| qwen2.5:7b-instruct | Can we end the agreement early? | ok | found | 1 | "Yes, either party can terminate the agreement on sixty (60) days' written notice to the ot" |
| qwen2.5:7b-instruct | What happens if Acme pays late? | ok | found | 1 | 'If Acme pays late, interest accrues at one percent (1%) per month on the late amounts [1].' |
| qwen2.5:7b-instruct | Where should notices to Smith be sent? | ok | found | 3 | 'From your documents:\n\n- smith_msa_v3, p. 1, 4.3: “Either party may terminate on thirty (30' |
| qwen2.5:7b-instruct | Is either side liable for consequential damages? | ok | found | 1 | 'Neither party is liable for indirect or consequential damages. [1] "7.1 Neither party is l' |
| qwen2.5:7b-instruct | How many days does Acme have to pay an invoice? | ok | found | 1 | 'Acme has thirty (30) days from receipt of an invoice to pay it [1]. "Acme shall pay each i' |
| qwen2.5:7b-instruct | What is the total unpaid amount on the invoices? | ok | found | 1 | 'The total unpaid amount on the invoices is $48,500.\n\n[1] "Total unpaid as of September 1, ' |
| qwen2.5:7b-instruct | Which invoices are unpaid? | ok | partial | 1 | 'Unpaid invoices are INV-2077 and INV-2103 [1]. "Status\\nUnpaid" is noted for both invoices' |
| qwen2.5:7b-instruct | How much was invoice INV-2103 for? | ok | found | 1 | 'Invoice INV-2103 was for $24,500 [1].' |
| qwen2.5:7b-instruct | Which invoice has been paid? | ok | partial | 1 | 'INV-2041 has been paid. [1] "Invoice Status: Paid" [1]' |
| qwen2.5:7b-instruct | Why is Acme withholding payment of INV-2077? | ok | found | 1 | 'Payment of invoice INV-2077 is withheld pending resolution of the late delivery dispute. [' |
| qwen2.5:7b-instruct | What settlement amount did Acme's counsel propose, and by when? | ok | found | 1 | "Acme's counsel proposed a settlement amount of $40,000 [1]. The payment was to be made by " |
| qwen2.5:7b-instruct | Who sent the settlement email? | MISS | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: sent, settleme' |
| qwen2.5:7b-instruct | What do the settlement terms say about claims? | MISS | found | 1 | 'The settlement terms state that each party releases all claims under the Master Services A' |
| qwen2.5:7b-instruct | What law governs this agreement? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: law, governs, ' |
| qwen2.5:7b-instruct | What is the recipe for blueberry pancakes? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: recipe, bluebe' |
| qwen2.5:7b-instruct | Who is the chief executive of Acme Corp? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: chief, executi' |
| qwen2.5:7b-instruct | Is there an arbitration clause? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: arbitration, c' |
| qwen2.5:7b-instruct | What insurance must Smith carry? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: insurance, mus' |
| qwen2.5:7b-instruct | What is the warranty period for the services? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: warranty, peri' |
| qwen2.5:7b-instruct | How many employees does Smith Logistics have? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: many, employee' |
| qwen2.5:7b-instruct | Does the agreement include a non-compete? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: agreement, inc' |
| qwen2.5:7b-instruct | What is the capital of France? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: capital, franc' |
| qwen2.5:7b-instruct | What is the weather forecast for Tokyo tomorrow? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: weather, forec' |
| qwen2.5:14b-instruct | How much notice is needed to terminate for convenience? | ok | found | 1 | "Sixty (60) days' written notice is needed to terminate for convenience [1]. “Notice must b" |
| qwen2.5:14b-instruct | What interest applies to late payments? | ok | found | 1 | 'Late amounts accrue interest at one percent (1%) per month [1], “Late amounts accrue inter' |
| qwen2.5:14b-instruct | What is the cap on each party's liability? | ok | found | 1 | "Each party's total liability under this Agreement is capped at the fees paid in the twelve" |
| qwen2.5:14b-instruct | What is the monthly fee for warehousing? | ok | found | 1 | 'The monthly fee for warehousing is $8,500 [1]. “Warehousing $8,500 Monthly in advance” [1]' |
| qwen2.5:14b-instruct | How much is the freight brokerage fee? | ok | found | 1 | 'The freight brokerage fee is $12,000 per month [1]. “Freight brokerage $12,000 Monthly in ' |
| qwen2.5:14b-instruct | What is the charge for expedited handling? | ok | found | 1 | 'The charge for expedited handling is $450 per load [1]. “Expedited handling $450 per load ' |
| qwen2.5:14b-instruct | How must a termination notice be delivered? | ok | found | 1 | 'Notice must be delivered by courier or certified mail to the address in Schedule 2 [1], an' |
| qwen2.5:14b-instruct | How long does a party have to cure a material breach? | ok | found | 3 | 'From your documents:\n\n- smith_msa_v3, p. 1, 4.3: “Either party may terminate on thirty (30' |
| qwen2.5:14b-instruct | Within how many days must Confidential Information be returned? | ok | found | 1 | 'Confidential Information must be returned or destroyed within ten (10) days after terminat' |
| qwen2.5:14b-instruct | How long does the agreement last? | ok | found | 1 | 'The agreement lasts for three (3) years from the Effective Date unless terminated earlier ' |
| qwen2.5:14b-instruct | When did the agreement take effect? | ok | found | 2 | 'The agreement took effect on March 1, 2025 “This Master Services Agreement (the "Agreement' |
| qwen2.5:14b-instruct | Can we end the agreement early? | ok | partial | 1 | "Yes, either party may terminate the agreement on sixty (60) days' written notice [1], “del" |
| qwen2.5:14b-instruct | What happens if Acme pays late? | ok | found | 1 | 'If Acme pays late, late amounts accrue interest at one percent (1%) per month [1]: “Acme s' |
| qwen2.5:14b-instruct | Where should notices to Smith be sent? | ok | found | 1 | 'Notices to Smith should be sent to the address in Schedule 2, which is “Smith Logistics LL' |
| qwen2.5:14b-instruct | Is either side liable for consequential damages? | ok | found | 1 | 'Neither party is liable for indirect or consequential damages. “Neither party is liable fo' |
| qwen2.5:14b-instruct | How many days does Acme have to pay an invoice? | ok | found | 1 | 'Acme has thirty (30) days to pay each invoice after receipt [1]. “Acme shall pay each invo' |
| qwen2.5:14b-instruct | What is the total unpaid amount on the invoices? | ok | found | 1 | 'The total unpaid amount on the invoices as of September 1, 2026, is $48,500 “Total unpaid ' |
| qwen2.5:14b-instruct | Which invoices are unpaid? | ok | found | 1 | 'The unpaid invoices are “INV-2077” and “INV-2103” [1].' |
| qwen2.5:14b-instruct | How much was invoice INV-2103 for? | ok | found | 1 | 'Invoice INV-2103 was for $24,500 [1].' |
| qwen2.5:14b-instruct | Which invoice has been paid? | ok | found | 1 | 'The invoice that has been paid is INV-2041 [1]. “INV-2041 June 30, 2026 $20,500 Paid”' |
| qwen2.5:14b-instruct | Why is Acme withholding payment of INV-2077? | ok | found | 1 | 'Acme is withholding payment of INV-2077 “pending resolution of the late delivery dispute” ' |
| qwen2.5:14b-instruct | What settlement amount did Acme's counsel propose, and by when? | ok | partial | 2 | "Acme's counsel proposed a settlement amount of $40,000 if payment is made by October 15, 2" |
| qwen2.5:14b-instruct | Who sent the settlement email? | MISS | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: sent, settleme' |
| qwen2.5:14b-instruct | What do the settlement terms say about claims? | MISS | found | 1 | 'The settlement terms state that each party releases all claims under the Master Services A' |
| qwen2.5:14b-instruct | What law governs this agreement? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: law, governs, ' |
| qwen2.5:14b-instruct | What is the recipe for blueberry pancakes? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: recipe, bluebe' |
| qwen2.5:14b-instruct | Who is the chief executive of Acme Corp? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: chief, executi' |
| qwen2.5:14b-instruct | Is there an arbitration clause? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: arbitration, c' |
| qwen2.5:14b-instruct | What insurance must Smith carry? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: insurance, mus' |
| qwen2.5:14b-instruct | What is the warranty period for the services? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: warranty, peri' |
| qwen2.5:14b-instruct | How many employees does Smith Logistics have? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: many, employee' |
| qwen2.5:14b-instruct | Does the agreement include a non-compete? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: agreement, inc' |
| qwen2.5:14b-instruct | What is the capital of France? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: capital, franc' |
| qwen2.5:14b-instruct | What is the weather forecast for Tokyo tomorrow? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: weather, forec' |
