import { FastifyInstance } from "fastify";

export default async function userRoutes(fastify:FastifyInstance) {
    fastify.get('/', async() => {
        // @ts-ignore
        const users = fastify.db.prepare('SELECT id, username, email FROM users').all();
        return { users };
    });

    fastify.get<{ Params: { id: string } }>('/:id', async (req, res) => {
        const { id } = req.params;
        // @ts-ignore
        const user = fastify.db.prepare('SELECT id, username, email FROM users WHERE id = ?').get(id);
        if (!user)
            return res.code(404).send({ error: "User not found" });
        return { user };
    });
}