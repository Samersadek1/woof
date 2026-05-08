/** Label for picker row — never persist this string as `vet_name`; opens custom entry instead. */
export const ADD_CUSTOM_VET_CLINIC_OPTION = "+ Add custom vet clinic" as const;

const RAW = `Advanced Pet Clinic, Al Barsha, AL Canary Veterinary Clinic, Al Falah Veterinary Clinic, Al Jawareh Vet Clinic, Al Maha Vet Clinic, Al Nawadir Vet LLC, AL Oropi Veterinary Clinic Sharjah, Al Qouz Vet Hospital, AL RAHA VET CLINIC, Al Rayan Vet Clinic, Al Safa Veterinary Clinic, Al Tareeq Vet Clinic, American Veterinary Clinic, Amity Veterinary Clinic, Amore Vet Clinic, Animal Planet Clinic, Animal Recovery Veterinary Referral, Animal Specialist Clinic, Anubis Vet Clinic, Arabian Ranches Polo Club, Australian Veterinary Clinic, Australian Veterinary Hospital, Axiom Vet Lab Ltd, Blue Oasis Veterinary Clinic, British Veterinary Centre, British Veterinary Hospital, BVC Clinic, Canadian Veterinary Clinic, Cardio Vet Veterinary Clinic, City Vet Clinic, Cloud 9, Craighall Vet Hosp CNR Buckingham, Creekside Vet Clinic, Culverden Vet Group, Deira Vet Clinic, DKC Veterinary Clinic, Dodteur Venerinaire, Dog Venturez Vet Clinic, Dolphin Veterinary Clinic, Dreamers Vet Clinic, Dreamers Veterinary Clinic LLC, Dr. Elizabeth, Dr. Paulina Vet Care Polo Club, Dr Rami Mdawar Vet, Dr. Reza Sadeghi, Dr. Samir Vet Clinic, Dr. Well Vet Clinic, Dubai Hills Vet, Dubai Municipality Veterinary Clinic, Dubai Veterinary Hospital, Emirates Veterinary Clinic/Center, Energetic Panacea Veterinary Clinic, European Veterinary Center, EuroPet Sharjah, Europets Veterinary Hospital, Falcon Hospital Abu Dhabi, German Veterinary Clinic, Harmony Vet Clinic, Hills Vet, Hub Pet Clinic, International Veterinary Hospital, Intervet Vet Clinic, Jet Pets Animal Transport, Karas Vet Clinic, Kare Vet Clinic, Little Hearts Veterinary Clinic, Lucky Veterinary Clinic, Magdalena Vet, Matts Veterinary Clinic, Mike's Vet, Modern Veterinary Clinic, My Second Home Dubai, My Vet is not listed, N/A, Nad Al Shiba Veterinary Hospital, Noble Veterinary Clinic, Ohmer Kabbi Vet, Orthopedic Veterinary Clinic LLC, PANACEA, Pawsitive Vet, Pawsome Place, Perfect Dose Veterinary, Pet Board, Pet Bond, Petbook Veterinary Clinic, Pet Connection Veterinary Clinic, Pet First Veterinary Clinic, PET FRIENDS VET CLINIC, Pet Land Veterinary Clinic, Pet Lovers Veterinary Clinic, Petology, Pet Point, Pet Pulse Vet, Pets Avenue, Pets Health, Pets Heaven Veterinary Clinic, Pets Society, Pets Station, Pets & Us Veterinary Clinic, Petzone Veterinary Clinic, Provet Clinic, QV Lucinda, Rak Animal Welfare Centre Fze, Royal Vet Clinic, Royal Veterinary Center, RUSTY VETERINARY CLINIC, SABB, Salamak Veterinary Clinic, SAMIR VET CLINIC, SAVET TERRITORY VET CLINIC, South Boston, Star Vet Clinic, The Cat Vet, The City Vet Clinic, The Equine and Small Animal Surgery, The Hills Veterinary Clinic, The Pet House Vet Clinic, The Veterinary Hospital, TWEED HOUSE VETERINARY SURGERY, Two Feet Four Paws Veterinary Clinic, Umm Sequiem Vet Clinic, Umm Suqeim Veterinary Clinic, UNKNOWN, US Vet Center, VACCICHECK DONE AT JVC EXP, VCT Veterinary Clinic, Vetcare Veterinary Medical Centre, Vet Dub FZ LLC, VETERNINARY CLINIC LLC, Vet Plus, Vet Plus Dubai, Vets24 Vet Clinic LLC, Vets For Pets Veterinary Clinic, Vets & Pets, Vienna Veterinary Clinic, Whiskers & Wags Veterinary Clinic, Zabeel Veterinary Hospital Dubai`;

function parseClinics(raw: string): readonly string[] {
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

/** Fallback when `vet_clinics` is empty or unavailable (bundle defaults). */
export const VET_CLINICS = parseClinics(RAW);
