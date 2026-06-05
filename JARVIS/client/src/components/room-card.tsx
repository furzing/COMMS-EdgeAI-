import { 
  Lightbulb, 
  Tv, 
  Wind, 
  Thermometer,
  Moon,
  Utensils,
  Sofa,
  Bed,
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { useDeviceControl } from "@/hooks/use-device-control";
import type { Room } from "@shared/schema";

interface RoomCardProps {
  room: Room;
}

const roomIcons = {
  living_room: Sofa,
  bedroom: Bed,
  kitchen: Utensils,
  bathroom: Wind,
  office: Thermometer,
};

const roomColors = {
  orange: "bg-orange-500/20 text-orange-400",
  purple: "bg-purple-500/20 text-purple-400",
  green: "bg-green-500/20 text-green-400",
  blue: "bg-blue-500/20 text-blue-400",
  red: "bg-red-500/20 text-red-400",
};

export function RoomCard({ room }: RoomCardProps) {
  const { controlDevice } = useDeviceControl();
  
  const { data: devices = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/rooms", room.id, "devices"],
  });

  const RoomIcon = roomIcons[room.type as keyof typeof roomIcons] || Sofa;
  const iconColorClass = roomColors[room.iconColor as keyof typeof roomColors] || roomColors.blue;

  const handleDeviceToggle = async (deviceId: string, currentState: boolean) => {
    try {
      await controlDevice(deviceId, {
        deviceId,
        action: 'toggle',
        value: !currentState
      });
    } catch (error) {
      console.error('Failed to toggle device:', error);
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'light': return Lightbulb;
      case 'tv': return Tv;
      case 'fan': return Wind;
      case 'thermostat': return Thermometer;
      default: return MoreHorizontal;
    }
  };

  const getDeviceColor = (type: string) => {
    switch (type) {
      case 'light': return 'text-yellow-400';
      case 'tv': return 'text-blue-400';
      case 'fan': return 'text-cyan-400';
      case 'thermostat': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <div className="glass-card p-6 rounded-xl room-card" data-testid={`room-card-${room.id}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColorClass}`}>
            <RoomIcon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold" data-testid={`room-name-${room.id}`}>{room.name}</h3>
            <p className="text-sm text-muted-foreground">{room.deviceCount} devices</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-muted-foreground" data-testid={`room-temp-${room.id}`}>
            {room.temperature}°F
          </p>
          <div className="flex items-center space-x-1">
            <div className={`w-2 h-2 rounded-full ${room.isOnline ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className={`text-xs ${room.isOnline ? 'text-green-400' : 'text-red-400'}`}>
              {room.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between animate-pulse">
              <div className="h-4 bg-secondary rounded w-1/2" />
              <div className="h-6 bg-secondary rounded w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {devices?.slice(0, 3).map((device: any) => {
            const DeviceIcon = getDeviceIcon(device.type);
            const deviceColor = getDeviceColor(device.type);
            
            return (
              <div key={device.id} className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <DeviceIcon className={`w-4 h-4 ${deviceColor}`} />
                  <span className="text-sm" data-testid={`device-name-${device.id}`}>
                    {device.name}
                  </span>
                </div>
                
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDeviceToggle(device.id, device.isActive)}
                  className={`toggle-switch w-12 h-6 p-0 rounded-full transition-all ${
                    device.isActive 
                      ? 'device-toggle active' 
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                  data-testid={`device-toggle-${device.id}`}
                >
                  <div className={`toggle-circle w-4 h-4 bg-white rounded-full transition-transform ${
                    device.isActive ? 'transform translate-x-6' : ''
                  }`} />
                </Button>
              </div>
            );
          })}
          
          {devices && Array.isArray(devices) && devices.length > 3 && (
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                View all {Array.isArray(devices) ? devices.length : 0} devices
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
