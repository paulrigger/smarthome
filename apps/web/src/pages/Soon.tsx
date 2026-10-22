export function Soon({ title, text }: { title: string; text: string }) {
  return (
    <div className="soon">
      <h1>{title}</h1>
      <p>{text}</p>
    </div>
  );
}
