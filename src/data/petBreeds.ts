import s1a from "./breeds/s1a.txt?raw";
import s1b from "./breeds/s1b.txt?raw";
import s2 from "./breeds/s2.txt?raw";
import s3 from "./breeds/s3.txt?raw";
import s4 from "./breeds/s4.txt?raw";

/** Verbatim clinic master list (deduped by exact string, order preserved). */
function parseBreeds(raw: string): readonly string[] {
  const parts = raw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

const RAW = [s1a, s1b, s2, s3, s4].map((s) => s.trim()).join("");

export const PET_BREEDS = parseBreeds(RAW);
export const PET_BREEDS_SET = new Set<string>(PET_BREEDS);
