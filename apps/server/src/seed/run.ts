/** `npm run seed` — upsert categories and the starter question bank. */
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { seedDatabase } from './seed.js';

try {
  await connectDatabase();
  const r = await seedDatabase();
  console.log(
    `Categories: ${r.categories.total} (${r.categories.upserted} new) · Questions: ${r.questions.total} (${r.questions.inserted} new, ${r.questions.updated} updated)`,
  );
} catch (err) {
  console.error('Seed failed:', err);
  process.exitCode = 1;
} finally {
  await disconnectDatabase();
}
