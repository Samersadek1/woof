/** Legacy cat-boarding wing — retired from woof; exclude from dog boarding UI and reports. */
export const RETIRED_CATTERY_WING = "cattery" as const;

export function isRetiredCatteryWing(wing: string | null | undefined): boolean {
  return wing === RETIRED_CATTERY_WING;
}
