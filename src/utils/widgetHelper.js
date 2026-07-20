import { MyWidget } from '../components/Widget';

/**
 * Calculates and schedules the timeline for the Home Screen widget based on Namaz timings.
 * @param {object} timings The prayer timings object containing { Fajr, Dhuhr, Asr, Maghrib, Isha }
 */
export function updatePrayerWidget(timings) {
  try {
    if (!timings || !timings.Fajr) {
      console.log("[WidgetHelper] Invalid timings passed to updatePrayerWidget");
      return;
    }

    const createDateForTime = (timeStr) => {
      const [h, m] = timeStr.split(':').map(Number);
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    };

    const fajrDate = createDateForTime(timings.Fajr);
    const dhuhrDate = createDateForTime(timings.Dhuhr);
    const asrDate = createDateForTime(timings.Asr);
    const maghribDate = createDateForTime(timings.Maghrib);
    const ishaDate = createDateForTime(timings.Isha);

    // Create the timeline entries for today.
    // Each entry specifies the start date for a prayer's active state.
    // For example, when Fajr starts, the active prayer is "Fajr".
    // Between Midnight and Fajr, and after Isha, the active prayer is "Isha".
    
    const timelineEntries = [
      // 1. Fajr Start
      {
        date: fajrDate,
        props: {
          timings,
          activePrayer: "Fajr"
        }
      },
      // 2. Dhuhr Start
      {
        date: dhuhrDate,
        props: {
          timings,
          activePrayer: "Dhuhr"
        }
      },
      // 3. Asr Start
      {
        date: asrDate,
        props: {
          timings,
          activePrayer: "Asr"
        }
      },
      // 4. Maghrib Start
      {
        date: maghribDate,
        props: {
          timings,
          activePrayer: "Maghrib"
        }
      },
      // 5. Isha Start
      {
        date: ishaDate,
        props: {
          timings,
          activePrayer: "Isha"
        }
      }
    ];

    // Add an immediate snapshot update first to make sure the widget displays the correct initial state.
    const now = new Date();
    let currentActive = "Isha";
    if (now >= fajrDate && now < dhuhrDate) {
      currentActive = "Fajr";
    } else if (now >= dhuhrDate && now < asrDate) {
      currentActive = "Dhuhr";
    } else if (now >= asrDate && now < maghribDate) {
      currentActive = "Asr";
    } else if (now >= maghribDate && now < ishaDate) {
      currentActive = "Maghrib";
    }

    // Commented out to prevent overriding the Voice Chat widget state
    /*
    MyWidget.updateSnapshot({
      timings,
      activePrayer: currentActive
    });

    // Schedule the full timeline
    MyWidget.updateTimeline(timelineEntries);
    console.log("[WidgetHelper] Widget updated successfully with timeline entries.");
    */
  } catch (error) {
    console.error("[WidgetHelper] Failed to update widget timeline:", error);
  }
}
