/** Mirrors `woof_dog_room_load` — unknown size counts as medium (2). */
export function woofDogRoomLoad(size: string | null | undefined): number {
  switch ((size ?? "").toLowerCase()) {
    case "small":
    case "s":
      return 1;
    case "medium":
    case "m":
      return 2;
    case "large":
    case "l":
    case "xl":
      return 3;
    default:
      return 2;
  }
}
