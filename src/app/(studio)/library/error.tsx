"use client";

import { RefreshCw } from "lucide-react";

export default function LibraryError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="library-page">
      <section className="library-recovery" role="alert">
        <h1>Library unavailable</h1>
        <p>Your models could not be loaded. Try again in a moment.</p>
        <button className="primary-button" type="button" onClick={retry}>
          <RefreshCw size={16} aria-hidden="true" /> Retry
        </button>
      </section>
    </main>
  );
}
