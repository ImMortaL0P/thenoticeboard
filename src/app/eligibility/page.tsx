import { ComingSoon } from "@/components/ComingSoon";

export default function Page() {
  return (
    <ComingSoon title="Eligibility checker" phase="Phase 2">
      Enter date of birth, category, PwBD/ex-servicemen, qualification, stream and experience to see which open notices you
      can apply for, with reasons for the rest. The logic already exists in <code>src/lib/domain.ts</code> (checkEligibility).
    </ComingSoon>
  );
}
