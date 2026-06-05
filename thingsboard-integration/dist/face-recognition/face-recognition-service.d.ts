export interface FaceDetectionResult {
    success: boolean;
    accessGranted: boolean;
    status: 'analyzing' | 'processing' | 'complete' | 'denied';
    confidence: number;
    boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    livenessScore: number;
    spoofingDetected: boolean;
    matchedIdentity?: string;
    securityFlags: string[];
    processingSteps: string[];
    timestamp: number;
}
export interface CelebrityMatchResult {
    celebrity: string;
    confidence: number;
    isKnownCelebrity: boolean;
    matchedFrom: 'fine_tuned_model' | 'celebrity_database';
}
export declare class FaceRecognitionService {
    private faceClassifier;
    private modelEndpoint;
    private isInitialized;
    private antiSpoofingModel;
    private celebrityDatabase;
    constructor();
    private initializeModels;
    private loadCelebrityDatabase;
    private generateMockEmbedding;
    detectAndRecognizeFace(imageBuffer: Buffer, userId?: string): Promise<FaceDetectionResult>;
    private delay;
    private performLivenessDetection;
    private extractFaceEmbedding;
    private matchAgainstCelebrityDatabase;
    processVideoFrame(frameBuffer: Buffer): Promise<FaceDetectionResult>;
    startRealtimeDetection(videoStreamUrl: string, callback: (result: FaceDetectionResult) => void): Promise<void>;
    stopRealtimeDetection(): void;
    getModelInfo(): Promise<any>;
    updateCelebrityDatabase(newCelebrities: any[]): Promise<void>;
    getCelebrityStats(): any;
}
//# sourceMappingURL=face-recognition-service.d.ts.map