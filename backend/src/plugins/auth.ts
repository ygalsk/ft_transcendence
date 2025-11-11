import fp from "fastify-plugin";

export default fp(async (fastify) => {
    fastify.decorate("auth", async function authenticate(req, res) {
        const token = req.headers.authorization;
    });
});