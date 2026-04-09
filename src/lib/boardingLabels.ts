/** Room wing → boarding kind (DB still uses wing `cattery` for cat rooms). */

export function isCatBoardingWing(wing: string | null | undefined): boolean {
  return wing === "cattery";
}

/** Table / UI label for a stay row */
export function boardingServiceLabel(wing: string | null | undefined): string {
  return isCatBoardingWing(wing) ? "Cat boarding" : "Dog boarding";
}

/** Link to Boarding page; cat stays scroll to the cat section */
export function boardingCalendarTo(wing: string | null | undefined): string {
  return isCatBoardingWing(wing) ? "/boarding#cat-boarding" : "/boarding";
}

export const CAT_BOARDING_SECTION_ID = "cat-boarding";
