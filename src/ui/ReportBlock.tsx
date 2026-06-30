import { BarList } from "./BarList";

interface ReportBlockProps {
  title: string;
  data: Record<string, number>;
}

export function ReportBlock({ title, data }: ReportBlockProps) {
  return (
    <div className="report-block">
      <h3>{title}</h3>
      <BarList data={data} emptyLabel="No report data yet." />
    </div>
  );
}
