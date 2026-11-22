/** A card in space: a universe-wide problem and the exact next step (spec section 9). Rate limit parks top-centre. */
export function Card({ title, hint, snippet, place = "centre" }: { title: string; hint: string; snippet?: string; place?: "centre" | "top" }) {
  return (
    <div className={place === "top" ? "notice notice-top" : "notice"} role="alert" data-chrome>
      <h2>{title}</h2>
      <p>{hint}</p>
      {snippet && <pre className="snippet"><code>{snippet}</code></pre>}
    </div>
  );
}
