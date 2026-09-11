import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-md p-8 text-center">
      <h1 className="text-xl font-bold">Page not found</h1>
      <Link href="/" className="btn btn-primary mt-4">Back to notice board</Link>
    </div>
  );
}
