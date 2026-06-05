import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";

export interface FaceRecognitionResult {
  success: boolean;
  user?: any;
  confidence?: number;
  message?: string;
}

export function useFaceRecognition() {
  const [isProcessing, setIsProcessing] = useState(false);

  const authenticateWithFace = async (imageData: string): Promise<FaceRecognitionResult> => {
    setIsProcessing(true);
    
    try {
      const response = await apiRequest('POST', '/api/auth/face-recognition', {
        imageData
      });
      
      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Face recognition error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Face recognition failed'
      };
    } finally {
      setIsProcessing(false);
    }
  };

  const registerFace = async (userId: string, imageData: string): Promise<{ success: boolean; message: string }> => {
    setIsProcessing(true);
    
    try {
      const response = await apiRequest('POST', '/api/auth/face-recognition/register', {
        userId,
        imageData
      });
      
      return await response.json();
    } catch (error) {
      console.error('Face registration error:', error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Face registration failed'
      };
    } finally {
      setIsProcessing(false);
    }
  };

  return {
    authenticateWithFace,
    registerFace,
    isProcessing,
  };
}
