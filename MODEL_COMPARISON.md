# Local answer-model comparison

Documents: smith_msa_v3.pdf, exhibit_b_invoices.pdf, email_from_acme_counsel.eml. Rewrite model: llama3.2:3b.

| Model | Correct | Right document cited | All citations verified | State as expected | Avg per question |
|---|---|---|---|---|---|
| qwen2.5:7b-instruct | 10/11 | 10/11 | 10/11 | 10/11 | 6.9 s |
| qwen2.5:14b-instruct | 11/11 | 11/11 | 10/11 | 10/11 | 24.4 s |

## Per question

| Model | Question | Result | State | Citations | Answer (start) |
|---|---|---|---|---|---|
| qwen2.5:7b-instruct | How much notice is needed to terminate for convenience? | ok | found | 1 | "[1] “(a) Either party may terminate this Agreement on sixty (60) days' written notice to the other party.”" |
| qwen2.5:7b-instruct | What interest applies to late payments? | ok | found | 1 | 'Late amounts accrue interest at one percent (1%) per month. [1]' |
| qwen2.5:7b-instruct | What is the cap on each party's liability? | ok | found | 1 | 'The cap on each party\'s liability is at the fees paid in the twelve (12) months before the claim. [1] "Each pa' |
| qwen2.5:7b-instruct | What is the monthly fee for warehousing? | ok | found | 1 | 'The monthly fee for warehousing is $8,500 [1]. "Warehousing" is listed with a monthly fee of "$8,500" [1].' |
| qwen2.5:7b-instruct | How must a termination notice be delivered? | ok | partial | 1 | 'Notice must be delivered by courier or certified mail to the address in Schedule 2, and: “and must state the t' |
| qwen2.5:7b-instruct | How long does a party have to cure a material breach? | MISS | found | 1 | '[1] Not found in your documents.' |
| qwen2.5:7b-instruct | Within how many days must Confidential Information be returned? | ok | found | 1 | 'Within ten (10) days after termination, Confidential Information must be returned. [1] “Each party shall retur' |
| qwen2.5:7b-instruct | What is the total unpaid amount on the invoices? | ok | found | 1 | 'The total unpaid amount on the invoices is $48,500.\n\n[1] "Total unpaid as of September 1, 2026: $48,500."' |
| qwen2.5:7b-instruct | Which invoices are unpaid? | ok | found | 2 | 'Unpaid invoices are INV-2077 and INV-2103 [1]. "Total unpaid as of September 1, 2026: $48,500." [1] Not found ' |
| qwen2.5:7b-instruct | What settlement amount did Acme's counsel propose, and by when? | ok | found | 1 | "Acme's counsel proposed a settlement amount of $40,000 [1]. The proposed terms required payment by October 15," |
| qwen2.5:7b-instruct | What law governs this agreement? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: law, governs, agreement.' |
| qwen2.5:14b-instruct | How much notice is needed to terminate for convenience? | ok | found | 1 | "Sixty (60) days' written notice is needed to terminate for convenience [1]. “Notice must be delivered by couri" |
| qwen2.5:14b-instruct | What interest applies to late payments? | ok | found | 1 | 'Late amounts accrue interest at one percent (1%) per month [1]. “Late amounts accrue interest at one percent (' |
| qwen2.5:14b-instruct | What is the cap on each party's liability? | ok | found | 1 | "Each party's total liability under this Agreement is capped at the fees paid in the twelve (12) months before " |
| qwen2.5:14b-instruct | What is the monthly fee for warehousing? | ok | found | 1 | 'The monthly fee for warehousing is $8,500 “Monthly in advance” [1].' |
| qwen2.5:14b-instruct | How must a termination notice be delivered? | ok | found | 1 | 'Notice must be delivered by courier or certified mail to the address in Schedule 2 [1], and it “is effective o' |
| qwen2.5:14b-instruct | How long does a party have to cure a material breach? | ok | found | 3 | "From your documents:\n\n- smith_msa_v3, p. 1, 4.3: “Either party may terminate on thirty (30) days' notice if th" |
| qwen2.5:14b-instruct | Within how many days must Confidential Information be returned? | ok | found | 1 | 'Confidential Information must be returned or destroyed within ten (10) days after termination [1]. “Each party' |
| qwen2.5:14b-instruct | What is the total unpaid amount on the invoices? | ok | found | 1 | 'The total unpaid amount on the invoices as of September 1, 2026, is $48,500 “Total unpaid as of September 1, 2' |
| qwen2.5:14b-instruct | Which invoices are unpaid? | ok | found | 1 | 'The unpaid invoices are “INV-2077” and “INV-2103” [1].' |
| qwen2.5:14b-instruct | What settlement amount did Acme's counsel propose, and by when? | ok | partial | 2 | "Acme's counsel proposed a settlement amount of $40,000 if payment is made by October 15, 2026 [1]. “Further to" |
| qwen2.5:14b-instruct | What law governs this agreement? | ok | not_found | 0 | 'Not found in your documents. I searched all 4 documents in this matter for: law, governs, agreement.' |
