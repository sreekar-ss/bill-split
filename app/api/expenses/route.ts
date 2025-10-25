import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/expenses - Create a new expense and split it
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const body = await request.json();
    const { groupId, friendId, amount, description, category, date } = body;

    // Validation
    if (!amount || !description) {
      return NextResponse.json(
        { error: 'Amount and description are required' },
        { status: 400 }
      );
    }

    if (!groupId && !friendId) {
      return NextResponse.json(
        { error: 'Either groupId or friendId is required' },
        { status: 400 }
      );
    }

    if (amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    let members: { userId: string }[] = [];

    if (groupId) {
      // Group expense - check membership
      const groupMember = await prisma.groupMember.findFirst({
        where: {
          groupId,
          userId: payload.userId,
        },
      });

      if (!groupMember) {
        return NextResponse.json({ error: 'Not a member of this group' }, { status: 403 });
      }

      // Get all members of the group
      members = await prisma.groupMember.findMany({
        where: { groupId },
        select: { userId: true },
      });
    } else if (friendId) {
      // Friend expense - check friendship
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

      // Just the two friends
      members = [{ userId: payload.userId }, { userId: friendId }];
    }

    // Calculate split amount (equal split)
    const splitAmount = amount / members.length;

    // Create expense with splits in a transaction
    const expense = await prisma.$transaction(async (tx) => {
      // Create the expense
      const newExpense = await tx.expense.create({
        data: {
          amount: parseFloat(amount),
          description: description.trim(),
          category: category || 'general',
          date: date ? new Date(date) : new Date(),
          groupId: groupId || null,
          createdById: payload.userId,
          splitMethod: 'equal',
          // Create splits for all members
          splits: {
            create: members.map((member) => ({
              userId: member.userId,
              amount: splitAmount,
              // The person who paid doesn't owe themselves
              paidAmount: member.userId === payload.userId ? splitAmount : 0,
              settled: member.userId === payload.userId,
            })),
          },
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
      });

      return newExpense;
    });

    return NextResponse.json({ success: true, expense });
  } catch (error) {
    console.error('Create expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

