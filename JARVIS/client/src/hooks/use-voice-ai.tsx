import { useState, useRef, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export function useVoiceAI() {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isConnected, setIsConnected] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const processVoiceCommandMutation = useMutation({
    mutationFn: async ({ audioData }: { audioData: string }) => {
      const response = await apiRequest('POST', '/api/voice/command', {
        audioData,
        userId: 'demo-user-id' // In a real app, this would come from auth context
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsProcessing(false);
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ["/api/voice/commands"] });
      queryClient.invalidateQueries({ queryKey: ["/api/devices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      
      if (data.success) {
        toast({
          title: "Voice Command Processed",
          description: data.response,
        });
        
        // Play audio response if available and not muted
        if (data.audioResponse && !isMuted) {
          playAudioResponse(data.audioResponse);
        }
      } else {
        toast({
          title: "Voice Command Failed",
          description: data.message || "Failed to process voice command",
          variant: "destructive",
        });
      }
    },
    onError: (error) => {
      setIsProcessing(false);
      console.error('Voice command error:', error);
      toast({
        title: "Voice Command Error",
        description: error.message || "Failed to process voice command",
        variant: "destructive",
      });
    },
  });

  const startListening = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        }
      });
      
      audioChunksRef.current = [];
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        processAudioBlob(audioBlob);
        
        // Stop all audio tracks
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsListening(true);
      
      toast({
        title: "Voice Recording Started",
        description: "Listening for your command...",
      });
      
      // Auto-stop after 10 seconds
      setTimeout(() => {
        if (isListening) {
          stopListening();
        }
      }, 10000);
      
    } catch (error) {
      console.error('Error starting voice recording:', error);
      toast({
        title: "Microphone Access Required",
        description: "Please allow microphone access for voice control",
        variant: "destructive",
      });
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop();
      setIsListening(false);
      setIsProcessing(true);
      
      toast({
        title: "Processing Voice Command",
        description: "Analyzing your request...",
      });
    }
  }, [isListening]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  const processAudioBlob = async (audioBlob: Blob) => {
    try {
      // Convert blob to base64
      const arrayBuffer = await audioBlob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const base64Audio = btoa(String.fromCharCode.apply(null, Array.from(uint8Array)));
      
      await processVoiceCommandMutation.mutateAsync({ audioData: base64Audio });
    } catch (error) {
      console.error('Error processing audio blob:', error);
      setIsProcessing(false);
      toast({
        title: "Audio Processing Failed",
        description: "Failed to process audio data",
        variant: "destructive",
      });
    }
  };

  const playAudioResponse = (base64Audio: string) => {
    try {
      const audioBlob = new Blob(
        [Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))],
        { type: 'audio/mpeg' }
      );
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      
      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
      };
      
      audio.play().catch(error => {
        console.error('Error playing audio response:', error);
      });
    } catch (error) {
      console.error('Error creating audio response:', error);
    }
  };

  const muteResponse = useCallback(() => {
    setIsMuted(!isMuted);
    toast({
      title: isMuted ? "Audio Unmuted" : "Audio Muted",
      description: isMuted ? "Voice responses will now play" : "Voice responses are now muted",
    });
  }, [isMuted, toast]);

  return {
    isListening,
    isProcessing,
    isConnected,
    isMuted,
    startListening,
    stopListening,
    toggleListening,
    muteResponse,
  };
}
