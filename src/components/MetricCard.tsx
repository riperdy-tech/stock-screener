import clsx from "clsx";

interface MetricCardProps {
    label: string;
    value: string | number;
    subValue?: string;
    status?: "neutral" | "success" | "warning" | "danger";
    className?: string;
}

export function MetricCard({ label, value, subValue, status = "neutral", className }: MetricCardProps) {
    const statusColors = {
        neutral: "bg-secondary text-secondary-foreground border-border",
        success: "bg-success/10 text-success border-success/20",
        warning: "bg-warning/10 text-warning border-warning/20",
        danger: "bg-danger/10 text-danger border-danger/20",
    };

    return (
        <div className={clsx("p-4 rounded-lg border", statusColors[status], className)}>
            <div className="text-sm opacity-80">{label}</div>
            <div className="text-2xl font-bold mt-1">{value}</div>
            {subValue && <div className="text-xs mt-1 opacity-70">{subValue}</div>}
        </div>
    );
}
