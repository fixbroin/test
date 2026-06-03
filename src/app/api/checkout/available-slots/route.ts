
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppSettings, FirestoreService, FirestoreSubCategory, TimeSlotCategoryLimit, FirestoreBooking } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';

interface CartEntry {
  serviceId: string;
  quantity: number;
}

const DEFAULT_SLOT_INTERVAL_MINUTES = defaultAppSettings.timeSlotSettings.slotIntervalMinutes;
const DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS = defaultAppSettings.enableLimitLateBookings;
const DEFAULT_HOURS_WHEN_LIMIT_ENABLED = defaultAppSettings.limitLateBookingHours;

// --- Performance Cache ---
// Module-level cache for schedule simulation results
// Keyed by date range, bookings hash, and limits hash
const BUSY_MAP_CACHE = new Map<string, Map<string, Record<string, number>>>();
const MAX_CACHE_SIZE = 100;

// --- Helper Functions ---

const getServiceDurationInMinutes = (service: FirestoreService): number => {
    if (!service.taskTimeValue || !service.taskTimeUnit) return 0;
    if (service.taskTimeUnit === 'hours') {
        return service.taskTimeValue * 60;
    }
    return service.taskTimeValue;
};

const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr || !timeStr.includes(':')) return 0;
    const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (timeMatch) {
      let hours = parseInt(timeMatch[1], 10);
      const minutes = parseInt(timeMatch[2], 10);
      const period = timeMatch[3].toUpperCase();
      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
};

const formatTimeFromMinutes = (totalMinutes: number): string => {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const period = hours >= 12 && hours < 24 ? 'PM' : 'AM';
    let displayHours = hours % 12;
    if (displayHours === 0) displayHours = 12;
    return `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${period}`;
};

const getDayName = (date: Date): keyof AppSettings['timeSlotSettings']['weeklyAvailability'] => {
    const dayIndex = date.getDay();
    const days: (keyof AppSettings['timeSlotSettings']['weeklyAvailability'])[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[dayIndex];
};

const getSlotKey = (dateISO: string, minutes: number) => `${dateISO}:${minutes}`;

/**
 * Calculates the EXACT end date and time for a booking,
 * respecting working hours and multi-day spillovers.
 */
function calculateEndDateTime(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings
): string {
    let remainingMinutes = workDuration + bufferDuration;
    let currentMinutes = startMinutes;
    const currentDate = new Date(startDateISO);
    
    let daysSearched = 0;
    while (remainingMinutes > 0 && daysSearched < 30) {
        let dayName = getDayName(currentDate);
        let dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];

        let loopGuard = 0;
        while (!dayAvailability.isEnabled && loopGuard < 7) {
            currentDate.setDate(currentDate.getDate() + 1);
            dayName = getDayName(currentDate);
            dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
            currentMinutes = parseTimeToMinutes(dayAvailability.startTime);
            loopGuard++;
        }
        if (loopGuard >= 7) break; 

        const dayStart = parseTimeToMinutes(dayAvailability.startTime);
        const dayEnd = parseTimeToMinutes(dayAvailability.endTime);

        if (currentMinutes < dayStart) currentMinutes = dayStart;

        const minutesAvailableToday = dayEnd - currentMinutes;

        if (minutesAvailableToday <= 0) {
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
            daysSearched++;
            continue;
        }

        if (remainingMinutes <= minutesAvailableToday) {
            currentMinutes += remainingMinutes;
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesAvailableToday;
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
        }
        daysSearched++;
    }
    
    const finalDate = new Date(currentDate);
    finalDate.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);
    return finalDate.toISOString();
}

/**
 * Simulates a continuous timeline of work across multiple days.
 * Yields every slot interval that has any overlap with the Work + Buffer range.
 */
