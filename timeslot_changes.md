# Time Slot and Leaves Implementation Log

This document lists all the files modified and created to support the multiple timing intervals per day and leaves/holidays configuration feature.

---

### 1. `src/types/firestore.ts`
* **Changes**:
  * Added the `TimeInterval` interface representing dynamic timing windows (with `startTime`, `endTime`, and `slotIntervalMinutes`).
  * Added the `LeaveRequest` interface representing scheduled leaves and holidays (with fields for `startDate`, `endDate`, `leaveType`, `startTime`, `endTime`, and `reason`).
  * Extended the `DayAvailability` interface to hold an optional array of `intervals?: TimeInterval[]`.

---

### 2. `src/config/appDefaults.ts`
* **Changes**:
  * Updated the default settings template to initialize each weekday with an `intervals` array containing the day's standard working hours. This guarantees backward compatibility and prevents null reference errors on fresh installations.

---

### 3. `src/app/admin/settings/page.tsx`
* **Changes**:
  * **Time Slots Tab**: Refactored the UI to support adding and deleting multiple time slots per day (using dynamic `Plus` and `Trash2` icons) instead of a single range.
  * **Leaves & Holidays Tab**: Added a dedicated settings tab to display all holidays, add leaves (using a Dialog picker for type selection: Full-Day vs. Custom Hours), edit leaves in-place, and delete configured leaves.
  * **Data Migration on Load**: When loading settings from Firestore, if a day does not have an `intervals` array, the system automatically builds one using the day's legacy `startTime`/`endTime` values.
  * **In-Place Leave Editing**: Added `editingLeaveId` state to prepopulate the leave dialog, permitting admins to modify existing holidays and update them directly in Firestore.

---

### 4. `src/app/api/checkout/available-slots/route.ts`
* **Changes**:
  * **Interval and Leaves Math**: Implemented `getDayActiveIntervals` and `subtractInterval` to compile all active working windows for any date and subtract any custom hours blocked by partial leaves.
  * **Path Progression**: Rewrote `calculateEndDateTime` and `simulateProgression` to step bookings sequentially through multiple daily intervals (automatically jumping over gap times and breaks).
  * **Multi-Day Service Restriction**: Adapted to multi-interval days by summing all working minutes in active intervals. If duration exceeds the day's total capacity, the service is locked to start only at the first slot of the first interval.
  * **Long Service Restriction (6-hour Fix)**: Adapted to multi-interval days by summing the remaining minutes in the current interval plus all subsequent intervals today. If the total remaining working time today is less than the service duration, the slot is skipped.

---

### 5. `src/app/api/checkout/leaves/route.ts` [NEW FILE]
* **Changes**:
  * Created a secure, dynamic server-side GET API route that reads the `leaves` collection via the Firebase Admin SDK. This prevents guest checkout users from facing client-side Firebase permission errors.

---

### 6. `src/components/checkout/ScheduleSelection.tsx`
* **Changes**:
  * **Bypassed Permission Rules**: Replaced client-side Firestore calls with requests to the new `/api/checkout/leaves` API.
  * **Calendar Modifiers**: Applied custom highlights to the calendar (dashed red for holidays, dashed amber for partial-day leaves).
  * **Selectable Holiday Dates**: Kept holiday dates selectable (instead of disabling them completely) so that when clicked, the customer is shown the custom warning banner with the admin's holiday reason, while the confirmation button remains disabled.
  * **Estimated Completion Date**: Restored the date string display so that it outputs both date and time (e.g., `Ends on Sat, 27 Jun at 07:00 PM`).
  * **Includes Gaps / Holidays Breakdown**: Added a detailed section below estimated completion that transparently lists any holidays, leaves, or shop breaks falling within the booking progression timeline to prevent client confusion.
