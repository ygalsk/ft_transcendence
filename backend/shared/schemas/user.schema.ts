import { Type, Static } from '@sinclair/typebox';

// Schema for creating user profile (called by Auth service)
export const CreateProfileSchema = Type.Object({
  id: Type.Number(),
  email: Type.String({ format: 'email' }),
  display_name: Type.String({ minLength: 1, maxLength: 50 })
});

// Schema for updating user profile
export const UpdateProfileSchema = Type.Partial(
  Type.Object({
  display_name: Type.String({ minLength: 1, maxLength: 50 }),
  bio: Type.String({ minLength: 1, maxLength: 500 }),
  avatar_url: Type.String()
}),
 { minProperties: 1 }
);

// Schema for recording match results
export const MatchResultSchema = Type.Object({
  winnerId: Type.Number(),
  loserId: Type.Number(),
  leftScore: Type.Number({ minimum: 0 }),
  rightScore: Type.Number({ minimum: 0 })
});

// Schema for avatar upload response
export const AvatarUploadResponseSchema = Type.Object({
  message: Type.String(),
  avatar_url: Type.String()
});

// Schema for getting avatar parameters
export const GetAvatarParamsSchema = Type.Object({
  userId: Type.String({ 
    pattern: '^[0-9]+$',
    description: 'Numeric user ID'
  })
});

// TypeScript types
export type CreateProfileType = Static<typeof CreateProfileSchema>;
export type UpdateProfileType = Static<typeof UpdateProfileSchema>;
export type MatchResultType = Static<typeof MatchResultSchema>;
export type GetAvatarParamsType = Static<typeof GetAvatarParamsSchema>;
