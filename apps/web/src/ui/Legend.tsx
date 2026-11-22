import { S } from "./strings.ts";

export function Legend() {
  const L = S.legend;
  return (
    <ul className="legend" aria-label={L.aria}>
      <li><span className="g g-sun" aria-hidden="true" />{L.map}</li>
      <li><span className="g g-todo" aria-hidden="true" />{L.todo}</li>
      <li><span className="g g-doing" aria-hidden="true" />{L.draftPr}</li>
      <li><span className="g g-blocked" aria-hidden="true" />{L.blocked}</li>
      <li><span className="g g-review" aria-hidden="true" />{L.inReview}</li>
      <li><span className="g g-sat" aria-hidden="true" />{L.assigned}</li>
      <li><span className="g g-gas" aria-hidden="true" />{L.gas}</li>
    </ul>
  );
}
