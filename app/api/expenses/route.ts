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
    const { groupId, friendId, amount, description, category, date, splitMethod, customSplits, items } = body;

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

    const method = splitMethod || 'equal';
    if (!['equal', 'percentage', 'exact', 'itemized'].includes(method)) {
      return NextResponse.json({ error: 'Invalid split method' }, { status: 400 });
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

    // Calculate splits based on method
    let splits: Array<{ userId: string; amount: number; percentage?: number }> = [];

    if (method === 'equal') {
      const splitAmount = amount / members.length;
      splits = members.map((m) => ({ userId: m.userId, amount: splitAmount }));
    } else if (method === 'percentage') {
      if (!customSplits || !Array.isArray(customSplits)) {
        return NextResponse.json({ error: 'Custom splits required for percentage method' }, { status: 400 });
      }
      const totalPercentage = customSplits.reduce((sum: number, s: any) => sum + (s.percentage || 0), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return NextResponse.json({ error: 'Percentages must sum to 100' }, { status: 400 });
      }
      splits = customSplits.map((s: any) => ({
        userId: s.userId,
        amount: (amount * s.percentage) / 100,
        percentage: s.percentage,
      }));
    } else if (method === 'exact') {
      if (!customSplits || !Array.isArray(customSplits)) {
        return NextResponse.json({ error: 'Custom splits required for exact method' }, { status: 400 });
      }
      const totalAmount = customSplits.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
      if (Math.abs(totalAmount - amount) > 0.01) {
        return NextResponse.json({ error: 'Split amounts must equal total' }, { status: 400 });
      }
      splits = customSplits.map((s: any) => ({ userId: s.userId, amount: s.amount }));
    } else if (method === 'itemized') {
      if (!items || !Array.isArray(items)) {
        return NextResponse.json({ error: 'Items required for itemized method' }, { status: 400 });
      }
      const userAmounts: Record<string, number> = {};
      items.forEach((item: any) => {
        const sharedBy = item.sharedBy || [];
        const itemAmount = item.amount / sharedBy.length;
        sharedBy.forEach((userId: string) => {
          userAmounts[userId] = (userAmounts[userId] || 0) + itemAmount;
        });
      });
      splits = Object.entries(userAmounts).map(([userId, amount]) => ({ userId, amount }));
    }

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
          splitMethod: method,
          // Create splits
          splits: {
            create: splits.map((split) => ({
              userId: split.userId,
              amount: split.amount,
              percentage: split.percentage,
              paidAmount: split.userId === payload.userId ? split.amount : 0,
              settled: split.userId === payload.userId,
            })),
          },
          // Create items if itemized
          ...(method === 'itemized' && items ? {
            items: {
              create: items.map((item: any) => ({
                name: item.name,
                amount: item.amount,
                sharedBy: item.sharedBy,
              })),
            },
          } : {}),
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

