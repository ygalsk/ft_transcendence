import { Type, Static } from '@sinclair/typebox';

// Schema for creating user profile (called by Auth service)
export const CreateProfileSchema = Type.Object({
  id: Type.Number(),
  email: Type.String({ format: 'email' }),
  display_name: Type.String({ minLength: 1, maxLength: 50 })
});

// Schema for updating user profile
export const UpdateProfileSchema = Type.Object({
  display_name: Type.Optional(Type.String({ minLength: 1, maxLength: 50 })),
  bio: Type.Optional(Type.String({ maxLength: 500 })),
  avatar_url: Type.Optional(Type.String({ format: 'uri' }))
});

// Schema for recording match results
export const MatchResultSchema = Type.Object({
  winnerId: Type.Number(),
  loserId: Type.Number(),
  leftScore: Type.Number({ minimum: 0 }),
  rightScore: Type.Number({ minimum: 0 })
});

// TypeScript types
export type CreateProfileType = Static<typeof CreateProfileSchema>;
export type UpdateProfileType = Static<typeof UpdateProfileSchema>;
export type MatchResultType = Static<typeof MatchResultSchema>;
