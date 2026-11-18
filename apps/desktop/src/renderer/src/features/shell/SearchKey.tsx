export function SearchKey({ label }: { readonly label: string }) {
  return (
    <kbd className="srch-key" aria-hidden="true">
      {label}
    </kbd>
  );
}
