import React from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon?: React.ReactNode; // O '?' torna o ícone opcional
  colorClass?: string;    // Agora o TypeScript sabe que colorClass existe
}

export function StatCard({ label, value, icon, colorClass = "text-white" }: StatCardProps) {
  return (
    <div className="bg-[#0F0F1A] border border-[#1F1F2E] p-6 rounded-2xl flex items-start justify-between">
      <div>
        <p className="text-gray-500 text-sm mb-1">{label}</p>
        <h3 className={`text-2xl font-bold ${colorClass}`}>{value}</h3>
      </div>
      {icon && <div className="text-gray-600">{icon}</div>}
    </div>
  );
}
