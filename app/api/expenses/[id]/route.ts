import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// PATCH /api/expenses/[id] - Update an expense
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if expense exists and user is the creator
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        splits: true,
        items: true,
      },
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    if (expense.createdById !== payload.userId) {
      return NextResponse.json({ error: 'Not authorized to edit this expense' }, { status: 403 });
    }

    // Check if any splits are settled
    const hasSettledSplits = expense.splits.some(split => split.settled && split.userId !== payload.userId);
    if (hasSettledSplits) {
      return NextResponse.json({ error: 'Cannot edit expense with settled splits' }, { status: 400 });
    }

    const body = await request.json();
    const { amount, description, category, date, splitMethod, customSplits, items } = body;

    // Validation
    if (amount && amount <= 0) {
      return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 });
    }

    const method = splitMethod || expense.splitMethod;
    if (!['equal', 'percentage', 'exact', 'itemized'].includes(method)) {
      return NextResponse.json({ error: 'Invalid split method' }, { status: 400 });
    }

    // Get members
    let members: { userId: string }[] = [];
    if (expense.groupId) {
      members = await prisma.groupMember.findMany({
        where: { groupId: expense.groupId },
        select: { userId: true },
      });
    } else {
      // Friend expense - get from existing splits
      members = expense.splits.map(s => ({ userId: s.userId }));
    }

    // Calculate new splits if amount or method changed
    let newSplits: Array<{ userId: string; amount: number; percentage?: number }> = [];
    const finalAmount = amount || expense.amount;

    if (method === 'equal') {
      const splitAmount = finalAmount / members.length;
      newSplits = members.map((m) => ({ userId: m.userId, amount: splitAmount }));
    } else if (method === 'percentage') {
      if (!customSplits || !Array.isArray(customSplits)) {
        return NextResponse.json({ error: 'Custom splits required for percentage method' }, { status: 400 });
      }
      const totalPercentage = customSplits.reduce((sum: number, s: any) => sum + (s.percentage || 0), 0);
      if (Math.abs(totalPercentage - 100) > 0.01) {
        return NextResponse.json({ error: 'Percentages must sum to 100' }, { status: 400 });
      }
      newSplits = customSplits.map((s: any) => ({
        userId: s.userId,
        amount: (finalAmount * s.percentage) / 100,
        percentage: s.percentage,
      }));
    } else if (method === 'exact') {
      if (!customSplits || !Array.isArray(customSplits)) {
        return NextResponse.json({ error: 'Custom splits required for exact method' }, { status: 400 });
      }
      const totalAmount = customSplits.reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
      if (Math.abs(totalAmount - finalAmount) > 0.01) {
        return NextResponse.json({ error: 'Split amounts must equal total' }, { status: 400 });
      }
      newSplits = customSplits.map((s: any) => ({ userId: s.userId, amount: s.amount }));
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
      newSplits = Object.entries(userAmounts).map(([userId, amount]) => ({ userId, amount }));
    }

    // Update expense in transaction
    const updatedExpense = await prisma.$transaction(async (tx) => {
      // Delete old splits and items
      await tx.expenseSplit.deleteMany({ where: { expenseId: id } });
      await tx.expenseItem.deleteMany({ where: { expenseId: id } });

      // Update expense
      const updated = await tx.expense.update({
        where: { id },
        data: {
          ...(amount && { amount: parseFloat(amount) }),
          ...(description && { description: description.trim() }),
          ...(category && { category }),
          ...(date && { date: new Date(date) }),
          splitMethod: method,
          // Create new splits
          splits: {
            create: newSplits.map((split) => ({
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

      return updated;
    });

    return NextResponse.json({ success: true, expense: updatedExpense });
  } catch (error) {
    console.error('Update expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/expenses/[id] - Delete an expense
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const payload = verifyToken(token);
    if (!payload) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    // Check if expense exists and user is the creator
    const expense = await prisma.expense.findUnique({
      where: { id },
      include: {
        splits: true,
      },
    });

    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    if (expense.createdById !== payload.userId) {
      return NextResponse.json({ error: 'Not authorized to delete this expense' }, { status: 403 });
    }

    // Check if any splits are settled
    const hasSettledSplits = expense.splits.some(split => split.settled && split.userId !== payload.userId);
    if (hasSettledSplits) {
      return NextResponse.json({ error: 'Cannot delete expense with settled splits' }, { status: 400 });
    }

    // Delete expense (cascade will delete splits and items)
    await prisma.expense.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete expense error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

