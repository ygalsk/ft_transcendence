import { Type, Static } from '@sinclair/typebox';

export const CreateUserSchema = Type.Object({
    username: Type.String({
        minLength: 3,
        maxLength: 30,
        pattern: '^[a-zA-Z0-9_-]+$'
    }),
    email: Type.String({ format: 'email' }),
    avatarUrl: Type.Optional(Type.String({ format: 'uri' })),
    oauth_provider: Type.Union([
        Type.Literal('github'),
        Type.Literal('42')
    ]),
    oauth_id: Type.String({ minLength: 1 })
});

export const UserSchema = Type.Object({
    id: Type.Number(),
    username: Type.String(),
    email: Type.String(),
    avatarUrl: Type.Union([Type.String(), Type.Null()]),
    oauth_provider: Type.String(),
    oauth_id: Type.String(),
    created_at: Type.String()
});

export type CreateUserType = Static<typeof CreateUserSchema>;
export type UserType = Static<typeof UserSchema>; 