function* simulateProgression(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings
) {
    let remainingMinutesToBlock = workDuration;
    let bufferRemaining = bufferDuration;
    let isWorkCompleted = false;
    let currentMinutes = startMinutes;
    const currentDate = new Date(startDateISO);
    
    const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;

    let daysSearched = 0;
    while (remainingMinutesToBlock > 0 && daysSearched < 30) {
        let dateISO = currentDate.toLocaleDateString('en-CA');
        let dayName = getDayName(currentDate);
        let dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];

        let loopGuard = 0;
        while (!dayAvailability.isEnabled && loopGuard < 7) {
            currentDate.setDate(currentDate.getDate() + 1);
            dateISO = currentDate.toLocaleDateString('en-CA');
            dayName = getDayName(currentDate);
            dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
            currentMinutes = parseTimeToMinutes(dayAvailability.startTime);
            loopGuard++;
        }
        if (loopGuard >= 7) break;

        const dayStart = parseTimeToMinutes(dayAvailability.startTime);
        const dayEnd = parseTimeToMinutes(dayAvailability.endTime);

        if (currentMinutes < dayStart) currentMinutes = dayStart;

        if (currentMinutes >= dayEnd) {
            currentDate.setDate(currentDate.getDate() + 1);
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
            daysSearched++;
            continue;
        }

        const minutesAvailableToday = dayEnd - currentMinutes;
        const minutesToConsumeToday = Math.min(minutesAvailableToday, remainingMinutesToBlock);
        
        const segmentStart = currentMinutes;
        const segmentEnd = currentMinutes + minutesToConsumeToday;

        // 🔥 Yield ALL standard slot boundaries that overlap with this work segment
        // A standard slot is: dayStart, dayStart + slotInterval, etc.
        // It overlaps if: slotStart < segmentEnd AND slotStart + slotInterval > segmentStart
        let slotStart = dayStart;
        while (slotStart < segmentEnd) {
            if (slotStart + slotInterval > segmentStart) {
                yield { dateISO, minutes: slotStart };
            }
            slotStart += slotInterval;
        }

        // Move time forward
        remainingMinutesToBlock -= minutesToConsumeToday;
        currentMinutes += minutesToConsumeToday;

        // ✅ When work finishes, start buffer ONLY if there is time left TODAY
        if (!isWorkCompleted && remainingMinutesToBlock <= 0) {
            isWorkCompleted = true;

            const minutesLeftToday = dayEnd - currentMinutes;
            if (minutesLeftToday > 0) {
                // Only take as much buffer as fits in the current day
                remainingMinutesToBlock = Math.min(bufferRemaining, minutesLeftToday);
            } else {
                // Work ended exactly at or after dayEnd, no buffer needed for next day
                remainingMinutesToBlock = 0;
            }
        }

        if (currentMinutes >= dayEnd) {
            // If we just finished work and were about to start buffer, 
            // but we hit the end of the day, we stop here.
            if (isWorkCompleted) {
                remainingMinutesToBlock = 0; 
                break;
            }

            // Move to next day
            currentDate.setDate(currentDate.getDate() + 1);
            
            // 🔥 CRITICAL FIX: Reset currentMinutes to the START of the next day
            const nextDayName = getDayName(currentDate);
            const nextDayAvail = appConfig.timeSlotSettings?.weeklyAvailability[nextDayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[nextDayName];
            currentMinutes = parseTimeToMinutes(nextDayAvail.startTime);
            
            daysSearched++;
        }
    }
}

