export default function Spinner({ label }: { label: string }) {
  return (
    <div className="spinner" role="status">
      <span className="loader" aria-hidden="true"></span>
      <span>{label}</span>
    </div>
  );
}
