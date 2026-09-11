import type { User } from "@prisma/client";
import type { EligibilityInput } from "@/lib/domain";

export function profileToInput(u: User | null | undefined): EligibilityInput | null {
  if (!u || (!u.dob && !u.highestQualification)) return null;
  return {
    dob: u.dob,
    category: u.category,
    gender: u.gender,
    pwbd: u.pwbd,
    exServicemen: u.exServicemen,
    qualification: u.highestQualification,
    stream: u.stream,
    experienceYears: u.experienceYears,
  };
}
