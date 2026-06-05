import { sql } from "drizzle-orm";
import { pgTable, text, varchar, boolean, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email"),
  faceRecognitionId: text("face_recognition_id"),
  profileImageUrl: text("profile_image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const devices = pgTable("devices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'light', 'tv', 'window', 'thermostat', 'camera', 'lock', 'fan', 'sensor'
  roomId: varchar("room_id").notNull(),
  isOnline: boolean("is_online").default(true),
  isActive: boolean("is_active").default(false),
  status: jsonb("status").default({}), // Device-specific status data
  capabilities: text("capabilities").array().default([]), // ['brightness', 'color', 'temperature']
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const rooms = pgTable("rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: text("type").notNull(), // 'living_room', 'bedroom', 'kitchen', 'bathroom', 'office'
  temperature: integer("temperature").default(72),
  deviceCount: integer("device_count").default(0),
  isOnline: boolean("is_online").default(true),
  iconColor: text("icon_color").default("blue"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const securityEvents = pgTable("security_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  type: text("type").notNull(), // 'motion', 'door_open', 'alarm', 'camera_activity'
  deviceId: varchar("device_id").notNull(),
  message: text("message").notNull(),
  severity: text("severity").default("info"), // 'info', 'warning', 'critical'
  acknowledged: boolean("acknowledged").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export const voiceCommands = pgTable("voice_commands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  command: text("command").notNull(),
  response: text("response"),
  deviceIds: text("device_ids").array().default([]),
  success: boolean("success").default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

// Insert schemas
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDeviceSchema = createInsertSchema(devices).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRoomSchema = createInsertSchema(rooms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSecurityEventSchema = createInsertSchema(securityEvents).omit({
  id: true,
  createdAt: true,
});

export const insertVoiceCommandSchema = createInsertSchema(voiceCommands).omit({
  id: true,
  createdAt: true,
});

// Types
export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Device = typeof devices.$inferSelect;
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Room = typeof rooms.$inferSelect;
export type InsertRoom = z.infer<typeof insertRoomSchema>;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type InsertSecurityEvent = z.infer<typeof insertSecurityEventSchema>;
export type VoiceCommand = typeof voiceCommands.$inferSelect;
export type InsertVoiceCommand = z.infer<typeof insertVoiceCommandSchema>;

// Device control schema
export const deviceControlSchema = z.object({
  deviceId: z.string(),
  action: z.enum(['toggle', 'set_brightness', 'set_temperature', 'set_color']),
  value: z.union([z.boolean(), z.number(), z.string()]).optional(),
});

export type DeviceControl = z.infer<typeof deviceControlSchema>;
