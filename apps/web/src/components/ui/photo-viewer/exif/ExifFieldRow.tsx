import "../Exif.css";

interface ExifFieldRowProps {
  label: string;
  value: string;
}

export const ExifFieldRow = ({ label, value }: ExifFieldRowProps) => (
  <dl className="af-exif-row af-exif-row-raw border-ui-border border-b last:border-b-0">
    <dt className="af-exif-label">{label}</dt>
    <dd className="af-exif-value font-mono">{value}</dd>
  </dl>
);
