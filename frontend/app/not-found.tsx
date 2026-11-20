import Link from 'next/link';

export default function NotFound() {
  return (
    <main id="main" className="mx-auto max-w-2xl space-y-3 px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Page not found</h1>
      <p className="text-sm text-slate-600">The page you are looking for does not exist or has moved.</p>
      <Link href="/" className="inline-block font-semibold text-teal-800 underline">Back to the marketplace</Link>
    </main>
  );
}
