import { 
  Home, 
  DoorOpen, 
  Shield, 
  Bot, 
  BarChart3, 
  Settings, 
  User 
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "#", icon: Home, active: true },
  { name: "Rooms", href: "#", icon: DoorOpen, active: false },
  { name: "Security", href: "#", icon: Shield, active: false },
  { name: "AI Assistant", href: "#", icon: Bot, active: false },
  { name: "Analytics", href: "#", icon: BarChart3, active: false },
  { name: "Settings", href: "#", icon: Settings, active: false },
];

export function Sidebar() {
  return (
    <div className="w-64 bg-card border-r border-border flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Home className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">SmartHome AI</h1>
            <p className="text-xs text-muted-foreground">Connected & Secure</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.name}
              href={item.href}
              className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors nav-item ${
                item.active 
                  ? 'bg-primary text-primary-foreground' 
                  : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
              }`}
              data-testid={`nav-${item.name.toLowerCase().replace(' ', '-')}`}
            >
              <Icon className="w-5 h-5" />
              <span>{item.name}</span>
            </a>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center space-x-3">
          <div className="relative">
            <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-background" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">Alex Johnson</p>
            <p className="text-xs text-muted-foreground">Face ID Active</p>
          </div>
        </div>
      </div>
    </div>
  );
}
