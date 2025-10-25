import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/friends - List all friends with balances
export async function GET(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Get all friendships where user is involved
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { userId: payload.userId, status: 'accepted' },
          { friendId: payload.userId, status: 'accepted' },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
        friend: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    // Format friendships to always show the other person
    const friends = friendships.map((friendship) => {
      const friend = friendship.userId === payload.userId ? friendship.friend : friendship.user;
      return {
        friendshipId: friendship.id,
        friend,
        createdAt: friendship.createdAt,
      };
    });

    // Get all expenses between user and each friend
    const friendsWithBalances = await Promise.all(
      friends.map(async (friendData) => {
        const friendId = friendData.friend.id;

        // Get all expenses where user and friend are involved (no group)
        const expenses = await prisma.expense.findMany({
          where: {
            groupId: null,
            AND: [
              {
                OR: [
                  { createdById: payload.userId },
                  { createdById: friendId },
                ],
              },
            ],
          },
          include: {
            splits: {
              where: {
                OR: [
                  { userId: payload.userId },
                  { userId: friendId },
                ],
              },
            },
            createdBy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        // Calculate net balance
        let balance = 0;
        expenses.forEach((expense) => {
          expense.splits.forEach((split) => {
            if (!split.settled) {
              if (split.userId === payload.userId && expense.createdById === friendId) {
                // User owes friend
                balance -= split.amount;
              } else if (split.userId === friendId && expense.createdById === payload.userId) {
                // Friend owes user
                balance += split.amount;
              }
            }
          });
        });

        return {
          ...friendData,
          balance, // Positive means friend owes user, negative means user owes friend
          expenseCount: expenses.length,
        };
      })
    );

    return NextResponse.json({ friends: friendsWithBalances });
        } catch (error: any) {
          console.error('Get friends error:', error);
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          const errorStack = error instanceof Error ? error.stack : undefined;
          console.error('Error details:', errorMessage, errorStack);
          return NextResponse.json({
            error: 'Internal server error',
            details: errorMessage
          }, { status: 500 });
        }
}

// POST /api/friends - Add a friend
export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const { friendEmail } = await request.json();

    if (!friendEmail) {
      return NextResponse.json({ error: 'Friend email is required' }, { status: 400 });
    }

    // Find friend by email
    const friend = await prisma.user.findUnique({
      where: { email: friendEmail },
    });

    if (!friend) {
      return NextResponse.json({ error: 'User not found with that email' }, { status: 404 });
    }

    if (friend.id === payload.userId) {
      return NextResponse.json({ error: 'Cannot add yourself as a friend' }, { status: 400 });
    }

    // Check if friendship already exists
    const existingFriendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: payload.userId, friendId: friend.id },
          { userId: friend.id, friendId: payload.userId },
        ],
      },
    });

    if (existingFriendship) {
      if (existingFriendship.status === 'accepted') {
        return NextResponse.json({ error: 'Already friends' }, { status: 400 });
      } else {
        return NextResponse.json({ error: 'Friend request already pending' }, { status: 400 });
      }
    }

    // Create friendship (auto-accept for now, can add friend requests later)
    const friendship = await prisma.friendship.create({
      data: {
        userId: payload.userId,
        friendId: friend.id,
        status: 'accepted', // Auto-accept for simplicity
        acceptedAt: new Date(),
      },
      include: {
        friend: {
          select: {
            id: true,
            name: true,
            email: true,
            avatar: true,
          },
        },
      },
    });

    return NextResponse.json({
      message: 'Friend added successfully',
      friendship,
    });
  } catch (error) {
    console.error('Add friend error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

