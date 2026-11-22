/** A card in the middle of space: a universe-wide problem and the exact next step (spec section 9). */
export function Card({ title, hint, snippet }: { title: string; hint: string; snippet?: string }) {
  return (
    <div className="notice" role="alert" data-chrome>
      <h2>{title}</h2>
      <p>{hint}</p>
      {snippet && <pre className="snippet"><code>{snippet}</code></pre>}
    </div>
  );
}
