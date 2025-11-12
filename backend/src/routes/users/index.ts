import { FastifyPluginAsync } from "fastify";
import { TypeBoxTypeProvider } from "@fastify/type-provider-typebox";
import { Type } from "@sinclair/typebox";
import { CreateUserSchema, UserSchema, CreateUserType, UserType } from "../../schemas/user.schema";

export default async function userRoutes(fastify:FastifyInstance<TypeBoxTypeProvider>) {
    fastify.get('/', {
        schema: {
            response: {
                200: Type.Object({
                    users: Type.Array(UserSchema)
                })
            }
        }
    }, async() => {
        // @ts-ignore
        const users = fastify.db.prepare('SELECT * FROM users').all();
        return { users };
    });

    fastify.get('/:id', {
        schema: {
            params: Type.Object({
                id: Type.String()
            }),
            response: {
                200: Type.Object({
                    user: UserSchema
                }),
                404: Type.Object({
                    error: Type.String()
                })
            }
        }
    }, async (req, res) => {
        const id = req.params;
        // @ts-ignore
        const user = fastify.db.prepare('SELECT * FROM users WHERE id = ?').get(id);

        if (!user) {
            return res.code(404).send({ error: "User not found" });
        }

        return { user };
    });

    fastify.post('/', {
        schema: {
            body: CreateUserSchema,
            response: {
                201: Type.Object({
                    user: UserSchema
                }),
                409: Type.Object({
                    error: Type.String()
                }),
                500: Type.Object({
                    error: Type.String()
                })
            }
        }
    }, async (req, res) => {
        const { username, email, avatarUrl, oauth_provider, oauth_id } = req.body;

        try {
            // @ts-ignore
            const result = fastify.db.prepare(`
                INSERT INTO users (username, email, avatarUrl, oauth_provider, oauth_id)
                VALUES (?, ?, ?, ?, ?)
                `).run(username, email, avatarUrl || null , oauth_provider, oauth_id);
            // @ts-ignore
            const newUser = fastify.db.prepare('SELECT * from users WHERE id = ?').get(result.lastInsertRowid);

            return res.code(201).send({ user: newUser });
        } catch (error: any) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                return res.code(409).send({
                    error: 'Username or email already exist'
                });
            }
            fastify.log.error(error);
            return res.code(500).send({ error: 'Failed to create user' });
        }
    });
}