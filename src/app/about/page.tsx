export const metadata = { title: "About" };

export default function About() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 text-sm leading-relaxed">
      <h1 className="text-2xl font-bold">About thenoticeboard</h1>
      <p>
        thenoticeboard collects recruitment notifications from official government, PSU, banking, railway, defence and state
        public service commission websites, plus verified private employers, and shows them in one place with the facts that
        matter: last date, fees, vacancies, eligibility and official download links.
      </p>
      <p>
        Notices are found automatically by checking official sources every few hours, then reviewed by a person before they are
        published. Every notice links back to its official source.
      </p>
      <p className="font-medium">Always verify details in the official notification before applying.</p>
    </article>
  );
}
