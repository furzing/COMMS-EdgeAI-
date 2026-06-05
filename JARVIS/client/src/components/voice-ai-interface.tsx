import { Bot, Mic, Square, VolumeX, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceAI } from "@/hooks/use-voice-ai";
import { useQuery } from "@tanstack/react-query";

export function VoiceAIInterface() {
  const { 
    isListening, 
    isProcessing, 
    isConnected,
    startListening, 
    stopListening,
    muteResponse 
  } = useVoiceAI();

  const { data: voiceCommands = [] } = useQuery<any[]>({
    queryKey: ["/api/voice/commands", "demo-user-id"],
    refetchInterval: 5000,
  });

  const recentCommands = [
    {
      id: 1,
      type: "user",
      message: "Turn off the living room lights",
      timestamp: "2 minutes ago",
      success: true
    },
    {
      id: 2,
      type: "ai",
      message: "Living room lights turned off. Energy saving mode activated.",
      timestamp: "2 minutes ago"
    },
    {
      id: 3,
      type: "user", 
      message: "Set bedroom temperature to 68 degrees",
      timestamp: "5 minutes ago",
      success: true
    }
  ];

  return (
    <div className="glass-card p-6 rounded-xl" data-testid="voice-ai-interface">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-br from-primary to-accent rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h3 className="text-xl font-semibold">AI Assistant</h3>
            <p className="text-sm text-muted-foreground">Voice-to-Voice Control</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? 'Connected to OpenAI' : 'Disconnected'}
          </span>
        </div>
      </div>

      {/* Voice Visualization */}
      <div className="bg-secondary rounded-xl p-6 mb-4">
        <div className="voice-visualization mb-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`voice-bar ${isListening || isProcessing ? 'animate-voice-wave' : ''}`}
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <p className="text-center text-muted-foreground text-sm">
          {isListening 
            ? "Listening..." 
            : isProcessing 
            ? "Processing command..." 
            : 'Say "Hey Home" to activate voice control'
          }
        </p>
      </div>

      {/* Recent Commands */}
      <div className="space-y-3 mb-6">
        <h4 className="font-medium text-sm text-muted-foreground">RECENT COMMANDS</h4>
        
        {voiceCommands && Array.isArray(voiceCommands) && voiceCommands.length > 0 ? (
          <div className="space-y-3">
            {voiceCommands.slice(0, 3).map((cmd: any) => (
              <div key={cmd.id} className="space-y-2">
                <div className="flex items-start space-x-3 p-3 bg-secondary rounded-lg">
                  <User className="w-4 h-4 text-blue-400 mt-1" />
                  <div className="flex-1">
                    <p className="text-sm">{cmd.command}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(cmd.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className={`w-2 h-2 rounded-full mt-2 ${cmd.success ? 'bg-green-400' : 'bg-red-400'}`} />
                </div>
                
                {cmd.response && (
                  <div className="flex items-start space-x-3 p-3 bg-secondary rounded-lg">
                    <Bot className="w-4 h-4 text-green-400 mt-1" />
                    <div className="flex-1">
                      <p className="text-sm">{cmd.response}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(cmd.createdAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {recentCommands.map((cmd) => (
              <div key={cmd.id} className="flex items-start space-x-3 p-3 bg-secondary rounded-lg">
                {cmd.type === 'user' ? (
                  <User className="w-4 h-4 text-blue-400 mt-1" />
                ) : (
                  <Bot className="w-4 h-4 text-green-400 mt-1" />
                )}
                <div className="flex-1">
                  <p className="text-sm">{cmd.message}</p>
                  <p className="text-xs text-muted-foreground">{cmd.timestamp}</p>
                </div>
                {cmd.type === 'user' && cmd.success && (
                  <div className="w-2 h-2 bg-green-400 rounded-full mt-2" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Voice Controls */}
      <div className="flex items-center justify-center space-x-4">
        <Button
          onClick={stopListening}
          disabled={!isListening}
          variant="destructive"
          className="px-4 py-2"
          data-testid="button-stop-listening"
        >
          <Square className="w-4 h-4 mr-2" />
          Stop
        </Button>
        
        <Button
          onClick={startListening}
          disabled={isListening || isProcessing}
          className={`px-6 py-3 ${isListening ? 'voice-wave' : ''}`}
          data-testid="button-start-listening"
        >
          <Mic className="w-4 h-4 mr-2" />
          {isListening ? 'Listening...' : 'Start Listening'}
        </Button>
        
        <Button
          onClick={muteResponse}
          variant="secondary"
          className="px-4 py-2"
          data-testid="button-mute-response"
        >
          <VolumeX className="w-4 h-4 mr-2" />
          Mute
        </Button>
      </div>
    </div>
  );
}
