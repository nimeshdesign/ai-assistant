import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
// Register every model so indexes (and collections) exist before the first request.
import '../models/index.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  const conn = await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });
  // Make sure every declared index exists (cheap no-op when already built).
  await Promise.all(Object.values(conn.models).map((m) => m.syncIndexes()));
  logger.info({ db: conn.connection.name }, 'MongoDB connected');
  return conn;
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function dbState(): 'connected' | 'disconnected' | 'connecting' {
  switch (mongoose.connection.readyState) {
    case mongoose.ConnectionStates.connected:
      return 'connected';
    case mongoose.ConnectionStates.connecting:
      return 'connecting';
    default:
      return 'disconnected';
  }
}
