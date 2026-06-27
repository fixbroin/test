
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebaseAdmin';
import { AppSettings, FirestoreService, FirestoreSubCategory, TimeSlotCategoryLimit, FirestoreBooking, LeaveRequest } from '@/types/firestore';
import { defaultAppSettings } from '@/config/appDefaults';
import { getZonedDate, formatZonedDateToISO, convertWallClockToUTC } from '@/lib/utils';

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

const getDayName = (date: Date, timeZone: string = 'Asia/Kolkata'): keyof AppSettings['timeSlotSettings']['weeklyAvailability'] => {
    // Robust way to get weekday name in a specific timezone
    return new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone }).format(date).toLowerCase() as any;
};

const getSlotKey = (dateISO: string, minutes: number) => `${dateISO}:${minutes}`;

interface Interval {
  startMin: number;
  endMin: number;
}

function subtractInterval(work: Interval[], leave: Interval): Interval[] {
  const result: Interval[] = [];
  for (const w of work) {
    if (leave.startMin >= w.endMin || leave.endMin <= w.startMin) {
      result.push(w);
    } else {
      if (leave.startMin > w.startMin) {
        result.push({ startMin: w.startMin, endMin: leave.startMin });
      }
      if (leave.endMin < w.endMin) {
        result.push({ startMin: leave.endMin, endMin: w.endMin });
      }
    }
  }
  return result;
}

function getDayActiveIntervals(
  dateISO: string,
  appConfig: AppSettings,
  leaves: LeaveRequest[]
): Interval[] {
  const timezone = appConfig.timezone || 'Asia/Kolkata';
  const [y, m, d] = dateISO.split('-').map(Number);
  const currentDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dayName = getDayName(currentDate, timezone);
  
  const dayAvailability = appConfig.timeSlotSettings?.weeklyAvailability[dayName] || defaultAppSettings.timeSlotSettings.weeklyAvailability[dayName];
  if (!dayAvailability || !dayAvailability.isEnabled) {
    return [];
  }
  
  let workingIntervals: Interval[] = [];
  if (dayAvailability.intervals && Array.isArray(dayAvailability.intervals) && dayAvailability.intervals.length > 0) {
    workingIntervals = dayAvailability.intervals.map(i => ({
      startMin: parseTimeToMinutes(i.startTime),
      endMin: parseTimeToMinutes(i.endTime)
    }));
  } else {
    workingIntervals = [{
      startMin: parseTimeToMinutes(dayAvailability.startTime),
      endMin: parseTimeToMinutes(dayAvailability.endTime)
    }];
  }
  
  const activeLeaves = leaves.filter(leave => leave.startDate <= dateISO && leave.endDate >= dateISO);
  for (const leave of activeLeaves) {
    if (leave.leaveType === 'full_day') {
      return [];
    } else if (leave.leaveType === 'partial_day') {
      const leaveStart = parseTimeToMinutes(leave.startTime || "09:00");
      const leaveEnd = parseTimeToMinutes(leave.endTime || "17:00");
      workingIntervals = subtractInterval(workingIntervals, { startMin: leaveStart, endMin: leaveEnd });
    }
  }
  
  return workingIntervals
    .filter(i => i.endMin > i.startMin)
    .sort((a, b) => a.startMin - b.startMin);
}

/**
 * Calculates the EXACT end date and time for a booking,
 * respecting working hours and multi-day spillovers.
 */
