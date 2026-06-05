import { Wifi, Zap, Shield, Thermometer } from "lucide-react";

interface QuickStatsProps {
  stats?: {
    devicesOnline: number;
    energyUsage: string;
    securityStatus: string;
    temperature: number;
  };
}

export function QuickStats({ stats }: QuickStatsProps) {
  const defaultStats = {
    devicesOnline: 24,
    energyUsage: "1.2kW",
    securityStatus: "Secure",
    temperature: 72,
  };

  const currentStats = stats || defaultStats;

  const statCards = [
    {
      title: "Devices Online",
      value: currentStats.devicesOnline,
      icon: Wifi,
      color: "text-green-400",
      testId: "stat-devices-online",
    },
    {
      title: "Energy Usage",
      value: currentStats.energyUsage,
      icon: Zap,
      color: "text-yellow-400",
      testId: "stat-energy-usage",
    },
    {
      title: "Security Status",
      value: currentStats.securityStatus,
      icon: Shield,
      color: "text-green-400",
      testId: "stat-security-status",
    },
    {
      title: "Temperature",
      value: `${currentStats.temperature}°F`,
      icon: Thermometer,
      color: "text-blue-400",
      testId: "stat-temperature",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
      {statCards.map((stat) => {
        const Icon = stat.icon;
        return (
          <div key={stat.title} className="glass-card p-4 rounded-lg" data-testid={stat.testId}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">{stat.title}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>
                  {stat.value}
                </p>
              </div>
              <Icon className={`${stat.color} text-xl w-6 h-6`} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
