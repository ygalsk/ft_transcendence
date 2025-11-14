import { Type, Static } from '@sinclair/typebox';

// POST /register
export const RegisterSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 8, maxLength: 128 }),
  display_name: Type.String({ minLength: 1, maxLength: 50 })
});

export type RegisterType = Static<typeof RegisterSchema>;

// POST /login
export const LoginSchema = Type.Object({
  email: Type.String({ format: 'email' }),
  password: Type.String({ minLength: 1 }),
  twofa_code: Type.Optional(Type.String({ minLength: 6, maxLength: 6 }))
});

export type LoginType = Static<typeof LoginSchema>;

// POST /2fa/verify
export const TwoFAVerifySchema = Type.Object({
  code: Type.String({ minLength: 6, maxLength: 6 })
});

export type TwoFAVerifyType = Static<typeof TwoFAVerifySchema>;
