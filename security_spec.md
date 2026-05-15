# Security Specification - KPI Sông Hàn

## 1. Data Invariants
- A user profile must be created by the user themselves and match their UID.
- KPI Reports must be linked to a valid user and can only be created by that user.
- KPI Reports for finalized weeks (terminal state) cannot be modified except by admins.
- Meetings can only be managed by admins.
- Guests can be registered by any signed-in member.
- Notifications are private to the user.
- Monthly Summaries are system/admin generated.

## 2. The "Dirty Dozen" Payloads (Attacks)
1. **Identity Spoofing**: Attempt to create a user profile with a different UID.
2. **Admin Escalation**: Attempt to set `role: "admin"` in user profile during creation.
3. **Orphaned Report**: Create a KPI report for a non-existent user or another user.
4. **Terminal Update**: Modify a KPI report that has been "approved" or "rejected".
5. **Score Injection**: Update own `totalScore` directly in user profile.
6. **Email Spoofing**: Claim to be `thienkhoatgk@gmail.com` without being that user.
7. **Cross-User Delete**: Member A tries to delete Member B's guest registration.
8. **Meeting Tamper**: Regular member tries to delete or modify a meeting.
9. **Spam Notifications**: User A tries to write directly to User B's notifications.
10. **Ghost Fields**: Adding `isVerified: true` to a user profile update.
11. **Timestamp Manipulation**: Providing a custom `updatedAt` far in the past/future.
12. **PII Exposure**: Trying to read another user's phone/email without being admin.

## 3. Test Runner (Draft)
```typescript
// firestore.rules.test.ts (logic summary)
// 1. assertFails(setDoc(doc(db, "users", "other-uid"), { ... })) -- Identity Spoofing
// 2. assertFails(updateDoc(doc(db, "users", myUid), { role: "admin" })) -- Privilege Escalation
// 3. assertFails(setDoc(doc(db, "reports", "r1"), { userId: "other-uid", ... })) -- Orphaned Report
// ...
```
