'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  List,
  ListItem,
  ListItemAvatar,
  ListItemText,
} from '@mui/material';
import {
  ArrowBack,
  PersonAdd,
  People,
  TrendingUp,
  TrendingDown,
} from '@mui/icons-material';
import { formatCurrency } from '@/lib/utils';

export default function FriendsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [friends, setFriends] = useState<any[]>([]);
  const [addFriendDialogOpen, setAddFriendDialogOpen] = useState(false);
  const [friendEmail, setFriendEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    loadFriends();
  }, []);

  const loadFriends = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/friends', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to load friends');
      }

      const data = await response.json();
      setFriends(data.friends);
    } catch (error) {
      console.error('Failed to load friends:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddFriend = async () => {
    if (!friendEmail.trim()) {
      setError('Email is required');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ friendEmail }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add friend');
      }

      setAddFriendDialogOpen(false);
      setFriendEmail('');
      loadFriends();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Header */}
      <AppBar position="sticky" elevation={1} sx={{ top: 0, zIndex: 1100 }}>
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => router.push('/dashboard')}>
            <ArrowBack />
          </IconButton>
          <Typography variant="h6" component="div" sx={{ flexGrow: 1, ml: 2 }}>
            Friends
          </Typography>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<PersonAdd />}
            onClick={() => setAddFriendDialogOpen(true)}
          >
            Add Friend
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Your Friends
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Add expenses and settle up with your friends
        </Typography>

        {friends.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 8 }}>
              <People sx={{ fontSize: 80, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h5" gutterBottom>
                No friends yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Add friends to start splitting expenses
              </Typography>
              <Button
                variant="contained"
                startIcon={<PersonAdd />}
                onClick={() => setAddFriendDialogOpen(true)}
              >
                Add Your First Friend
              </Button>
            </CardContent>
          </Card>
        ) : (
          <List>
            {friends.map((friendData) => {
              const { friend, balance, expenseCount } = friendData;
              const isOwed = balance > 0;
              const absBalance = Math.abs(balance);

              return (
                <Card
                  key={friend.id}
                  sx={{ mb: 2, cursor: 'pointer', '&:hover': { bgcolor: 'action.hover' } }}
                  onClick={() => router.push(`/friends/${friend.id}`)}
                >
                  <ListItem>
                    <ListItemAvatar>
                      <Avatar sx={{ bgcolor: 'primary.main', width: 56, height: 56 }}>
                        {friend.name[0].toUpperCase()}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Typography variant="h6" fontWeight={600}>
                          {friend.name}
                        </Typography>
                      }
                      secondary={
                        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
                          <Chip label={`${expenseCount} expenses`} size="small" variant="outlined" />
                          {absBalance > 0 && (
                            <Chip
                              icon={isOwed ? <TrendingUp /> : <TrendingDown />}
                              label={
                                isOwed
                                  ? `owes you ${formatCurrency(absBalance)}`
                                  : `you owe ${formatCurrency(absBalance)}`
                              }
                              size="small"
                              color={isOwed ? 'success' : 'warning'}
                            />
                          )}
                          {absBalance === 0 && <Chip label="Settled up" size="small" color="success" />}
                        </Stack>
                      }
                    />
                  </ListItem>
                </Card>
              );
            })}
          </List>
        )}
      </Container>

      {/* Add Friend Dialog */}
      <Dialog open={addFriendDialogOpen} onClose={() => setAddFriendDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Add Friend</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Enter the email address of your friend. They must have an account.
          </Typography>
          <TextField
            autoFocus
            margin="dense"
            label="Friend's Email"
            type="email"
            fullWidth
            required
            value={friendEmail}
            onChange={(e) => setFriendEmail(e.target.value)}
            placeholder="friend@example.com"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setAddFriendDialogOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleAddFriend} variant="contained" disabled={submitting}>
            {submitting ? 'Adding...' : 'Add Friend'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

