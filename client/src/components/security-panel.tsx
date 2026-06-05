import { Shield, Camera, Lock, Eye, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";

export function SecurityPanel() {
  const { data: securityEvents = [] } = useQuery<any[]>({
    queryKey: ["/api/security/events"],
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const cameras = [
    {
      id: "front-door",
      name: "Front Door",
      status: "live",
      image: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
    },
    {
      id: "backyard", 
      name: "Backyard",
      status: "live",
      image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?ixlib=rb-4.0.3&auto=format&fit=crop&w=400&h=200"
    }
  ];

  const doorSensors = [
    { id: "front-door", name: "Front Door", status: "closed", icon: Lock },
    { id: "back-door", name: "Back Door", status: "closed", icon: Lock },
    { id: "garage", name: "Garage", status: "closed", icon: Lock }
  ];

  const motionSensors = [
    { id: "living-room", name: "Living Room", status: "clear" },
    { id: "kitchen", name: "Kitchen", status: "clear" },
    { id: "hallway", name: "Hallway", status: "clear" }
  ];

  const smartLocks = [
    { id: "front-door-lock", name: "Front Door", status: "locked", locked: true },
    { id: "back-door-lock", name: "Back Door", status: "locked", locked: true },
    { id: "garage-lock", name: "Garage", status: "unlocked", locked: false }
  ];

  return (
    <div className="glass-card p-6 rounded-xl mb-8" data-testid="security-panel">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
            <Shield className="w-5 h-5 text-red-400" />
          </div>
          <h3 className="text-xl font-semibold">Security System</h3>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-400 rounded-full security-indicator" />
          <span className="text-green-400 font-medium">Armed - Home</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Camera Feeds */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">CAMERA FEEDS</h4>
          {cameras.map((camera) => (
            <div key={camera.id} className="relative bg-secondary rounded-lg overflow-hidden">
              <img 
                src={camera.image} 
                alt={`${camera.name} camera view`}
                className="w-full h-24 object-cover"
                data-testid={`camera-${camera.id}`}
              />
              <div className="absolute top-2 left-2 flex items-center space-x-1">
                <div className="w-2 h-2 bg-red-400 rounded-full security-indicator" />
                <span className="text-xs text-white font-medium">LIVE</span>
              </div>
              <div className="absolute bottom-2 left-2">
                <span className="text-xs text-white bg-black/50 px-2 py-1 rounded">
                  {camera.name}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Door Sensors */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">DOOR SENSORS</h4>
          <div className="space-y-2">
            {doorSensors.map((sensor) => {
              const Icon = sensor.icon;
              return (
                <div key={sensor.id} className="flex items-center justify-between bg-secondary p-3 rounded-lg">
                  <div className="flex items-center space-x-2">
                    <Icon className="w-4 h-4 text-green-400" />
                    <span className="text-sm">{sensor.name}</span>
                  </div>
                  <Badge variant="outline" className="text-green-400 border-green-400">
                    {sensor.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>

        {/* Motion Sensors */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">MOTION SENSORS</h4>
          <div className="space-y-2">
            {motionSensors.map((sensor) => (
              <div key={sensor.id} className="flex items-center justify-between bg-secondary p-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Eye className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm">{sensor.name}</span>
                </div>
                <Badge variant="outline">
                  {sensor.status}
                </Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Smart Locks */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-muted-foreground">SMART LOCKS</h4>
          <div className="space-y-2">
            {smartLocks.map((lock) => (
              <div key={lock.id} className="flex items-center justify-between bg-secondary p-3 rounded-lg">
                <div className="flex items-center space-x-2">
                  <Lock className={`w-4 h-4 ${lock.locked ? 'text-green-400' : 'text-yellow-400'}`} />
                  <span className="text-sm">{lock.name}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className={`text-xs ${lock.locked ? 'text-green-400 hover:text-green-300' : 'text-yellow-400 hover:text-yellow-300'}`}
                  data-testid={`lock-toggle-${lock.id}`}
                >
                  {lock.status}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Security Events */}
      {securityEvents && Array.isArray(securityEvents) && securityEvents.length > 0 && (
        <div className="mt-6 pt-6 border-t border-border">
          <h4 className="font-medium text-sm text-muted-foreground mb-3">RECENT EVENTS</h4>
          <div className="space-y-2">
            {securityEvents.slice(0, 3).map((event: any) => (
              <div key={event.id} className="flex items-center space-x-3 p-3 bg-secondary rounded-lg">
                <AlertTriangle className={`w-4 h-4 ${
                  event.severity === 'critical' ? 'text-red-400' : 
                  event.severity === 'warning' ? 'text-yellow-400' : 
                  'text-blue-400'
                }`} />
                <div className="flex-1">
                  <p className="text-sm">{event.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
                {!event.acknowledged && (
                  <Button variant="ghost" size="sm" className="text-xs">
                    Acknowledge
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
