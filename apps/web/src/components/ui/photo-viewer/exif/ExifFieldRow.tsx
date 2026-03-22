interface ExifFieldRowProps {
  label: string
  value: string
}

export const ExifFieldRow = ({ label, value }: ExifFieldRowProps) => (
  <div className="flex items-center justify-between border-b border-white/15 py-2 last:border-b-0">
    <span className="max-w-[45%] min-w-0 flex-shrink-0 self-start pr-4 text-sm font-medium break-words text-white/70">
      {label}
    </span>
    <span className="max-w-[55%] min-w-0 text-right font-mono text-sm break-words text-white/95">{value}</span>
  </div>
)
