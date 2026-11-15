STATUS: DONE

# cr2-mail (agent `cr2-mail`)

Second round of CodeRabbit fixes in `packages/mail-core/**` and `packages/engine/test/support/**`. Commits `82dbd14..a5c231c` on `feat/mvp-core`.

## What changed

- `ImapMailProvider.move` (UIDPLUS COPY fallback, used only without MOVE): when STORE `\Deleted` or UID EXPUNGE fails after a successful COPY, the provider rolls back. It restores the source (`-\Deleted`), checks that every source UID still exists, then UID EXPUNGEs the COPYUID destination UIDs and throws a plain `ProviderError` ("... the copies were rolled back"). A replay can then call `move` again without duplicating anything.
  - If the source is already gone (the EXPUNGE ran but its reply was lost, or another client expunged it), `move` resolves with the COPYUID `uidMap`, as for a successful move.
  - If the rollback is unsafe or fails, `move` throws `PartialMoveError` (exported from `@relay/mail-core`, extends `ProviderError`). That covers some source UIDs gone, no COPYUID, a changed UIDVALIDITY on either mailbox, or a failing rollback command. Its fields are `sourcePath`, `targetPath` and `uidMap: ReadonlyMap<sourceUid, targetUid>`. The copies exist in the target. The `uidMap` may be empty when the server sent no COPYUID.
- `fetchSince(path, cursor)` throws `UidValidityChangedError` (exported, extends `ProviderError`, fields `mailboxPath`, `expected`, `actual`) when `cursor.uidValidity` differs from the UIDVALIDITY of the SELECT used for fetching. It also throws when UIDVALIDITY changes between fetch batches. Before this change it silently refetched from UID 1 under the old checkpoint. `cursor === null` still fetches everything.
- Fakes: `FakeMailProvider.setFlags`/`setKeywords` ignore missing UIDs and no longer reject. The fake server copies bytes on store and fetch. Each mailbox has a monotonic `highestModseq` that expunges also bump. `MemoryUnitOfWork.run` serializes top-level runs, and nested runs run inline with their own snapshot as before.

## Requests for cr2-engine

1. **Move the two error types into the engine** so services can `instanceof` them (the engine cannot import mail-core). Add this to `packages/engine/src/errors/errors.ts` and export it:

   ```ts
   export class PartialMoveError extends ProviderError {
     constructor(
       readonly sourcePath: string,
       readonly targetPath: string,
       readonly uidMap: ReadonlyMap<number, number>,
       options?: ErrorOptions,
     ) {
       super(
         `IMAP move from ${sourcePath} to ${targetPath} failed after the messages were copied and the copies could not be rolled back`,
         options,
       );
     }
   }

   export class UidValidityChangedError extends ProviderError {
     constructor(
       readonly mailboxPath: string,
       readonly expected: number,
       readonly actual: number,
     ) {
       super(
         `UIDVALIDITY of ${mailboxPath} changed from ${String(expected)} to ${String(actual)}, the sync cursor is stale`,
       );
     }
   }
   ```

   After that, mail-core deletes `src/imap/partial-move-error.ts` and `src/imap/uid-validity-changed-error.ts` and imports both from `@relay/engine`. The constructor signatures are identical, so the swap is mechanical. Whoever lands the engine side can do it, or ping me.

2. **`ProviderOpReplayer` (`provider-op-replayer.ts` ~113) on `PartialMoveError`**: do NOT call `move` again for those messages. Copies already exist in `targetPath` at `uidMap.get(sourceUid)`. Suggested handling: record each message at the target with `uidMap.get(uid) ?? PENDING_UID` (same as a successful move), complete the op, and let the next sync of the source mailbox reconcile the stale source UIDs. The source may still hold the original (with or without `\Deleted`), so the source sync must not ingest it as a new message. It is at or below `lastUid`, so `fetchSince` will not return it. Any other `ProviderError` from `move` is treated as nothing changed remotely and retried. Exception: see the lost COPY reply in Known limits.
3. **`NewMessageFetcher` / `MailboxSynchronizer` on `UidValidityChangedError`**: abort the pass for that mailbox without checkpointing. The next pass re-reads `status`, sees the new UIDVALIDITY and resets the mailbox the usual way (`mailbox-synchronizer.ts:32`). Retrying `fetchSince` with the same cursor fails again by design.
4. FYI, no change needed: `oauthProviderSettings` (`services/accounts/oauth-provider-settings.ts`) keeps `smtp.office365.com` for Outlook OAuth. That is correct for OAuth, Microsoft 365 and Outlook.com accounts. Only the password presets for consumer domains moved to `smtp-mail.outlook.com`.
5. FYI for engine tests: `FakeMailProvider.fetchSince` now rejects with a `ProviderError` ("UIDVALIDITY of <path> changed") when the cursor UIDVALIDITY differs, like the IMAP provider. Switch it to `UidValidityChangedError` once request 1 lands.

## Known limits

- After the rollback has confirmed that the source survived, another client could still flag and expunge the source before the target copies are deleted. That would be a deliberate user deletion racing the rollback, so it is accepted.
- On a server without MOVE, a connection lost after `UID COPY` ran but before its reply arrived surfaces as a rejected COPY. The source stays intact and the replay copies again, so the target can hold a duplicate. Avoiding it needs a target reconcile (for example Message-ID matching above the pre-COPY UIDNEXT); it is a duplicate, never a loss, so it is accepted for now.
- GreenMail derives UIDVALIDITY from a seconds timestamp, so a mailbox recreated within the same second keeps its UIDVALIDITY. The rollback test waits 1.1 s before recreating the mailbox.

## Review

- gpt-6.1-sol on `82dbd14..90efea5`: two valid data-loss findings in the move rollback. One was a SEARCH-before-STORE race on the source, the other was missing UIDVALIDITY checks on rollback selections. Both are fixed in `a5c231c` with GreenMail tests. The source is now unflagged first and then searched with `NOT DELETED`, and both selections verify UIDVALIDITY.
- gpt-6.1-sol recheck of `a5c231c`: confirms both are fixed and that the tests fail without the fix. The race it still raises is the deliberate user deletion listed under Known limits. It is rejected, because always keeping the copies would remove the rollback that the CodeRabbit finding asks for.
