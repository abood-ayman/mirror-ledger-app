import type { DecodedIdToken } from 'firebase-admin/auth';
import { db } from './index.ts';
import { users } from './schema.ts';

export async function getOrCreateUser(decoded: DecodedIdToken) {
  // Privacy: only the opaque account id is stored on the server. No email, name or photo.
  const email: string | null = null;
  const name: string | null = null;
  const picture: string | null = null;

  const [row] = await db
    .insert(users)
    .values({
      id: decoded.uid,
      email,
      name,
      picture,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        email,
        name,
        picture,
        updatedAt: new Date(),
      },
    })
    .returning();

  return row;
}
