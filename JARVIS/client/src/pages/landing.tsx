import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useFaceRecognition } from "@/lib/face-recognition";
import { useToast } from "@/hooks/use-toast";
import { 
  Home, 
  Shield, 
  Mic, 
  Camera,
  Lightbulb,
  Tv,
  Lock,
  Thermometer
} from "lucide-react";

export default function Landing() {
  const [, setLocation] = useLocation();
  const { authenticateWithFace, isProcessing } = useFaceRecognition();
  const { toast } = useToast();
  const [isDemo, setIsDemo] = useState(false);

  const handleFaceAuth = async () => {
    try {
      // Get camera access
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      // Capture frame after video is ready
      video.onloadedmetadata = () => {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(video, 0, 0);
        
        const imageData = canvas.toDataURL('image/jpeg').split(',')[1];
        
        // Stop camera
        stream.getTracks().forEach(track => track.stop());
        
        // Authenticate
        authenticateWithFace(imageData)
          .then((result) => {
            if (result.success) {
              toast({
                title: "Authentication Successful",
                description: `Welcome! Face recognized with ${Math.round((result.confidence || 0) * 100)}% confidence.`,
              });
              setLocation("/dashboard");
            } else {
              toast({
                title: "Authentication Failed",
                description: "Face not recognized. Please try again or use demo mode.",
                variant: "destructive",
              });
            }
          })
          .catch((error) => {
            console.error('Face auth error:', error);
            toast({
              title: "Authentication Error",
              description: "Failed to authenticate. Please try again.",
              variant: "destructive",
            });
          });
      };
    } catch (error) {
      console.error('Camera access error:', error);
      toast({
        title: "Camera Access Required",
        description: "Please allow camera access for face recognition authentication.",
        variant: "destructive",
      });
    }
  };

  const handleDemoMode = () => {
    setIsDemo(true);
    toast({
      title: "Demo Mode Activated",
      description: "Entering dashboard in demo mode.",
    });
    setTimeout(() => {
      setLocation("/dashboard");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        
        {/* Hero Section */}
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center">
                <Home className="w-6 h-6 text-primary-foreground" />
              </div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                SmartHome AI
              </h1>
            </div>
            
            <p className="text-xl text-muted-foreground leading-relaxed">
              Experience the future of home automation with AI-powered voice control, 
              face recognition security, and intelligent device management.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="glass-card p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <Camera className="w-5 h-5 text-primary" />
                <span className="font-medium">Face Recognition</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Secure biometric authentication
              </p>
            </div>
            
            <div className="glass-card p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <Mic className="w-5 h-5 text-green-400" />
                <span className="font-medium">Voice AI Control</span>
              </div>
              <p className="text-sm text-muted-foreground">
                OpenAI-powered voice assistant
              </p>
            </div>
            
            <div className="glass-card p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <Shield className="w-5 h-5 text-red-400" />
                <span className="font-medium">Smart Security</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Real-time monitoring & alerts
              </p>
            </div>
            
            <div className="glass-card p-4 rounded-lg">
              <div className="flex items-center space-x-3 mb-2">
                <Lightbulb className="w-5 h-5 text-yellow-400" />
                <span className="font-medium">Device Control</span>
              </div>
              <p className="text-sm text-muted-foreground">
                Lights, TVs, locks & more
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">24+</div>
              <div className="text-sm text-muted-foreground">Connected Devices</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-400">99.9%</div>
              <div className="text-sm text-muted-foreground">Uptime</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-400">1.2kW</div>
              <div className="text-sm text-muted-foreground">Energy Saved</div>
            </div>
          </div>
        </div>

        {/* Authentication Card */}
        <div className="space-y-6">
          <Card className="glass-card border-border">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome Home</CardTitle>
              <p className="text-muted-foreground">
                Authenticate with face recognition to access your smart home dashboard
              </p>
            </CardHeader>
            
            <CardContent className="space-y-6">
              {/* Camera Preview Area */}
              <div className="aspect-video bg-secondary rounded-lg flex items-center justify-center border-2 border-dashed border-border">
                <div className="text-center space-y-2">
                  <Camera className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Camera will activate for face recognition
                  </p>
                </div>
              </div>

              {/* Authentication Buttons */}
              <div className="space-y-3">
                <Button 
                  onClick={handleFaceAuth}
                  disabled={isProcessing}
                  className="w-full bg-primary hover:bg-blue-600 text-primary-foreground"
                  data-testid="button-face-auth"
                >
                  {isProcessing ? (
                    <div className="flex items-center space-x-2">
                      <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>Authenticating...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Camera className="w-4 h-4" />
                      <span>Authenticate with Face ID</span>
                    </div>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button 
                  onClick={handleDemoMode}
                  variant="outline"
                  className="w-full"
                  data-testid="button-demo-mode"
                >
                  <div className="flex items-center space-x-2">
                    <Home className="w-4 h-4" />
                    <span>Enter Demo Mode</span>
                  </div>
                </Button>
              </div>

              {/* Status Indicators */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">AI Assistant</span>
                  <Badge variant="outline" className="text-green-400 border-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2 security-indicator" />
                    Active
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Face Recognition</span>
                  <Badge variant="outline" className="text-blue-400 border-blue-400">
                    <div className="w-2 h-2 bg-blue-400 rounded-full mr-2" />
                    Ready
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Security System</span>
                  <Badge variant="outline" className="text-green-400 border-green-400">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-2" />
                    Armed
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Device Preview */}
          <Card className="glass-card border-border">
            <CardHeader>
              <CardTitle className="text-lg">Connected Devices</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center space-x-2 p-2 bg-secondary rounded-lg">
                  <Lightbulb className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm">12 Lights</span>
                </div>
                <div className="flex items-center space-x-2 p-2 bg-secondary rounded-lg">
                  <Tv className="w-4 h-4 text-blue-400" />
                  <span className="text-sm">3 TVs</span>
                </div>
                <div className="flex items-center space-x-2 p-2 bg-secondary rounded-lg">
                  <Lock className="w-4 h-4 text-green-400" />
                  <span className="text-sm">5 Locks</span>
                </div>
                <div className="flex items-center space-x-2 p-2 bg-secondary rounded-lg">
                  <Thermometer className="w-4 h-4 text-red-400" />
                  <span className="text-sm">4 Sensors</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
