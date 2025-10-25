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
  Divider,
  List,
  ListItem,
  ListItemText,
  AvatarGroup,
} from '@mui/material';
import {
  ArrowBack,
  Add,
  PersonAdd,
  Receipt,
  AccountBalanceWallet,
} from '@mui/icons-material';
import { groupsApi, expensesApi } from '@/lib/api';
import { formatCurrency, formatDate, simplifyDebts } from '@/lib/utils';

export default function GroupDetailPage() {
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<any>(null);
  const [addMemberDialogOpen, setAddMemberDialogOpen] = useState(false);
  const [addExpenseDialogOpen, setAddExpenseDialogOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');
  const [expenseDescription, setExpenseDescription] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadGroup();
  }, [groupId]);

  const loadGroup = async () => {
    try {
      const data = await groupsApi.getById(groupId);
      setGroup(data.group);
    } catch (error) {
      console.error('Failed to load group:', error);
      router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMember = async () => {
    if (!memberEmail.trim()) {
      setError('Email is required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await groupsApi.addMember(groupId, memberEmail);
      setAddMemberDialogOpen(false);
      setMemberEmail('');
      loadGroup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExpense = async () => {
    if (!expenseDescription.trim() || !expenseAmount) {
      setError('Description and amount are required');
      return;
    }

    const amount = parseFloat(expenseAmount);
    if (isNaN(amount) || amount <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await expensesApi.create({
        groupId,
        description: expenseDescription,
        amount,
      });
      setAddExpenseDialogOpen(false);
      setExpenseDescription('');
      setExpenseAmount('');
      loadGroup();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate balances with debt simplification
  const calculateBalances = () => {
    if (!group?.expenses) return [];

    // Step 1: Calculate net balance for each user
    const netBalances: Record<string, number> = {};

    group.expenses.forEach((expense: any) => {
      const paidBy = expense.createdById;
      
      expense.splits.forEach((split: any) => {
        if (!split.settled) {
          // The person who paid should receive money
          netBalances[paidBy] = (netBalances[paidBy] || 0) + split.amount;
          // The person who owes should pay money
          netBalances[split.userId] = (netBalances[split.userId] || 0) - split.amount;
        }
      });
    });

    // Step 2: Simplify debts to minimize transactions
    const simplifiedDebts = simplifyDebts(netBalances);

    // Step 3: Map user IDs to names
    const result = simplifiedDebts.map((debt) => {
      const fromUser = group.members.find((m: any) => m.user.id === debt.from)?.user;
      const toUser = group.members.find((m: any) => m.user.id === debt.to)?.user;
      
      return {
        from: fromUser?.name || 'Unknown',
        to: toUser?.name || 'Unknown',
        amount: debt.amount,
      };
    });

    return result;
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!group) {
    return null;
  }

  const balances = calculateBalances();

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => router.push('/dashboard')}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            {group.name}
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        {/* Group Info */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="start" sx={{ mb: 2 }}>
              <Box>
                <Typography variant="h5" fontWeight={600} gutterBottom>
                  {group.name}
                </Typography>
                {group.description && (
                  <Typography variant="body2" color="text.secondary">
                    {group.description}
                  </Typography>
                )}
              </Box>
              <Button
                variant="outlined"
                startIcon={<PersonAdd />}
                onClick={() => setAddMemberDialogOpen(true)}
              >
                Add Member
              </Button>
            </Stack>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="body2" color="text.secondary">
                Members:
              </Typography>
              <AvatarGroup max={5}>
                {group.members.map((member: any) => (
                  <Avatar key={member.user.id} sx={{ bgcolor: 'primary.main' }}>
                    {member.user.name[0].toUpperCase()}
                  </Avatar>
                ))}
              </AvatarGroup>
              <Typography variant="body2" color="text.secondary">
                {group.members.map((m: any) => m.user.name).join(', ')}
              </Typography>
            </Stack>
          </CardContent>
        </Card>

        {/* Balances */}
        {balances.length > 0 && (
          <Card sx={{ mb: 3, bgcolor: 'success.50' }}>
            <CardContent>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 2 }}>
                <AccountBalanceWallet color="success" />
                <Typography variant="h6" fontWeight={600}>
                  Balances
                </Typography>
              </Stack>
              <List dense>
                {balances.map((balance, index) => (
                  <ListItem key={index}>
                    <ListItemText
                      primary={
                        <Typography>
                          <strong>{balance.from}</strong> owes <strong>{balance.to}</strong>{' '}
                          <Chip
                            label={formatCurrency(balance.amount)}
                            size="small"
                            color="success"
                            sx={{ ml: 1 }}
                          />
                        </Typography>
                      }
                    />
                  </ListItem>
                ))}
              </List>
            </CardContent>
          </Card>
        )}

        {/* Expenses */}
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <Typography variant="h6" fontWeight={600}>
            Expenses
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setAddExpenseDialogOpen(true)}
          >
            Add Expense
          </Button>
        </Stack>

        {group.expenses.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <Receipt sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No expenses yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Add your first expense to start splitting costs
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
            {group.expenses.map((expense: any) => (
              <Card key={expense.id}>
                <CardContent>
                  <Stack direction="row" justifyContent="space-between" alignItems="start">
                    <Box sx={{ flex: 1 }}>
                      <Typography variant="h6" fontWeight={600}>
                        {expense.description}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        Paid by {expense.createdBy.name} • {formatDate(expense.date)}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                        <Chip label={expense.category} size="small" />
                        <Chip
                          label={`Split ${expense.splits.length} ways`}
                          size="small"
                          variant="outlined"
                        />
                      </Stack>
                    </Box>
                    <Typography variant="h5" fontWeight={700} color="primary.main">
                      {formatCurrency(expense.amount)}
                    </Typography>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Container>

      {/* Add Member Dialog */}
      <Dialog open={addMemberDialogOpen} onClose={() => setAddMemberDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Member to Group</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the email address of the person you want to add. They must already have an account.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Email Address"
            type="email"
            fullWidth
            required
            value={memberEmail}
            onChange={(e) => setMemberEmail(e.target.value)}
            placeholder="friend@example.com"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddMemberDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAddMember} variant="contained" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Member'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add Expense Dialog */}
      <Dialog open={addExpenseDialogOpen} onClose={() => setAddExpenseDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Expense</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Description"
            fullWidth
            required
            value={expenseDescription}
            onChange={(e) => setExpenseDescription(e.target.value)}
            placeholder="e.g., Dinner at restaurant"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Amount"
            type="number"
            fullWidth
            required
            value={expenseAmount}
            onChange={(e) => setExpenseAmount(e.target.value)}
            placeholder="0.00"
            inputProps={{ min: 0, step: 0.01 }}
          />
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This will be split equally among all {group.members.length} members
          </Typography>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddExpenseDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAddExpense} variant="contained" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Expense'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