export async function POST(req: NextRequest) {
    try {
        const { selectedDate, cartEntries } = await req.json();

        if (!selectedDate || !cartEntries) {
            return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
        }

        const dateObj = new Date(selectedDate);
        const dateISO = dateObj.toLocaleDateString('en-CA');

        const lookBackDate = new Date(dateObj);
        lookBackDate.setDate(lookBackDate.getDate() - 7);
        const lookBackISO = lookBackDate.toLocaleDateString('en-CA');

        const [appConfigSnap, limitsSnap, servicesSnap, subCatsSnap, bookingsSnap] = await Promise.all([
            adminDb.collection("webSettings").doc("applicationConfig").get(),
            adminDb.collection("timeSlotCategoryLimits").get(),
            adminDb.collection("adminServices").get(),
            adminDb.collection("adminSubCategories").get(),
            adminDb.collection("bookings")
                .where("scheduledDate", ">=", lookBackISO)
                .where("scheduledDate", "<=", dateISO) 
                .get()
        ]);

        const appConfig = (appConfigSnap.exists ? appConfigSnap.data() : defaultAppSettings) as AppSettings;
        const limitsData = Object.fromEntries(limitsSnap.docs.map(doc => [doc.data().categoryId, { id: doc.id, ...doc.data() } as TimeSlotCategoryLimit]));
        const servicesData = Object.fromEntries(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));
        const subCatsData = Object.fromEntries(subCatsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreSubCategory]));
        const existingBookings = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);

        const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;
        const breakTimeMinutes = appConfig.timeSlotSettings?.breakTimeMinutes || 0;
        const enableLimitLateBookings = appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS;
        const limitLateBookingHours = enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0;
        const weeklyAvailability = appConfig.timeSlotSettings?.weeklyAvailability || defaultAppSettings.timeSlotSettings.weeklyAvailability;

        const uniqueCartCategoryIds = new Set<string>();
        let totalCartDuration = 0;
        cartEntries.forEach((entry: CartEntry) => {
            const service = servicesData[entry.serviceId];
            if (service) {
                totalCartDuration += getServiceDurationInMinutes(service) * entry.quantity;
                const subCat = subCatsData[service.subCategoryId];
                if (subCat?.parentId) uniqueCartCategoryIds.add(subCat.parentId);
            }
        });
        const cartCategoryIds = Array.from(uniqueCartCategoryIds);

        // --- Cache Logic Start ---
        // Generate a composite hash to invalidate cache if any relevant data changes
        const bookingsHash = bookingsSnap.docs
            .map(doc => `${doc.id}_${doc.updateTime?.toMillis() || 0}`)
            .sort()
            .join('|');
            
        const limitsHash = Object.values(limitsData)
            .map((l: any) => `${l.categoryId}_${l.maxConcurrentBookings}`)
            .sort()
            .join('|');
            
        const cacheKey = `${lookBackISO}_${dateISO}_${bookingsHash}_${limitsHash}_${appConfig.updatedAt?.toMillis() || 0}_${breakTimeMinutes}`;
        
        let globalBusyMap: Map<string, Record<string, number>>;

        if (BUSY_MAP_CACHE.has(cacheKey)) {
            globalBusyMap = BUSY_MAP_CACHE.get(cacheKey)!;
        } else {
            // Cache Miss: Run Simulation
            globalBusyMap = new Map<string, Record<string, number>>();

            existingBookings.forEach(booking => {
                let bookingWorkDuration = 0;
                const bookingCategoryIds = new Set<string>();

                booking.services.forEach(item => {
                    const serviceDetail = servicesData[item.serviceId];
                    if (serviceDetail) {
                        bookingWorkDuration += getServiceDurationInMinutes(serviceDetail) * item.quantity;
                        const subCat = subCatsData[serviceDetail.subCategoryId];
                        if (subCat?.parentId) bookingCategoryIds.add(subCat.parentId);
                    }
                });

                const startMin = parseTimeToMinutes(booking.scheduledTimeSlot);
                const progression = simulateProgression(
                    booking.scheduledDate,
                    startMin,
                    bookingWorkDuration,
                    breakTimeMinutes, // ✅ Restore buffer blocking for existing bookings
                    appConfig
                );

                for (const step of progression) {
                    const key = getSlotKey(step.dateISO, step.minutes);
                    const counts = globalBusyMap.get(key) || {};
                    
                    bookingCategoryIds.forEach(catId => {
                        counts[catId] = (counts[catId] || 0) + 1;
                    });
                    
                    globalBusyMap.set(key, counts);
                }
            });

            // Store in cache
            if (BUSY_MAP_CACHE.size >= MAX_CACHE_SIZE) {
                const firstKey = BUSY_MAP_CACHE.keys().next().value; // Simple eviction: clear all if too big 
                if (firstKey !== undefined) {
                    BUSY_MAP_CACHE.delete(firstKey);
                }
            }
            BUSY_MAP_CACHE.set(cacheKey, globalBusyMap);
        }
        // --- Cache Logic End ---

        const selectedDayName = getDayName(dateObj);
        const selectedDayAvail = weeklyAvailability[selectedDayName];
        if (!selectedDayAvail?.isEnabled) {
            return NextResponse.json({ availableTimeSlots: [], totalCartDuration });
        }

        const now = new Date();
        const earliestBookableTime = new Date(now.getTime() + (limitLateBookingHours * 60 * 60 * 1000));
        const dayStartMinutes = parseTimeToMinutes(selectedDayAvail.startTime);
        const dayEndMinutes = parseTimeToMinutes(selectedDayAvail.endTime);

        const availableSlots: { slot: string; remainingCapacity: number, endDateTime: string }[] = [];

        let potentialStart = dayStartMinutes;
        while (potentialStart < dayEndMinutes) {
            const slotDateTime = new Date(dateObj);
            slotDateTime.setHours(Math.floor(potentialStart / 60), potentialStart % 60, 0, 0);

            if (slotDateTime < earliestBookableTime) {
                potentialStart += slotInterval;
                continue;
            }

            // 🚨 MULTI-DAY SERVICE RESTRICTION

const totalWorkingMinutesInDay = dayEndMinutes - dayStartMinutes;

if (totalCartDuration > totalWorkingMinutesInDay) {
    // Only allow starting at beginning of day
    if (potentialStart !== dayStartMinutes) {
        potentialStart += slotInterval;
        continue;
    }
}
// 🚨 LONG SERVICE RESTRICTION (FULL-DAY FIX)

const FULL_DAY_THRESHOLD = 6 * 60; // 6 hours (adjust if needed)

const remainingMinutesToday = dayEndMinutes - potentialStart;

// If long service and not enough time today → skip this slot


if (
    totalCartDuration >= FULL_DAY_THRESHOLD &&
    totalCartDuration <= totalWorkingMinutesInDay && // ✅ IMPORTANT
    remainingMinutesToday < totalCartDuration
) {
    potentialStart += slotInterval;
    continue;
}
            let isPathClear = true;
            let minRemainingCapacity = Infinity;

            const pathSteps = Array.from( simulateProgression(dateISO, potentialStart, totalCartDuration, breakTimeMinutes, appConfig) );
            
            for (const step of pathSteps) {
                const key = getSlotKey(step.dateISO, step.minutes);
                const counts = globalBusyMap.get(key) || {};

                for (const catId of cartCategoryIds) {
                    const limit = limitsData[catId]?.maxConcurrentBookings || 1;
                    const currentBookings = counts[catId] || 0;
                    const remaining = limit - currentBookings;
                    
                    minRemainingCapacity = Math.min(minRemainingCapacity, remaining);
                    if (remaining <= 0) {
                        isPathClear = false;
                        break;
                    }
                }
                if (!isPathClear) break;
            }

            if (isPathClear) {
                // FIXED: Include breakTimeMinutes in endDateTime for UI transparency
                const endDateTime = calculateEndDateTime(dateISO, potentialStart, totalCartDuration, 0, appConfig);
                availableSlots.push({ 
                    slot: formatTimeFromMinutes(potentialStart), 
                    remainingCapacity: minRemainingCapacity,
                    endDateTime: endDateTime
                });
            }

            potentialStart += slotInterval;
        }

        return NextResponse.json({ availableTimeSlots: availableSlots, totalCartDuration });
    } catch (error) {
        console.error("Continuous Multi-day API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
