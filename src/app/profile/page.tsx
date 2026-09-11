import { requireUser } from "@/lib/auth";
import { ComingSoon } from "@/components/ComingSoon";

export default async function Page() {
  const user = await requireUser("/profile");
  return (
    <ComingSoon title={`Profile — ${user.email}`} phase="Phase 2">
      Profile form (DOB, category, qualification, stream, experience, state, preferred sectors), saved notices and
      Telegram connect. Once filled, every card on the board shows an Eligible / Not eligible chip.
    </ComingSoon>
  );
}
