import { FastifyInstance } from 'fastify';
import { AddFriendSchema, AddFriendType } from '../../shared/schemas/friends.schema';

interface Friendship {
    id: number;
    user_id: number;
    friend_id: number;
    status: 'pending' | 'accepted';
    created_at: string;
}

export default async function friendsRoutes(fastify: FastifyInstance) {

    // POST /friends - Send friend request
    fastify.post<{ Body: AddFriendType }>('/friends', {
        schema: { body: AddFriendSchema },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const senderId = request.user!.userId;
        const { friend_id } = request.body;

        // Prevent self-friendship
        if (senderId === friend_id)
            return reply.code(400).send({ error: 'Cannot send friend request to yourself' });

        try {
            const receiverExists = fastify.db.prepare(
                'SELECT id FROM users WHERE id = ?'
            ).get(friend_id);

            if (!receiverExists)
                return reply.code(404).send({ error: 'User not found' });

            // Check for existing friendship
            const existingFriendship = fastify.db.prepare(`
                SELECT id, status FROM friendships 
                WHERE (user_id = ? AND friend_id = ?) 
                OR (user_id = ? AND friend_id = ?)
            `).get(senderId, friend_id, friend_id, senderId) as Friendship | undefined;

            if (existingFriendship) {
                if (existingFriendship.status === 'accepted')
                    return reply.code(409).send({ error: 'Users are already friends' });
                else if (existingFriendship.status === 'pending')
                    return reply.code(409).send({ error: 'Friend request already pending' });
            }

            // Create friendship request
            const result = fastify.db.prepare(`
                INSERT INTO friendships (user_id, friend_id, status, created_at)
                VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
            `).run(senderId, friend_id);

            const friendshipId = result.lastInsertRowid as number;

            return reply.code(201).send({ 
                message: 'Friend request sent successfully',
                friendship_id: friendshipId
            });
        } catch (error: any) {
           fastify.log.error({ error: error.message }, 'Failed to send friend request');
           return reply.code(500).send({ error: 'Internal server error' });
        }
    });
}