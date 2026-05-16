import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: 'up' | 'down';
}

export function StatCard({ label, value, icon: Icon, trend }: StatCardProps) {
  return (
    <div className="bg-ink-800 border border-border p-5 rounded-xl shadow-card-dark">
      <div className="flex justify-between items-start">
        <div className="p-2 bg-ink-700 rounded-lg border border-border-strong">
          <Icon className="w-5 h-5 text-cyan-500" />
        </div>
        {trend && (
          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
            trend === 'up' ? 'bg-success/20 text-success' : 'bg-danger/20 text-danger'
          }`}>
            {trend === 'up' ? '↑ Profit' : '↓ Loss'}
          </span>
        )}
      </div>
      <div className="mt-4">
        <p className="text-fg-muted text-sm font-medium">{label}</p>
        <h3 className="text-2xl font-display font-bold text-fg">{value}</h3>
      </div>
    </div>
  );
}
