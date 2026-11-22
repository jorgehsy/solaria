/** A card in the middle of space (WebGL missing, and later the error states of slice 7). */
export function Notice({ title, text }: { title: string; text: string }) {
  return (
    <div className="notice" role="alert" data-chrome>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
