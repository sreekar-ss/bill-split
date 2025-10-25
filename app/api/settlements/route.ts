import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

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

    const { groupId, fromUserName, toUserName, amount } = await request.json();

    // Validate input
    if (!groupId || !fromUserName || !toUserName || !amount) {
      return NextResponse.json(
        { error: 'Group ID, from user, to user, and amount are required' },
        { status: 400 }
      );
    }

    // Get group and verify it exists
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: {
        members: {
          include: {
            user: true,
          },
        },
      },
    });

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 });
    }

    // Verify user is a member
    const isMember = group.members.some((m) => m.userId === payload.userId);
    if (!isMember) {
      return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
    }

    // Find the users by name
    const fromUser = group.members.find((m) => m.user.name === fromUserName)?.user;
    const toUser = group.members.find((m) => m.user.name === toUserName)?.user;

    if (!fromUser || !toUser) {
      return NextResponse.json({ error: 'Users not found in group' }, { status: 404 });
    }

    // Get all unsettled expenses for this group
    const expenses = await prisma.expense.findMany({
      where: {
        groupId,
      },
      include: {
        splits: {
          where: {
            settled: false,
          },
        },
      },
    });

    // Calculate net balance between the two users
    let netAmount = 0;
    const splitsToSettle: string[] = [];

    for (const expense of expenses) {
      for (const split of expense.splits) {
        // If fromUser owes toUser
        if (split.userId === fromUser.id && expense.createdById === toUser.id) {
          netAmount += split.amount;
          splitsToSettle.push(split.id);
        }
        // If toUser owes fromUser (reverse)
        if (split.userId === toUser.id && expense.createdById === fromUser.id) {
          netAmount -= split.amount;
          splitsToSettle.push(split.id);
        }
      }
    }

    console.log('Settlement calculation:', {
      fromUser: fromUser.name,
      toUser: toUser.name,
      netAmount,
      requestedAmount: amount,
      splitsToSettle: splitsToSettle.length,
    });

    // Verify the settlement amount matches (with small tolerance for floating point)
    if (Math.abs(netAmount - amount) > 0.01) {
      console.error('Settlement amount mismatch:', {
        expected: netAmount,
        got: amount,
        difference: Math.abs(netAmount - amount),
      });
      return NextResponse.json(
        { error: `Settlement amount mismatch. Expected ${netAmount.toFixed(2)}, got ${amount.toFixed(2)}` },
        { status: 400 }
      );
    }

    // Create settlement record and update splits in a transaction
    const settlement = await prisma.$transaction(async (tx) => {
      // Create settlement record
      const newSettlement = await tx.settlement.create({
        data: {
          groupId,
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          amount,
          currency: group.currency,
          settledAt: new Date(),
        },
      });

      // Mark all related splits as settled
      await tx.expenseSplit.updateMany({
        where: {
          id: {
            in: splitsToSettle,
          },
        },
        data: {
          settled: true,
        },
      });

      return newSettlement;
    });

    return NextResponse.json({
      message: 'Settlement recorded successfully',
      settlement,
    });
  } catch (error: any) {
    console.error('Settlement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('Error details:', {
      message: errorMessage,
      stack: errorStack,
      code: error.code,
    });
    return NextResponse.json(
      { error: 'Internal server error', details: errorMessage },
      { status: 500 }
    );
  }
}

