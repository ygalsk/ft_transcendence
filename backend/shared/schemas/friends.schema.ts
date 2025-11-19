import { Type, Static } from '@sinclair/typebox';

// -post /friends
export const AddFriendSchema = Type.Object({
    friend_id: Type.Number({minimum: 1})
});

// -patch /friends/:friendship_id
export const FriendActionSchema = Type.Object({
    action: Type.Union([
        Type.Literal('accept'),
        Type.Literal('decline')
    ])
});

// -get /friends
export const FriendListSchema = Type.Object({
    friends : Type.Array(Type.Object({
        id: Type.Number(),
        display_name: Type.String(),
        avatar_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        online: Type.Number({ minimum: 0, maximum: 1 }), // 0 = offline, 1 = online
        last_seen: Type.String({ format: 'date-time' }),
        friendship_status: Type.Literal('accepted') //only accepted friends
    }))
});

// -get friends/requests
export const PendingFriendshipSchema = Type.Object({
    incoming: Type.Array(Type.Object({
        id: Type.Number({ description: 'Friendship record ID' }),
        from_user_id: Type.Number({ description: 'ID of user who sent request' }),
        from_user_display_name: Type.String(),
        avatar_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        created_at: Type.String({ format: 'date-time' })
    })),
    outgoing: Type.Array(Type.Object({
        id: Type.Number(),
        to_user_id: Type.Number({ description: 'ID of user request was sent to' }),
        to_user_display_name: Type.String(),
        avatar_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        created_at: Type.String({ format: 'date-time' })
    }))
});

// -get /friends/online
export const OnlineFriendsSchema = Type.Object({
    online_friends: Type.Array(Type.Object({
        id: Type.Number(),
        display_name: Type.String(),
        avatar_url: Type.Union([Type.String({ format: 'uri' }), Type.Null()]),
        last_seen: Type.String({ format: 'date-time' })
    }))
});

export type AddFriendType = Static<typeof AddFriendSchema>;
export type FriendActionType = Static<typeof FriendActionSchema>;
export type FriendListType = Static<typeof FriendListSchema>;
export type PendingFriendshipType = Static<typeof PendingFriendshipSchema>;
export type OnlineFriendsType = Static<typeof OnlineFriendsSchema>;