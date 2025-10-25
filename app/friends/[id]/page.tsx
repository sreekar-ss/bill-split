'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Avatar,
  Stack,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Chip,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  Receipt,
  CheckCircle,
  AccountBalanceWallet,
} from '@mui/icons-material';
import { formatCurrency, formatDate, simplifyDebts } from '@/lib/utils';
import AddExpenseDialog from '@/app/components/AddExpenseDialog';

export default function FriendDetailPage() {
  const router = useRouter();
  const params = useParams();
  const friendId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [friend, setFriend] = useState<any>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [settlements, setSettlements] = useState<any[]>([]);
  const [addExpenseDialogOpen, setAddExpenseDialogOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUser({
        id: payload.userId,
        name: payload.email.split('@')[0],
      });
    } catch (error) {
      console.error('Invalid token:', error);
      router.push('/login');
      return;
    }

    loadFriend();
  }, [friendId]);

  const loadFriend = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`/api/friends/${friendId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load friend');
      }

      const data = await response.json();
      setFriend(data.friend);
      setExpenses(data.expenses);
      setSettlements(data.settlements || []);
    } catch (error) {
      console.error('Failed to load friend:', error);
      router.push('/friends');
    } finally {
      setLoading(false);
    }
  };

  const handleAddExpense = async (expenseData: any) => {
    const token = localStorage.getItem('token');
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(expenseData),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to add expense');
    }

    loadFriend();
  };

  // Calculate balance
  const calculateBalance = () => {
    if (!expenses || !friend) return 0;

    let balance = 0;
    const token = localStorage.getItem('token');
    // TODO: Get actual user ID from token
    
    expenses.forEach((expense) => {
      expense.splits.forEach((split: any) => {
        if (!split.settled) {
          if (split.userId !== expense.createdById) {
            // Someone owes the person who paid
            if (split.user.id === friend.id) {
              // Friend owes user
              balance += split.amount;
            } else {
              // User owes friend
              balance -= split.amount;
            }
          }
        }
      });
    });

    return balance;
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!friend) {
    return null;
  }

  const balance = calculateBalance();
  const isOwed = balance > 0;
  const absBalance = Math.abs(balance);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <AppBar position="sticky" elevation={1} sx={{ top: 0, zIndex: 1100 }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => router.push('/friends')}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            {friend.name}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Friend Info */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={3}>
              <Avatar sx={{ bgcolor: 'primary.main', width: 72, height: 72, fontSize: '2rem' }}>
                {friend.name[0].toUpperCase()}
              </Avatar>
              <Box sx={{ flex: 1 }}>
                <Typography variant="h5" fontWeight={600}>
                  {friend.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {friend.email}
                </Typography>
              </Box>
            </Stack>
          </CardContent>
        </Card>

        {/* Balance */}
        {absBalance > 0 && (
          <Card sx={{ mb: 3, bgcolor: isOwed ? 'success.50' : 'warning.50' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <AccountBalanceWallet color={isOwed ? 'success' : 'warning'} />
                <Typography variant="h6" fontWeight={600}>
                  Balance
                </Typography>
              </Stack>
              <Typography variant="h4" fontWeight={700} color={isOwed ? 'success.main' : 'warning.main'}>
                {isOwed ? `${friend.name} owes you ` : `You owe ${friend.name} `}
                {formatCurrency(absBalance)}
              </Typography>
            </CardContent>
          </Card>
        )}

        {absBalance === 0 && expenses.length > 0 && (
          <Card sx={{ mb: 3, bgcolor: 'success.50' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1}>
                <CheckCircle color="success" />
                <Typography variant="h6" fontWeight={600} color="success.dark">
                  All settled up!
                </Typography>
              </Stack>
            </CardContent>
          </Card>
        )}

        {/* Activity Timeline */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Activity
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setAddExpenseDialogOpen(true)}
          >
            Add Expense
          </Button>
        </Stack>

        {expenses.length === 0 && settlements.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <Receipt sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No expenses yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Add your first expense with {friend.name}
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setAddExpenseDialogOpen(true)}
              >
                Add First Expense
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Stack spacing={2}>
            {/* Merge expenses and settlements */}
            {[
              ...expenses.map((e: any) => ({ ...e, type: 'expense', date: new Date(e.date) })),
              ...settlements.map((s: any) => ({ ...s, type: 'settlement', date: new Date(s.settledAt) })),
            ]
              .sort((a, b) => b.date.getTime() - a.date.getTime())
              .map((item: any) =>
                item.type === 'expense' ? (
                  <Card key={`expense-${item.id}`}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="start">
                        <Box sx={{ flex: 1 }}>
                          <Typography variant="h6" fontWeight={600}>
                            {item.description}
                          </Typography>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            Paid by {item.createdBy.name} • {formatDate(item.date)}
                          </Typography>
                          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                            <Chip label={item.category} size="small" />
                            <Chip label="Split equally" size="small" variant="outlined" />
                          </Stack>
                        </Box>
                        <Typography variant="h5" fontWeight={700} color="primary.main">
                          {formatCurrency(item.amount)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                ) : (
                  <Card key={`settlement-${item.id}`} sx={{ bgcolor: 'success.50', borderLeft: 4, borderColor: 'success.main' }}>
                    <CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="start">
                        <Box sx={{ flex: 1 }}>
                          <Stack direction="row" alignItems="center" spacing={1}>
                            <CheckCircle color="success" />
                            <Typography variant="h6" fontWeight={600} color="success.dark">
                              Payment recorded
                            </Typography>
                          </Stack>
                          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                            {item.fromUser.name} paid {item.toUser.name} • {formatDate(item.date)}
                          </Typography>
                          <Chip label="Settlement" size="small" color="success" sx={{ mt: 1 }} />
                        </Box>
                        <Typography variant="h5" fontWeight={700} color="success.main">
                          {formatCurrency(item.amount)}
                        </Typography>
                      </Stack>
                    </CardContent>
                  </Card>
                )
              )}
          </Stack>
        )}
      </Container>

      {currentUser && friend && (
        <AddExpenseDialog
          open={addExpenseDialogOpen}
          onClose={() => setAddExpenseDialogOpen(false)}
          members={[
            { userId: currentUser.id, name: currentUser.name },
            { userId: friend.id, name: friend.name },
          ]}
          onSubmit={handleAddExpense}
          friendId={friendId}
        />
      )}
    </Box>
  );
}

