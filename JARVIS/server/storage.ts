import { 
  type User, 
  type InsertUser,
  type Device,
  type InsertDevice,
  type Room,
  type InsertRoom,
  type SecurityEvent,
  type InsertSecurityEvent,
  type VoiceCommand,
  type InsertVoiceCommand
} from "@shared/schema";
import { randomUUID } from "crypto";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Device operations
  getDevices(): Promise<Device[]>;
  getDevicesByRoom(roomId: string): Promise<Device[]>;
  getDevice(id: string): Promise<Device | undefined>;
  createDevice(device: InsertDevice): Promise<Device>;
  updateDevice(id: string, updates: Partial<Device>): Promise<Device>;
  
  // Room operations
  getRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(room: InsertRoom): Promise<Room>;
  updateRoom(id: string, updates: Partial<Room>): Promise<Room>;
  
  // Security operations
  getSecurityEvents(limit?: number): Promise<SecurityEvent[]>;
  createSecurityEvent(event: InsertSecurityEvent): Promise<SecurityEvent>;
  acknowledgeSecurityEvent(id: string): Promise<void>;
  
  // Voice command operations
  getVoiceCommands(userId: string, limit?: number): Promise<VoiceCommand[]>;
  createVoiceCommand(command: InsertVoiceCommand): Promise<VoiceCommand>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User> = new Map();
  private devices: Map<string, Device> = new Map();
  private rooms: Map<string, Room> = new Map();
  private securityEvents: Map<string, SecurityEvent> = new Map();
  private voiceCommands: Map<string, VoiceCommand> = new Map();

  constructor() {
    this.initializeData();
  }

  private initializeData() {
    // Create default rooms
    const livingRoom: Room = {
      id: "living-room",
      name: "Living Room",
      type: "living_room",
      temperature: 72,
      deviceCount: 5,
      isOnline: true,
      iconColor: "orange",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const bedroom: Room = {
      id: "bedroom",
      name: "Bedroom",
      type: "bedroom",
      temperature: 68,
      deviceCount: 4,
      isOnline: true,
      iconColor: "purple",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const kitchen: Room = {
      id: "kitchen",
      name: "Kitchen",
      type: "kitchen",
      temperature: 74,
      deviceCount: 6,
      isOnline: true,
      iconColor: "green",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.rooms.set("living-room", livingRoom);
    this.rooms.set("bedroom", bedroom);
    this.rooms.set("kitchen", kitchen);

    // Create default devices
    const devices: Device[] = [
      // Living Room devices
      {
        id: "living-room-lights",
        name: "Main Lights",
        type: "light",
        roomId: "living-room",
        isOnline: true,
        isActive: true,
        status: { brightness: 80 },
        capabilities: ["brightness", "color"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "living-room-tv",
        name: "Smart TV",
        type: "tv",
        roomId: "living-room",
        isOnline: true,
        isActive: false,
        status: { channel: "Netflix", volume: 25 },
        capabilities: ["volume", "channel"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "living-room-blinds",
        name: "Smart Blinds",
        type: "window",
        roomId: "living-room",
        isOnline: true,
        isActive: true,
        status: { position: 75 },
        capabilities: ["position"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Bedroom devices
      {
        id: "bedroom-night-light",
        name: "Night Light",
        type: "light",
        roomId: "bedroom",
        isOnline: true,
        isActive: false,
        status: { brightness: 20 },
        capabilities: ["brightness"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "bedroom-fan",
        name: "Ceiling Fan",
        type: "fan",
        roomId: "bedroom",
        isOnline: true,
        isActive: true,
        status: { speed: 2 },
        capabilities: ["speed"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Kitchen devices
      {
        id: "kitchen-under-cabinet",
        name: "Under Cabinet",
        type: "light",
        roomId: "kitchen",
        isOnline: true,
        isActive: true,
        status: { brightness: 60 },
        capabilities: ["brightness"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "kitchen-oven",
        name: "Smart Oven",
        type: "appliance",
        roomId: "kitchen",
        isOnline: true,
        isActive: false,
        status: { temperature: 0, timer: 0 },
        capabilities: ["temperature", "timer"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Security devices
      {
        id: "front-door-camera",
        name: "Front Door Camera",
        type: "camera",
        roomId: "entrance",
        isOnline: true,
        isActive: true,
        status: { recording: true, motion: false },
        capabilities: ["recording", "motion_detection"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: "front-door-lock",
        name: "Front Door Lock",
        type: "lock",
        roomId: "entrance",
        isOnline: true,
        isActive: true,
        status: { locked: true },
        capabilities: ["lock_unlock"],
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    devices.forEach(device => {
      this.devices.set(device.id, device);
    });
  }

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = {
      ...insertUser,
      id,
      email: insertUser.email || null,
      faceRecognitionId: insertUser.faceRecognitionId || null,
      profileImageUrl: insertUser.profileImageUrl || null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  // Device operations
  async getDevices(): Promise<Device[]> {
    return Array.from(this.devices.values());
  }

  async getDevicesByRoom(roomId: string): Promise<Device[]> {
    return Array.from(this.devices.values()).filter(
      device => device.roomId === roomId
    );
  }

  async getDevice(id: string): Promise<Device | undefined> {
    return this.devices.get(id);
  }

  async createDevice(insertDevice: InsertDevice): Promise<Device> {
    const id = randomUUID();
    const device: Device = {
      ...insertDevice,
      id,
      status: insertDevice.status || {},
      isOnline: insertDevice.isOnline ?? true,
      isActive: insertDevice.isActive ?? false,
      capabilities: insertDevice.capabilities || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.devices.set(id, device);
    return device;
  }

  async updateDevice(id: string, updates: Partial<Device>): Promise<Device> {
    const device = this.devices.get(id);
    if (!device) {
      throw new Error(`Device ${id} not found`);
    }
    
    const updatedDevice = {
      ...device,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.devices.set(id, updatedDevice);
    return updatedDevice;
  }

  // Room operations
  async getRooms(): Promise<Room[]> {
    return Array.from(this.rooms.values());
  }

  async getRoom(id: string): Promise<Room | undefined> {
    return this.rooms.get(id);
  }

  async createRoom(insertRoom: InsertRoom): Promise<Room> {
    const id = randomUUID();
    const room: Room = {
      ...insertRoom,
      id,
      temperature: insertRoom.temperature ?? 72,
      deviceCount: insertRoom.deviceCount ?? 0,
      isOnline: insertRoom.isOnline ?? true,
      iconColor: insertRoom.iconColor || 'blue',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.rooms.set(id, room);
    return room;
  }

  async updateRoom(id: string, updates: Partial<Room>): Promise<Room> {
    const room = this.rooms.get(id);
    if (!room) {
      throw new Error(`Room ${id} not found`);
    }
    
    const updatedRoom = {
      ...room,
      ...updates,
      updatedAt: new Date(),
    };
    
    this.rooms.set(id, updatedRoom);
    return updatedRoom;
  }

  // Security operations
  async getSecurityEvents(limit: number = 50): Promise<SecurityEvent[]> {
    const events = Array.from(this.securityEvents.values())
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
    return events;
  }

  async createSecurityEvent(insertEvent: InsertSecurityEvent): Promise<SecurityEvent> {
    const id = randomUUID();
    const event: SecurityEvent = {
      ...insertEvent,
      id,
      severity: insertEvent.severity || 'info',
      acknowledged: insertEvent.acknowledged ?? false,
      createdAt: new Date(),
    };
    this.securityEvents.set(id, event);
    return event;
  }

  async acknowledgeSecurityEvent(id: string): Promise<void> {
    const event = this.securityEvents.get(id);
    if (event) {
      event.acknowledged = true;
      this.securityEvents.set(id, event);
    }
  }

  // Voice command operations
  async getVoiceCommands(userId: string, limit: number = 10): Promise<VoiceCommand[]> {
    const commands = Array.from(this.voiceCommands.values())
      .filter(cmd => cmd.userId === userId)
      .sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0))
      .slice(0, limit);
    return commands;
  }

  async createVoiceCommand(insertCommand: InsertVoiceCommand): Promise<VoiceCommand> {
    const id = randomUUID();
    const command: VoiceCommand = {
      ...insertCommand,
      id,
      response: insertCommand.response || null,
      deviceIds: insertCommand.deviceIds || [],
      success: insertCommand.success ?? false,
      createdAt: new Date(),
    };
    this.voiceCommands.set(id, command);
    return command;
  }
}

export const storage = new MemStorage();
