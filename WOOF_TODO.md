## Post-legacy-import queue

- [ ] Build owner-merge feature in Customers page. Allow selecting 2+ owners, picking a canonical, transferring pets/bookings/credits to it, archiving the duplicates. Reference `migration/staging/duplicates_review.csv` for the 17 groups.
- [ ] Manual: split CL000982 into 3 pet records (Oliver, Nemo flagged not-acceptable-for-dcare-or-boarding, Smakka).
- [ ] Manual: review 91 multi-room-same-night cases (`multi_room_flags.json`) — these are pets that appeared in 2+ rooms on the same night in the source data. The first-alphabetical room was chosen; verify with operational records.
- [ ] Reconcile 183 Review+Unmatched room assignments still in source workbook (`MatchStatus = Review` or `Unmatched`).
