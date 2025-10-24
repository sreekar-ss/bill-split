'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
  Button,
  AppBar,
  Toolbar,
  IconButton,
  Avatar,
  Stack,
  CircularProgress,
} from '@mui/material';
import {
  AccountBalanceWallet,
  PeopleAlt,
  Receipt,
  Logout,
  Add,
} from '@mui/icons-material';

interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if user is authenticated
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }

    // Get user data from token (in a real app, you'd verify this with an API call)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      // For now, we'll just use the token data
      // In production, you'd make an API call to get full user info
      setUser({
        id: payload.userId,
        name: 'Loading...', // We'll fetch this properly later
        email: payload.email,
      });
      
      // TODO: Fetch actual user data from API
      setTimeout(() => {
        setUser({
          id: payload.userId,
          name: payload.email.split('@')[0], // Temporary: use email username
          email: payload.email,
        });
        setLoading(false);
      }, 500);
    } catch (error) {
      console.error('Invalid token:', error);
      localStorage.removeItem('token');
      router.push('/login');
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

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
            <Typography variant="body2">{user?.email}</Typography>
            <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
              {user?.name?.[0]?.toUpperCase()}
            </Avatar>
            <IconButton color="inherit" onClick={handleLogout} title="Logout">
              <Logout />
            </IconButton>
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Main Content */}
      <Container maxWidth="lg" sx={{ py: 4 }}>
        <Typography variant="h4" fontWeight={700} gutterBottom>
          Welcome back, {user?.name}! 👋
        </Typography>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
          Manage your expenses and settle up with friends
        </Typography>

        {/* Quick Stats */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      bgcolor: 'primary.light',
                      color: 'white',
                      p: 1.5,
                      borderRadius: 2,
                    }}
                  >
                    <Receipt />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      0
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Total Expenses
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      bgcolor: 'secondary.light',
                      color: 'white',
                      p: 1.5,
                      borderRadius: 2,
                    }}
                  >
                    <PeopleAlt />
                  </Box>
                  <Box>
                    <Typography variant="h4" fontWeight={700}>
                      0
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Groups
                    </Typography>
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>

          <Grid xs={12} md={4}>
            <Card>
              <CardContent>
                <Stack direction="row" alignItems="center" spacing={2}>
                  <Box
                    sx={{
                      bgcolor: 'success.light',
                      color: 'white',
                      p: 1.5,
                      borderRadius: 2,
                    }}
                  >
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

        {/* Quick Actions */}
        <Card>
          <CardContent>
            <Typography variant="h6" fontWeight={600} gutterBottom>
              Quick Actions
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Get started by creating your first group or expense
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Button
                variant="contained"
                startIcon={<Add />}
                size="large"
                disabled
              >
                Add Expense
              </Button>
              <Button
                variant="outlined"
                startIcon={<PeopleAlt />}
                size="large"
                disabled
              >
                Create Group
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
              Note: These features will be implemented in the next phase
            </Typography>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}

