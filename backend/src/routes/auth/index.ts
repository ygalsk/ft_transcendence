import { FastifyInstance } from "fastify";

export default async function authRoutes(fastify:FastifyInstance) {
    fastify.get('/github', async(req, res) => {

        const client_id = process.env.OAUTH_CLIENT_ID as string;
        const redirect_uri = process.env.REDIRECT_URI as string;

        const params = new URLSearchParams({
            client_id: client_id,
            redirect_uri: redirect_uri,
            scope: 'user:email'
        });

        const url = `https://github.com/login/oauth/authorize?${params.toString()}`

        res.redirect(url, 302);
    });

    fastify.get<{ Querystring: { code: string } }>('/github/callback', async(req, res) => {

        const code = req.query.code;
        const client_id = process.env.OAUTH_CLIENT_ID as string;
        const client_secret = process.env.OAUTH_CLIENT_SECRET as string;

        const response = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                client_id: client_id,
                client_secret: client_secret,
                code: code
            })
        });
        const data = await response.json();
        console.log('Token response:', data);

        const userResponse = await fetch('https://api.github.com/user', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${data.access_token}`,
                'User-Agent': 'ft-transcendence-app'
            }
        })

        const userData = await userResponse.json();
        console.log('User data:', userData); 
    });

}