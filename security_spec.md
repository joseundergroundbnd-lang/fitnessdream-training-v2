# FitnessDreams Firestore Security Specification (Phase 0)

## 1. Data Invariants
1. **Zero-Trust Default Deny**: Unauthenticated users can neither read nor write any collection.
2. **Email Verification Mandate**: Every write and privileged read requires `request.auth.token.email_verified == true`.
3. **No Self-Privilege Escalation**: Regular members cannot write to `/admins/{uid}` and cannot modify their own `feeStatus`, `monthlyFee`, `outreachStatus`, `lastOutreachNote`, or `isRealMember` fields.
4. **PII Isolation**: Member email and phone live exclusively in `/members/{memberId}/private/{docId}` and are readable only by `isOwner(memberId)` or `isAdmin()`.
5. **Immutable Audit Trail**: Turnstile scans in `/accessLogs/{logId}` can only be created by verified admins/scanners and can never be updated or deleted.
6. **Temporal Integrity**: `createdAt` must equal `request.time` on create and remain immutable on update; `updatedAt` must equal `request.time` on write.
7. **ID Poisoning & Payload Limits**: All single-document path IDs must satisfy `^[a-zA-Z0-9_\-]+$` with length `<= 128`, and every string/list field enforces strict schema size caps from `firebase-blueprint.json`.
8. **Secure List Queries**: Regular members can only list their own member record, their own access logs, routines targeted to `'all'` or their own UID, and direct messages where `memberId == request.auth.uid`.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Shadow Field Injection on Member Create**: Member includes ghost key `isAdmin: true` in `/members/{uid}`.
2. **Self-Unblocking Overdue Fee**: Member with `feeStatus: 'pendiente'` attempts `update` on `/members/{uid}` changing `feeStatus` to `'al-dia'`.
3. **Identity Spoofing on Member Create**: User A attempts to create `/members/userB` with `uid: 'userB'`.
4. **Unverified Email Spoof**: Caller claims `email: 'joseundergroundbnd@gmail.com'` with `email_verified: false`.
5. **PII Cross-Read**: Member A attempts `get` on `/members/userB/private/contact`.
6. **Unauthorized Admin Self-Grant**: Regular member attempts `create` on `/admins/{uid}` with `role: 'owner'`.
7. **Forged Turnstile Entry**: Regular member attempts `create` on `/accessLogs/{logId}` with `allowed: true`.
8. **Audit Log Tampering**: Even an admin attempts `update` on `/accessLogs/{logId}` to change `allowed: false` to `true`.
9. **Timestamp Backdating**: Caller sends `createdAt: "2020-01-01T00:00:00Z"` instead of `serverTimestamp()`.
10. **ID Poisoning (Resource Exhaustion)**: Caller attempts to write to `/members/${'A'.repeat(250)}`.
11. **Value Poisoning on Allowed Update Key**: Member updates allowed key `name` with a 500-char string (exceeds `maxLength: 100`) or boolean `true`.
12. **Coach Impersonation in Chat**: Regular member attempts to create `/directMessages/{id}` with `senderRole: 'coach'` or `memberId: 'otherUser'`.
