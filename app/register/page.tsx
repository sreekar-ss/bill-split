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

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Registration failed');
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

          {/* Register Card */}
          <Card sx={{ width: '100%' }}>
            <CardContent sx={{ p: 4 }}>
              <Typography variant="h5" fontWeight={600} gutterBottom textAlign="center">
                Create Your Account
              </Typography>
              <Typography variant="body2" color="text.secondary" textAlign="center" sx={{ mb: 3 }}>
                Start splitting expenses with friends
              </Typography>

              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label="Full Name"
                    type="text"
                    fullWidth
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
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
                    autoComplete="new-password"
                    helperText="At least 6 characters"
                  />
                  <TextField
                    label="Confirm Password"
                    type="password"
                    fullWidth
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <Button
                    type="submit"
                    variant="contained"
                    size="large"
                    fullWidth
                    disabled={loading}
                    sx={{ mt: 2 }}
                  >
                    {loading ? 'Creating Account...' : 'Sign Up'}
                  </Button>
                </Stack>
              </form>

              <Divider sx={{ my: 3 }}>or</Divider>

              <Typography variant="body2" textAlign="center" color="text.secondary">
                Already have an account?{' '}
                <Link href="/login" style={{ color: 'inherit', fontWeight: 600 }}>
                  Sign In
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

