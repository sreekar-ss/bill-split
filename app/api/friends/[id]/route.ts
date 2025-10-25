import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/friends/[id] - Get friend details with expenses and settlements
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: friendId } = await params;

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

    // Get friend details
    const friend = await prisma.user.findUnique({
      where: { id: friendId },
      select: {
        id: true,
        name: true,
        email: true,
        avatar: true,
      },
    });

    if (!friend) {
      return NextResponse.json({ error: 'Friend not found' }, { status: 404 });
    }

    // Verify friendship exists
    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { userId: payload.userId, friendId, status: 'accepted' },
          { userId: friendId, friendId: payload.userId, status: 'accepted' },
        ],
      },
    });

    if (!friendship) {
      return NextResponse.json({ error: 'Not friends with this user' }, { status: 403 });
    }

    // Get all expenses between user and friend (no group)
    const expenses = await prisma.expense.findMany({
      where: {
        groupId: null,
        AND: [
          {
            OR: [
              {
                createdById: payload.userId,
                splits: {
                  some: {
                    userId: friendId,
                  },
                },
              },
              {
                createdById: friendId,
                splits: {
                  some: {
                    userId: payload.userId,
                  },
                },
              },
            ],
          },
        ],
      },
      include: {
        createdBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        splits: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: {
        date: 'desc',
      },
    });

    // Get settlements between user and friend
    const settlements = await prisma.settlement.findMany({
      where: {
        groupId: null,
        AND: [
          {
            OR: [
              { fromUserId: payload.userId, toUserId: friendId },
              { fromUserId: friendId, toUserId: payload.userId },
            ],
          },
        ],
      },
      include: {
        fromUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        toUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        settledAt: 'desc',
      },
    });

    return NextResponse.json({
      friend,
      expenses,
      settlements,
    });
  } catch (error) {
    console.error('Get friend details error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

