import { Sidebar } from "@/components/sidebar";
import { QuickStats } from "@/components/quick-stats";
import { RoomCard } from "@/components/room-card";
import { SecurityPanel } from "@/components/security-panel";
import { VoiceAIInterface } from "@/components/voice-ai-interface";
import { useWebSocket } from "@/hooks/use-websocket";
import { useQuery } from "@tanstack/react-query";
import { Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceAI } from "@/hooks/use-voice-ai";

export default function Dashboard() {
  const { isConnected } = useWebSocket();
  const { isListening, toggleListening } = useVoiceAI();

  const { data: rooms = [], isLoading: roomsLoading } = useQuery<any[]>({
    queryKey: ["/api/rooms"],
  });

  const { data: dashboardStats } = useQuery<{
    devicesOnline: number;
    totalDevices: number;
    energyUsage: string;
    securityStatus: string;
    temperature: number;
  }>({
    queryKey: ["/api/dashboard/stats"],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <Sidebar />
      
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="bg-card border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Good Evening, Alex</h2>
              <p className="text-muted-foreground">
                {new Date().toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} • {new Date().toLocaleTimeString('en-US', {
                  hour: 'numeric',
                  minute: '2-digit',
                  hour12: true
                })}
              </p>
            </div>
            
            {/* Voice AI Controls */}
            <div className="flex items-center space-x-4">
              <div className="glass-card px-4 py-2 rounded-lg flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 security-indicator' : 'bg-red-500'}`} />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'AI Assistant Active' : 'AI Assistant Offline'}
                </span>
              </div>
              
              <Button
                onClick={toggleListening}
                className={`p-3 rounded-lg transition-colors ${
                  isListening 
                    ? 'bg-red-500 hover:bg-red-600 text-white voice-wave' 
                    : 'bg-primary hover:bg-blue-600 text-primary-foreground'
                }`}
                data-testid="button-voice-toggle"
              >
                {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-6">
            
            {/* Connection Status */}
            {!isConnected && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                <div className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-destructive rounded-full" />
                  <span className="text-sm text-destructive">
                    Real-time connection lost. Some features may be limited.
                  </span>
                </div>
              </div>
            )}

            {/* Quick Stats */}
            <QuickStats stats={dashboardStats} />

            {/* Room Controls */}
            <div className="space-y-4">
              <h3 className="text-xl font-semibold">Room Controls</h3>
              
              {roomsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="glass-card p-6 rounded-xl animate-pulse">
                      <div className="h-20 bg-secondary rounded mb-4" />
                      <div className="space-y-2">
                        <div className="h-4 bg-secondary rounded w-3/4" />
                        <div className="h-4 bg-secondary rounded w-1/2" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {rooms?.map((room: any) => (
                    <RoomCard key={room.id} room={room} />
                  ))}
                </div>
              )}
            </div>

            {/* Security Panel */}
            <SecurityPanel />

            {/* Voice AI Interface */}
            <VoiceAIInterface />

          </div>
        </main>
      </div>
    </div>
  );
}
