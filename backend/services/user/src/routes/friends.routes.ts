import { FastifyInstance } from 'fastify';
import * as S from '../../shared/schemas/friends.schema';

// user->sender, friend->recipient
interface Friendship {
    id: number;
    user_id: number;
    friend_id: number;
    status: 'pending' | 'accepted';
    created_at: string;
}

export default async function friendsRoutes(fastify: FastifyInstance) {

    // POST /friends - Send friend request
    fastify.post<{ Body: S.AddFriendType }>('/friends', {
        schema: { body: S.AddFriendSchema },
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

    //patch /friends/:friendshioID - accept frienship request
    fastify.patch<{
        Params: { friendshipId: string },
        Body: S.FriendActionType
    }>('/friends/:friendshipId', {
        schema : { body: S.FriendActionSchema},
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const userId = request.user!.userId;
        const friendshipId = parseInt(request.params.friendshipId, 10);
        const { action } = request.body;

        if (isNaN(friendshipId))
            return reply.code(400).send({ error: 'Invalid friendship ID format'});

        try {
            const friendship = fastify.db.prepare(`
                SELECT id, user_id, friend_id, status 
                FROM friendships 
                WHERE id = ?
            `).get(friendshipId) as Friendship | undefined;

            if (!friendship)
                return reply.code(404).send({ error: 'Friend request not found'});

            if (friendship.friend_id !== userId)
                return reply.code(403).send({ error: 'Can only respond to requests sent to you'});

            if (friendship.status !== 'pending')
                return reply.code(400).send({ error: 'Can only respond to pending friend requests' });
        
            if (action === 'accept') {
                // Accept the friendship
                fastify.db.prepare(`
                    UPDATE friendships 
                    SET status = 'accepted' 
                    WHERE id = ?
                `).run(friendshipId);

                fastify.log.info({ friendshipId, userId }, 'Friend request accepted');
                return reply.send({ message: 'Friend request accepted successfully'});
            } else
                return reply.code(400).send({ error: 'Invalid action. Use "accept" or "decline"' });

        } catch (error: any) {
            fastify.log.error({ error: error.message, friendshipId, userId }, 'Failed to update friendship');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    //delete /friends/:friendId -remove friend, cancel/decline request
    fastify.delete<{ Params: {friendId: string}}>('/friends/:friendId',{
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const userId = request.user!.userId;
        const friendId = parseInt(request.params.friendId, 10);

        if (isNaN(friendId))
            return reply.code(400).send({ error: 'Invalid friend ID format'});
        try {
            const friendship = fastify.db.prepare(`
                SELECT id, user_id, friend_id, status 
                FROM friendships 
                WHERE (user_id = ? AND friend_id = ?) 
                   OR (user_id = ? AND friend_id = ?)
            `).get(userId, friendId, friendId, userId) as Friendship | undefined;

            if (!friendship)
                return reply.code(404).send({ error: 'Friendship not found'});

            fastify.db.prepare('DELETE FROM friendships WHERE id = ?').run(friendship.id);

            const action = friendship.status === 'pending' 
                ? (friendship.user_id === userId ? 'canceled friend request' : 'declined friend request')
                : 'removed friend';

            fastify.log.info({ 
                friendshipId: friendship.id, 
                userId, 
                friendId, 
                action 
            }, `Friendship ${action}`);

            return reply.code(204).send();
        } catch (error: any) {
            fastify.log.error({ error: error.message, userId, friendId }, 'Failed to remove friendship');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    //get /friends/requests - pending incoming-outgoing friend requests
    fastify.get<{ Reply: S.PendingFriendshipType | { error: string } }>('/friends/requests', {
        schema: {
            response: { 200: S.PendingFriendshipSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const userId = request.user!.userId;

        try {
            // get requests sent TO this user
            const incomingRequests = fastify.db.prepare(`
                SELECT 
                    f.id,
                    f.user_id as from_user_id,
                    u.display_name as from_user_display_name,
                    u.avatar_url,
                    f.created_at
                FROM friendships f
                JOIN users u ON f.user_id = u.id
                WHERE f.friend_id = ? AND f.status = 'pending'
                ORDER BY f.created_at DESC
            `).all(userId) as S.PendingFriendshipType['incoming'];

            // get requests requests sent BY this user
            const outgoingRequests = fastify.db.prepare(`
                SELECT 
                    f.id,
                    f.friend_id as to_user_id,
                    u.display_name as to_user_display_name,
                    u.avatar_url,
                    f.created_at
                FROM friendships f
                JOIN users u ON f.friend_id = u.id
                WHERE f.user_id = ? AND f.status = 'pending'
                ORDER BY f.created_at DESC
            `).all(userId) as S.PendingFriendshipType['outgoing'];

            return reply.send({
                incoming: incomingRequests,
                outgoing: outgoingRequests
            });

        } catch (error: any) {
            fastify.log.error({ error: error.message, userId }, 'Failed to get pending requests');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    //get /friends - get all accepted friends
    fastify.get<{ Reply: S.FriendListType | { error: string } }>('/friends', {
        schema: {
            response: { 200: S.FriendListSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const userId = request.user!.userId;

        try {
            // get all accepted friendships where user is either sender or receiver
            const accepted_friends = fastify.db.prepare(`
                SELECT 
                    u.id,
                    u.display_name,
                    u.avatar_url,
                    u.online,
                    u.last_seen,
                    'accepted' as friendship_status
                FROM friendships f
                JOIN users u ON (
                    CASE 
                        WHEN f.user_id = ? THEN u.id = f.friend_id
                        WHEN f.friend_id = ? THEN u.id = f.user_id
                    END
                )
                WHERE f.status = 'accepted'
                  AND (f.user_id = ? OR f.friend_id = ?)
                ORDER BY u.display_name ASC
            `).all(userId, userId, userId, userId) as S.FriendListType['friends'];

            return reply.send({ friends: accepted_friends });

        } catch (error: any) {
            fastify.log.error({ error: error.message, userId }, 'Failed to get friends list');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });

    // get /friends/online - get online friends
    fastify.get<{ Reply: S.OnlineFriendsType | { error: string } }>('/friends/online', {
        schema: {
            response: { 200: S.OnlineFriendsSchema }
        },
        preHandler: [fastify.authenticate]
    }, async (request, reply) => {
        const userId = request.user!.userId;

        try {
            const online_friends = fastify.db.prepare(`
                SELECT 
                    u.id,
                    u.display_name,
                    u.avatar_url,
                    u.last_seen
                FROM friendships f
                JOIN users u ON (
                    CASE 
                        WHEN f.user_id = ? THEN u.id = f.friend_id
                        WHEN f.friend_id = ? THEN u.id = f.user_id
                    END
                )
                WHERE f.status = 'accepted'
                  AND (f.user_id = ? OR f.friend_id = ?)
                  AND u.online = 1
                ORDER BY u.display_name ASC
            `).all(userId, userId, userId, userId) as S.OnlineFriendsType['online_friends'];

            return reply.send({ online_friends });

        } catch (error: any) {
            fastify.log.error({ error: error.message, userId }, 'Failed to get online friends');
            return reply.code(500).send({ error: 'Internal server error' });
        }
    });
}