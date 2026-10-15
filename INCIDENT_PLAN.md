# LegalLens incident plan (NFR-03)

> **Status:** v1, 2026-10-15 · **Owner:** the lawyer who runs this installation · Short on purpose: print it, keep it
> with the backup key. It is operating guidance for the software, not legal advice; for duties to clients and
> regulators (ABA Model Rules 1.1, 1.4, 1.6 and your state's breach rules) ask your ethics counsel or bar.

**First rule:** stop the harm, keep the evidence, then tell people. Do not delete anything before step 2.

## Quick commands

| Need | Command |
|---|---|
| Is the audit trail intact? | `legallens audit verify` |
| Who did what in a matter | Matter → audit export (JSON lines), or `GET /matters/{id}/audit` |
| Show the encryption key (to store apart) | `legallens key show` |
| Take, check and restore a backup | `legallens backup create --to <folder>` · `backup verify <file>` · `backup restore <file> --to <empty folder>` |
| Remove old backups (35 days) | `legallens backup prune --folder <folder>` |
| New authenticator secret | `legallens user reset-mfa <email>` |
| Unlock an account | `legallens user unlock <email>` |
| New password | `legallens user reset-password <email>` |
| Encrypt a plain database | `legallens db encrypt` |

## 1. Computer lost or stolen

1. Treat the computer as compromised. If it was powered off and the disk is encrypted (FileVault) and the LegalLens
   database is encrypted (`db.key` or `LEGALLENS_DB_KEY`), client text is not readable without the key. Say so in your
   record, but do not rely on it alone.
2. From another computer, change the passwords of accounts that were signed in (email, cloud drives, the Apple ID
   or Microsoft account), and use "find my device" to lock or wipe.
3. Restore from the latest backup onto a new computer with the key (`backup restore`). Run `backup verify` first.
4. Decide with ethics counsel whether clients must be told (Model Rule 1.4) and which matters were on the machine.

## 2. The key is lost

The database and the sealed files cannot be opened without it; the backups cannot either. Look for the key where
you stored it (password manager, printed copy). If it is gone, the data is gone: restore nothing from guesses.
Prevention: after `legallens db encrypt`, run `legallens key show` and store the value in two places, apart from the
backups.

## 3. Client data may have left the computer

Examples: the project folder was synced to a cloud drive, a backup file was emailed, a screenshot was shared.
1. Find out what and where: the file's path, the cloud account, who could see it.
2. Remove the copy at the source (delete from the cloud and its trash) and keep a note of the time.
3. Check `legallens audit verify` and the matter's audit export for exports or downloads around that time.
4. Move the data folder out of any synced location (LegalLens keeps it in the OS app-data folder on purpose).
5. Decide about client notice with ethics counsel.

## 4. A suspicious or infected upload

The scanner quarantines infected files and refuses them; hidden text is stripped from a sanitized copy.
1. Do not open the original. The quarantine folder is `<data folder>/quarantine/`.
2. If the scanner was unavailable, uploads fail closed (503): restart it (`brew services restart clamav`) and retry.
3. Record the file name, sender and time. If it arrived from opposing counsel, tell them the file was blocked.

## 5. A wrong answer or draft may have been used

1. Stop using the output. Find it: chat → the answer, or the draft's version history (each save is a version).
2. Check what it cited (every citation opens its passage) and what the checks said ("unverified", "partial").
3. Correct the work product, and if it went to a client, court or other side, follow your duty to correct.
4. Use **Not helpful** on the answer so the case can be added to the golden set (`legallens feedback export`).
5. LegalLens never sends or files anything; the sign-off ("Reviewed and adopted") is the lawyer's, and is logged.

## 6. Sign-in problems or suspected account misuse

1. Repeated failures lock the account for 15 minutes (`423 account_locked`); that is the lock working.
2. If someone else may have your password or authenticator: `legallens user reset-password` and
   `legallens user reset-mfa`. Existing sessions end by themselves after 30 idle minutes or 12 hours at most.
3. Review the audit export for logins you do not recognise.

## 7. The audit trail fails verification

`legallens audit verify` reports the first broken entry. The file was changed outside LegalLens or damaged.
Take a copy of the database and the audit export now, restore the latest verified backup alongside, and compare.

## After any incident

Write down: what happened, when found, what was exposed, what you did, who was told. Keep it with the matter.
Test the restore again (`backup verify`) and update this plan with anything that was unclear.
