/** Heading + one-line caption for a group of charts -- the caption says what
 * the reader should take away, since a chart title alone rarely does. */
export function SectionHeader({ title, caption }: { title: string; caption?: string }) {
  return (
    <div className="mb-2 mt-6 first:mt-0">
      <h2 className="font-display text-lg font-medium text-parchment">{title}</h2>
      {caption && <p className="mt-0.5 text-sm text-seafoam-dim">{caption}</p>}
    </div>
  );
}