function calculateEndDateTime(
    startDateISO: string,
    startMinutes: number,
    workDuration: number,
    bufferDuration: number,
    appConfig: AppSettings,
    leaves: LeaveRequest[]
): string {
    const timezone = appConfig.timezone || 'Asia/Kolkata';
    let remainingMinutes = workDuration + bufferDuration;
    let currentMinutes = startMinutes;
    
    const [y, m, d] = startDateISO.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
    
    let daysSearched = 0;
    while (remainingMinutes > 0 && daysSearched < 30) {
        const dateISO = currentDate.toISOString().split('T')[0];
        const intervals = getDayActiveIntervals(dateISO, appConfig, leaves);

        if (intervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        const interval = intervals.find(i => i.endMin > currentMinutes);

        if (!interval) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        if (currentMinutes < interval.startMin) {
            currentMinutes = interval.startMin;
        }

        const minutesAvailable = interval.endMin - currentMinutes;

        if (remainingMinutes <= minutesAvailable) {
            currentMinutes += remainingMinutes;
            remainingMinutes = 0;
        } else {
            remainingMinutes -= minutesAvailable;
            currentMinutes = interval.endMin;
        }
    }
    
    // Construct final result by combining the date components and the final minutes
    const finalDateStr = currentDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const finalHours = Math.floor(currentMinutes / 60);
    const finalMins = currentMinutes % 60;
    
    // Create a date string that represents the wall-clock time in the target timezone
    // "YYYY-MM-DDTHH:mm:ss" - then we'll convert it to absolute UTC
    const wallClockDate = new Date(`${finalDateStr}T${String(finalHours).padStart(2, '0')}:${String(finalMins).padStart(2, '0')}:00`);
    return convertWallClockToUTC(wallClockDate, timezone).toISOString();
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
    appConfig: AppSettings,
    leaves: LeaveRequest[]
) {
    const timezone = appConfig.timezone || 'Asia/Kolkata';
    let remainingMinutesToBlock = workDuration;
    let bufferRemaining = bufferDuration;
    let isWorkCompleted = false;
    let currentMinutes = startMinutes;
    
    const [y, m, d] = startDateISO.split('-').map(Number);
    const currentDate = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
    
    const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;

    let daysSearched = 0;
    while (remainingMinutesToBlock > 0 && daysSearched < 30) {
        let dateISO = currentDate.toISOString().split('T')[0];
        const intervals = getDayActiveIntervals(dateISO, appConfig, leaves);

        if (intervals.length === 0) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        const interval = intervals.find(i => i.endMin > currentMinutes);

        if (!interval) {
            currentDate.setUTCDate(currentDate.getUTCDate() + 1);
            currentMinutes = 0;
            daysSearched++;
            continue;
        }

        if (currentMinutes < interval.startMin) {
            currentMinutes = interval.startMin;
        }

        const minutesAvailable = interval.endMin - currentMinutes;
        const consume = Math.min(minutesAvailable, remainingMinutesToBlock);
        
        const segmentStart = currentMinutes;
        const segmentEnd = currentMinutes + consume;

        let slotStart = interval.startMin;
        while (slotStart < segmentEnd) {
            if (slotStart + slotInterval > segmentStart) {
                yield { dateISO, minutes: slotStart };
            }
            slotStart += slotInterval;
        }

        remainingMinutesToBlock -= consume;
        currentMinutes += consume;

        if (!isWorkCompleted && remainingMinutesToBlock <= 0) {
            isWorkCompleted = true;
            const bufferSpaceLeftInInterval = interval.endMin - currentMinutes;
            if (bufferSpaceLeftInInterval > 0) {
                remainingMinutesToBlock = Math.min(bufferRemaining, bufferSpaceLeftInInterval);
            } else {
                const nextInterval = intervals.find(i => i.startMin >= currentMinutes);
                if (nextInterval) {
                    currentMinutes = nextInterval.startMin;
                    const nextSpace = nextInterval.endMin - currentMinutes;
                    remainingMinutesToBlock = Math.min(bufferRemaining, nextSpace);
                } else {
                    remainingMinutesToBlock = 0;
                }
            }
        }

        if (currentMinutes >= interval.endMin) {
            if (isWorkCompleted && remainingMinutesToBlock <= 0) {
                break;
            }

            const hasMoreToday = intervals.some(i => i.startMin >= currentMinutes);
            if (!hasMoreToday) {
                currentDate.setUTCDate(currentDate.getUTCDate() + 1);
                currentMinutes = 0;
                daysSearched++;
            }
        }
    }
}

export async function POST(req: NextRequest) {
    try {
        const { selectedDate, cartEntries } = await req.json();

        if (!selectedDate || !cartEntries) {
            return NextResponse.json({ error: "Missing required parameters." }, { status: 400 });
        }

        // Fetch config first to get timezone
        const appConfigSnap = await adminDb.collection("webSettings").doc("applicationConfig").get();
        const appConfig = (appConfigSnap.exists ? appConfigSnap.data() : defaultAppSettings) as AppSettings;
        const timezone = appConfig.timezone || 'Asia/Kolkata';

        // Robust parsing: Extract "YYYY-MM-DD" part even if it's a full ISO string
        let dateStr = selectedDate;
        if (selectedDate.includes('T')) {
            dateStr = formatZonedDateToISO(new Date(selectedDate), timezone);
        }

        const dateParts = dateStr.split('-');
        if (dateParts.length < 3) {
            return NextResponse.json({ error: "Invalid date format. Expected YYYY-MM-DD." }, { status: 400 });
        }

        const y = parseInt(dateParts[0], 10);
        const m = parseInt(dateParts[1], 10);
        const d = parseInt(dateParts[2], 10);

        if (isNaN(y) || isNaN(m) || isNaN(d)) {
            return NextResponse.json({ error: "Invalid date components." }, { status: 400 });
        }

        const dateObj = new Date(Date.UTC(y, m - 1, d, 0, 0, 0)); 
        const dateISO = formatZonedDateToISO(dateObj, timezone);

        const lookBackDate = new Date(dateObj);
        lookBackDate.setDate(lookBackDate.getDate() - 7);
        const lookBackISO = formatZonedDateToISO(lookBackDate, timezone);

        const [limitsSnap, servicesSnap, subCatsSnap, bookingsSnap, leavesSnap] = await Promise.all([
            adminDb.collection("timeSlotCategoryLimits").get(),
            adminDb.collection("adminServices").get(),
            adminDb.collection("adminSubCategories").get(),
            adminDb.collection("bookings")
                .where("scheduledDate", ">=", lookBackISO)
                .where("scheduledDate", "<=", dateISO) 
                .get(),
            adminDb.collection("leaves")
                .where("endDate", ">=", lookBackISO)
                .get()
        ]);

        const limitsData = Object.fromEntries(limitsSnap.docs.map(doc => [doc.data().categoryId, { id: doc.id, ...doc.data() } as TimeSlotCategoryLimit]));
        const servicesData = Object.fromEntries(servicesSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreService]));
        const subCatsData = Object.fromEntries(subCatsSnap.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as FirestoreSubCategory]));
        const existingBookings = bookingsSnap.docs.map(doc => doc.data() as FirestoreBooking);
        const leavesData = leavesSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as LeaveRequest));

        const slotInterval = appConfig.timeSlotSettings?.slotIntervalMinutes || DEFAULT_SLOT_INTERVAL_MINUTES;
        const breakTimeMinutes = appConfig.timeSlotSettings?.breakTimeMinutes || 0;
        const enableLimitLateBookings = appConfig.enableLimitLateBookings ?? DEFAULT_ENABLE_LIMIT_LATE_BOOKINGS;
        const limitLateBookingHours = enableLimitLateBookings ? (appConfig.limitLateBookingHours ?? DEFAULT_HOURS_WHEN_LIMIT_ENABLED) : 0;

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
                    breakTimeMinutes,
                    appConfig,
                    leavesData
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

            if (BUSY_MAP_CACHE.size >= MAX_CACHE_SIZE) {
                const firstKey = BUSY_MAP_CACHE.keys().next().value;
                if (firstKey !== undefined) {
                    BUSY_MAP_CACHE.delete(firstKey);
                }
            }
            BUSY_MAP_CACHE.set(cacheKey, globalBusyMap);
        }
        // --- Cache Logic End ---

        // Check if selected date is fully blocked by a leave
        const selectedDateActiveLeaves = leavesData.filter(l => l.startDate <= dateISO && l.endDate >= dateISO);
        const hasFullDayLeave = selectedDateActiveLeaves.some(l => l.leaveType === 'full_day');
        if (hasFullDayLeave) {
            const leaveReason = selectedDateActiveLeaves.find(l => l.leaveType === 'full_day')?.reason || "Provider Leave / Holiday";
            return NextResponse.json({ isLeave: true, leaveReason, availableTimeSlots: [], totalCartDuration });
        }

        const activeIntervals = getDayActiveIntervals(dateISO, appConfig, leavesData);
        if (activeIntervals.length === 0) {
            return NextResponse.json({ availableTimeSlots: [], totalCartDuration });
        }

        const now = getZonedDate(new Date(), timezone);
        const earliestBookableTime = new Date(now.getTime() + (limitLateBookingHours * 60 * 60 * 1000));

        const availableSlots: { slot: string; remainingCapacity: number, endDateTime: string }[] = [];

        for (const interval of activeIntervals) {
            let potentialStart = interval.startMin;
            while (potentialStart < interval.endMin) {
                const slotDateTime = getZonedDate(new Date(selectedDate), timezone);
                slotDateTime.setHours(Math.floor(potentialStart / 60), potentialStart % 60, 0, 0);

                if (slotDateTime < earliestBookableTime) {
                    potentialStart += slotInterval;
                    continue;
                }

                // 🚨 MULTI-DAY SERVICE RESTRICTION
                const totalWorkingMinutesInDay = activeIntervals.reduce((acc, i) => acc + (i.endMin - i.startMin), 0);
                const dayStartMinutes = activeIntervals[0].startMin;

                if (totalCartDuration > totalWorkingMinutesInDay) {
                    if (potentialStart !== dayStartMinutes) {
                        potentialStart += slotInterval;
                        continue;
                    }
                }

                // 🚨 LONG SERVICE RESTRICTION (FULL-DAY FIX)
                const FULL_DAY_THRESHOLD = 6 * 60; // 6 hours
                let remainingMinutesToday = 0;
                for (const val of activeIntervals) {
                    if (potentialStart < val.endMin) {
                        const activeStart = Math.max(potentialStart, val.startMin);
                        remainingMinutesToday += (val.endMin - activeStart);
                    }
                }

                if (
                    totalCartDuration >= FULL_DAY_THRESHOLD &&
                    totalCartDuration <= totalWorkingMinutesInDay &&
                    remainingMinutesToday < totalCartDuration
                ) {
                    potentialStart += slotInterval;
                    continue;
                }

                let isPathClear = true;
                let minRemainingCapacity = Infinity;

                const pathSteps = Array.from( simulateProgression(dateISO, potentialStart, totalCartDuration, breakTimeMinutes, appConfig, leavesData) );
                if (pathSteps.length === 0) {
                    isPathClear = false;
                }
                
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
                    const endDateTime = calculateEndDateTime(dateISO, potentialStart, totalCartDuration, 0, appConfig, leavesData);
                    availableSlots.push({ 
                        slot: formatTimeFromMinutes(potentialStart), 
                        remainingCapacity: minRemainingCapacity,
                        endDateTime: endDateTime
                    });
                }

                potentialStart += slotInterval;
            }
        }

        return NextResponse.json({ availableTimeSlots: availableSlots, totalCartDuration });
    } catch (error) {
        console.error("Continuous Multi-day API Error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
