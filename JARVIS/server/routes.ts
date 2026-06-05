import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { storage } from "./storage";
import { deviceControlSchema } from "@shared/schema";
import { faceRecognitionService } from "./services/face-recognition";
import { voiceAIService } from "./services/voice-ai";
import { deviceControlService } from "./services/device-control";

export async function registerRoutes(app: Express): Promise<Server> {
  const httpServer = createServer(app);
  
  // WebSocket server for real-time communication
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  
  // Store connected clients
  const clients = new Set<WebSocket>();
  
  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('Client connected to WebSocket');
    
    // Send initial data
    ws.send(JSON.stringify({
      type: 'connection',
      message: 'Connected to SmartHome dashboard'
    }));
    
    ws.on('close', () => {
      clients.delete(ws);
      console.log('Client disconnected from WebSocket');
    });
    
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      clients.delete(ws);
    });
  });
  
  // Broadcast to all connected clients
  function broadcast(data: any) {
    const message = JSON.stringify(data);
    clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  // Face Recognition Authentication
  app.post('/api/auth/face-recognition', async (req, res) => {
    try {
      const { imageData } = req.body;
      
      if (!imageData) {
        return res.status(400).json({ message: 'Image data required' });
      }
      
      const result = await faceRecognitionService.authenticate(imageData);
      
      if (result.success && result.userId) {
        const user = await storage.getUser(result.userId);
        res.json({ 
          success: true, 
          user,
          confidence: result.confidence 
        });
      } else {
        res.status(401).json({ 
          success: false, 
          message: 'Face not recognized' 
        });
      }
    } catch (error) {
      console.error('Face recognition error:', error);
      res.status(500).json({ message: 'Face recognition service error' });
    }
  });

  // Room endpoints
  app.get('/api/rooms', async (req, res) => {
    try {
      const rooms = await storage.getRooms();
      res.json(rooms);
    } catch (error) {
      console.error('Error fetching rooms:', error);
      res.status(500).json({ message: 'Failed to fetch rooms' });
    }
  });

  app.get('/api/rooms/:id', async (req, res) => {
    try {
      const room = await storage.getRoom(req.params.id);
      if (!room) {
        return res.status(404).json({ message: 'Room not found' });
      }
      res.json(room);
    } catch (error) {
      console.error('Error fetching room:', error);
      res.status(500).json({ message: 'Failed to fetch room' });
    }
  });

  // Device endpoints
  app.get('/api/devices', async (req, res) => {
    try {
      const devices = await storage.getDevices();
      res.json(devices);
    } catch (error) {
      console.error('Error fetching devices:', error);
      res.status(500).json({ message: 'Failed to fetch devices' });
    }
  });

  app.get('/api/rooms/:roomId/devices', async (req, res) => {
    try {
      const devices = await storage.getDevicesByRoom(req.params.roomId);
      res.json(devices);
    } catch (error) {
      console.error('Error fetching room devices:', error);
      res.status(500).json({ message: 'Failed to fetch room devices' });
    }
  });

  app.post('/api/devices/:id/control', async (req, res) => {
    try {
      const deviceId = req.params.id;
      const controlData = deviceControlSchema.parse(req.body);
      
      const result = await deviceControlService.controlDevice(deviceId, controlData);
      
      if (result.success) {
        const updatedDevice = await storage.updateDevice(deviceId, {
          isActive: result.isActive,
          status: result.status,
          updatedAt: new Date()
        });
        
        // Broadcast device update to all clients
        broadcast({
          type: 'device_updated',
          device: updatedDevice
        });
        
        res.json({ success: true, device: updatedDevice });
      } else {
        res.status(400).json({ success: false, message: result.message });
      }
    } catch (error) {
      console.error('Device control error:', error);
      res.status(500).json({ message: 'Device control failed' });
    }
  });

  // Security endpoints
  app.get('/api/security/events', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const events = await storage.getSecurityEvents(limit);
      res.json(events);
    } catch (error) {
      console.error('Error fetching security events:', error);
      res.status(500).json({ message: 'Failed to fetch security events' });
    }
  });

  app.post('/api/security/events/:id/acknowledge', async (req, res) => {
    try {
      await storage.acknowledgeSecurityEvent(req.params.id);
      broadcast({
        type: 'security_event_acknowledged',
        eventId: req.params.id
      });
      res.json({ success: true });
    } catch (error) {
      console.error('Error acknowledging security event:', error);
      res.status(500).json({ message: 'Failed to acknowledge security event' });
    }
  });

  // Voice AI endpoints
  app.post('/api/voice/command', async (req, res) => {
    try {
      const { audioData, userId } = req.body;
      
      if (!audioData || !userId) {
        return res.status(400).json({ message: 'Audio data and user ID required' });
      }
      
      const result = await voiceAIService.processVoiceCommand(audioData, userId);
      
      // Store voice command
      await storage.createVoiceCommand({
        userId,
        command: result.transcription,
        response: result.response,
        deviceIds: result.deviceIds || [],
        success: result.success
      });
      
      // Execute device commands if any
      if (result.deviceCommands && result.deviceCommands.length > 0) {
        for (const command of result.deviceCommands) {
          try {
            const controlResult = await deviceControlService.controlDevice(
              command.deviceId, 
              command
            );
            
            if (controlResult.success) {
              const updatedDevice = await storage.updateDevice(command.deviceId, {
                isActive: controlResult.isActive,
                status: controlResult.status,
                updatedAt: new Date()
              });
              
              broadcast({
                type: 'device_updated',
                device: updatedDevice
              });
            }
          } catch (error) {
            console.error('Error executing device command:', error);
          }
        }
      }
      
      res.json(result);
    } catch (error) {
      console.error('Voice command error:', error);
      res.status(500).json({ message: 'Voice command processing failed' });
    }
  });

  app.get('/api/voice/commands/:userId', async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;
      const commands = await storage.getVoiceCommands(req.params.userId, limit);
      res.json(commands);
    } catch (error) {
      console.error('Error fetching voice commands:', error);
      res.status(500).json({ message: 'Failed to fetch voice commands' });
    }
  });

  // Dashboard stats endpoint
  app.get('/api/dashboard/stats', async (req, res) => {
    try {
      const devices = await storage.getDevices();
      const rooms = await storage.getRooms();
      const securityEvents = await storage.getSecurityEvents(1);
      
      const stats = {
        devicesOnline: devices.filter(d => d.isOnline).length,
        totalDevices: devices.length,
        energyUsage: '1.2kW', // This would come from a real energy monitoring service
        securityStatus: securityEvents.length > 0 && !securityEvents[0].acknowledged ? 'Alert' : 'Secure',
        temperature: Math.round(rooms.reduce((sum, r) => sum + (r.temperature || 72), 0) / rooms.length)
      };
      
      res.json(stats);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      res.status(500).json({ message: 'Failed to fetch dashboard stats' });
    }
  });

  return httpServer;
}
