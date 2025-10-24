'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  TextField,
  Typography,
  Alert,
  Stack,
  Divider,
} from '@mui/material';
import { AccountBalanceWallet } from '@mui/icons-material';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      // Store token
      localStorage.setItem('token', data.token);
      
      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        bgcolor: 'background.default',
        py: 4,
      }}
    >
      <Container maxWidth="sm">
        <Stack spacing={3} alignItems="center">
          {/* Logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <AccountBalanceWallet sx={{ fontSize: 40, color: 'primary.main' }} />
            <Typography variant="h4" fontWeight={700} color="primary.main">
              BillSplit
            </Typography>
          </Box>

          {/* Login Card */}
          <Card sx={{ width: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h5" fontWeight={600} gutterBottom textAlign="center">
                Welcome Back
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
                Sign in to continue splitting expenses
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label="Email"
                    type="email"
                    fullWidth
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    fullWidth
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={loading}
                    sx={{ mt: 2 }}
                  >
                    {loading ? 'Signing In...' : 'Sign In'}
                  </Button>
                </Stack>
              </form>

              <Divider sx={{ my: 3 }}>or</Divider>

              <Typography variant="body2" textAlign="center" color="text.secondary">
                Don't have an account?{' '}
                <Link href="/register" style={{ color: 'inherit', fontWeight: 600 }}>
                  Sign Up
                </Link>
              </Typography>
            </CardContent>
          </Card>

          <Button component={Link} href="/" variant="text">
            ← Back to Home
          </Button>
        </Stack>
      </Container>
    </Box>
  );
}

