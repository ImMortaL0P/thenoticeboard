export const metadata = { title: "Contact" };

export default function Contact() {
  return (
    <article className="mx-auto max-w-2xl space-y-4 text-sm">
      <h1 className="text-2xl font-bold">Contact us</h1>
      <p>Spotted an error in a notice, or want your organisation listed? Write to us.</p>
      <p>
        Email: <a className="text-primary hover:underline" href="mailto:hello@thenoticeboard.in">hello@thenoticeboard.in</a>{" "}
        <span className="text-muted-foreground">(placeholder - replace with your address)</span>
      </p>
    </article>
  );
}
