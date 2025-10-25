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
  Grid,
  Chip,
} from '@mui/material';
import {
  AccountBalanceWallet,
  PeopleAlt,
  Receipt,
  Logout,
  Add,
  Group,
} from '@mui/icons-material';
import { groupsApi } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

interface Group {
  id: string;
  name: string;
  description?: string;
  category?: string;
  members: Array<{
    user: User;
  }>;
  _count: {
    expenses: number;
  };
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDescription, setNewGroupDescription] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      setUser({
        id: payload.userId,
        name: payload.email.split('@')[0],
        email: payload.email,
      });
      
      loadGroups();
    } catch (error) {
      console.error('Invalid token:', error);
      localStorage.removeItem('token');
      router.push('/login');
    }
  }, [router]);

  const loadGroups = async () => {
    try {
      const data = await groupsApi.getAll();
      setGroups(data.groups);
    } catch (error) {
      console.error('Failed to load groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setError('Group name is required');
      return;
    }

    setCreating(true);
    setError('');

    try {
      await groupsApi.create({
        name: newGroupName,
        description: newGroupDescription,
      });

      setCreateDialogOpen(false);
      setNewGroupName('');
      setNewGroupDescription('');
      loadGroups();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <Box sx={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <CircularProgress />
      </Box>
    );
  }

  const totalExpenses = groups.reduce((sum, g) => sum + g._count.expenses, 0);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* App Bar */}
      <AppBar position="static" elevation={0}>
        <Toolbar>
          <AccountBalanceWallet sx={{ mr: 2 }} />
          <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
            BillSplit
          </Typography>
          <Stack direction="row" spacing={2} alignItems="center">
            <Button
              color="inherit"
              onClick={() => router.push('/friends')}
              sx={{ display: { xs: 'none', sm: 'flex' } }}
            >
              Friends
            </Button>
            <IconButton
              color="inherit"
              onClick={() => router.push('/friends')}
              sx={{ display: { xs: 'flex', sm: 'none' } }}
              title="Friends"
            >
              <Group />
            </IconButton>
            <Typography variant="body2" sx={{ display: { xs: 'none', sm: 'block' } }}>
              {user?.email}
            </Typography>
            <IconButton onClick={() => router.push('/profile')} sx={{ p: 0.5 }}>
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {user?.name?.[0]?.toUpperCase()}
              </Avatar>
            </IconButton>
            <IconButton color="inherit" onClick={handleLogout} title="Logout">
              <Logout />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Welcome back, {user?.name}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Manage your expenses and settle up with friends
        </Typography>

        {/* Quick Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ bgcolor: 'primary.light', color: 'white', p: 1.5, borderRadius: 2 }}>
                    <Receipt />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {totalExpenses}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Expenses
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ bgcolor: 'secondary.light', color: 'white', p: 1.5, borderRadius: 2 }}>
                    <PeopleAlt />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      {groups.length}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Groups
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box sx={{ bgcolor: 'success.light', color: 'white', p: 1.5, borderRadius: 2 }}>
                    <AccountBalanceWallet />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      $0.00
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Balance
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Groups Section */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h5" fontWeight={600}>
            Your Groups
          </Typography>
          <Button
            variant="contained"
            startIcon={<Add />}
            onClick={() => setCreateDialogOpen(true)}
          >
            Create Group
          </Button>
        </Box>

        {groups.length === 0 ? (
          <Card>
            <CardContent sx={{ textAlign: 'center', py: 6 }}>
              <PeopleAlt sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
              <Typography variant="h6" gutterBottom>
                No groups yet
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Create your first group to start splitting expenses
              </Typography>
              <Button
                variant="contained"
                startIcon={<Add />}
                onClick={() => setCreateDialogOpen(true)}
              >
                Create Your First Group
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Grid container spacing={3}>
            {groups.map((group) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={group.id}>
                <Card
                  sx={{
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    '&:hover': {
                      transform: 'translateY(-4px)',
                      boxShadow: 4,
                    },
                  }}
                  onClick={() => router.push(`/groups/${group.id}`)}
                >
                  <CardContent>
                    <Typography variant="h6" fontWeight={600} gutterBottom>
                      {group.name}
                    </Typography>
                    {group.description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        {group.description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                      <PeopleAlt fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {group.members.length} {group.members.length === 1 ? 'member' : 'members'}
                      </Typography>
                    </Stack>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Receipt fontSize="small" color="action" />
                      <Typography variant="body2" color="text.secondary">
                        {group._count.expenses} {group._count.expenses === 1 ? 'expense' : 'expenses'}
                      </Typography>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Container>

      {/* Create Group Dialog */}
      <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Create New Group</DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <TextField
            autoFocus
            margin="dense"
            label="Group Name"
            fullWidth
            required
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            placeholder="e.g., Weekend Trip, Apartment, Road Trip"
            sx={{ mb: 2 }}
          />
          <TextField
            margin="dense"
            label="Description (Optional)"
            fullWidth
            multiline
            rows={3}
            value={newGroupDescription}
            onChange={(e) => setNewGroupDescription(e.target.value)}
            placeholder="What's this group for?"
          />
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button onClick={() => setCreateDialogOpen(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreateGroup} variant="contained" disabled={creating}>
            {creating ? 'Creating...' : 'Create Group'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
