'use client';

import Link from 'next/link';
import { 
  Box, 
  Button, 
  Container, 
  Typography, 
  Grid, 
  Card, 
  CardContent,
  Stack 
} from '@mui/material';
import { 
  PeopleAlt, 
  Receipt, 
  AccountBalanceWallet, 
  TrendingUp,
  CheckCircle,
  Speed
} from '@mui/icons-material';

export default function Home() {
  const features = [
    {
      icon: <Receipt sx={{ fontSize: 40 }} />,
      title: 'Easy Expense Tracking',
      description: 'Add expenses in seconds with our intuitive interface and receipt scanning'
    },
    {
      icon: <PeopleAlt sx={{ fontSize: 40 }} />,
      title: 'Group Management',
      description: 'Create groups for trips, apartments, or any shared expenses'
    },
    {
      icon: <AccountBalanceWallet sx={{ fontSize: 40 }} />,
      title: 'Smart Settlements',
      description: 'Automatically calculate who owes whom and minimize transactions'
    },
    {
      icon: <TrendingUp sx={{ fontSize: 40 }} />,
      title: 'Spending Analytics',
      description: 'Visualize your spending patterns and track budgets'
    },
    {
      icon: <Speed sx={{ fontSize: 40 }} />,
      title: 'Real-time Updates',
      description: 'See changes instantly as your group adds expenses'
    },
    {
      icon: <CheckCircle sx={{ fontSize: 40 }} />,
      title: 'Multiple Split Methods',
      description: 'Split equally, by percentage, exact amounts, or itemize receipts'
    }
  ];

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      {/* Hero Section */}
      <Box
        sx={{
          bgcolor: 'primary.main',
          color: 'white',
          pt: 8,
          pb: 12,
          background: 'linear-gradient(135deg, #1DB954 0%, #0D7A3A 100%)'
        }}
      >
        <Container maxWidth="lg">
          <Stack spacing={4} alignItems="center" textAlign="center">
            <Typography variant="h1" component="h1" sx={{ fontWeight: 800, fontSize: { xs: '2.5rem', md: '4rem' } }}>
              Split Bills Made Simple
            </Typography>
            <Typography variant="h5" sx={{ maxWidth: 800, opacity: 0.95 }}>
              Share expenses with friends, track group spending, and settle up seamlessly. 
              The modern way to manage shared costs.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Link href="/register" style={{ textDecoration: 'none' }}>
                <Button
                  variant="contained"
                  size="large"
                  fullWidth
                  sx={{
                    bgcolor: 'white',
                    color: 'primary.main',
                    px: 4,
                    py: 1.5,
                    fontSize: '1.1rem',
                    '&:hover': {
                      bgcolor: 'grey.100',
                    },
                  }}
                >
                  Get Started Free
                </Button>
              </Link>
              <Link href="/login" style={{ textDecoration: 'none' }}>
                <Button
                  variant="outlined"
                  size="large"
                  fullWidth
                  sx={{
                    borderColor: 'white',
                    color: 'white',
                    px: 4,
                    py: 1.5,
                    fontSize: '1.1rem',
                    '&:hover': {
                      borderColor: 'white',
                      bgcolor: 'rgba(255,255,255,0.1)',
                    },
                  }}
                >
                  Sign In
                </Button>
              </Link>
            </Stack>
          </Stack>
        </Container>
      </Box>

      {/* Features Section */}
      <Container maxWidth="lg" sx={{ py: 10 }}>
        <Typography 
          variant="h2" 
          component="h2" 
          textAlign="center" 
          gutterBottom
          sx={{ mb: 6 }}
        >
          Everything You Need
        </Typography>
        <Grid container spacing={4}>
          {features.map((feature, index) => (
            <Grid size={{ xs: 12, sm: 6, md: 4 }} key={index}>
              <Card 
                sx={{ 
                  height: '100%',
                  transition: 'transform 0.3s, box-shadow 0.3s',
                  '&:hover': {
                    transform: 'translateY(-8px)',
                    boxShadow: '0 12px 24px rgba(0,0,0,0.12)',
                  },
                }}
              >
                <CardContent sx={{ textAlign: 'center', p: 4 }}>
                  <Box sx={{ color: 'primary.main', mb: 2 }}>
                    {feature.icon}
                  </Box>
                  <Typography variant="h5" component="h3" gutterBottom fontWeight={600}>
                    {feature.title}
                  </Typography>
                  <Typography variant="body1" color="text.secondary">
                    {feature.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>
      </Container>

      {/* CTA Section */}
      <Box sx={{ bgcolor: 'grey.100', py: 8 }}>
        <Container maxWidth="md">
          <Stack spacing={3} alignItems="center" textAlign="center">
            <Typography variant="h3" component="h2" fontWeight={700}>
              Ready to Simplify Your Expenses?
            </Typography>
            <Typography variant="h6" color="text.secondary">
              Join thousands of users who split smarter with BillSplit
            </Typography>
            <Link href="/register" style={{ textDecoration: 'none' }}>
              <Button
                variant="contained"
                size="large"
                sx={{
                  px: 5,
                  py: 2,
                  fontSize: '1.2rem',
                }}
              >
                Start Splitting Now
              </Button>
            </Link>
          </Stack>
        </Container>
      </Box>

      {/* Footer */}
      <Box sx={{ bgcolor: 'grey.900', color: 'white', py: 4 }}>
        <Container maxWidth="lg">
          <Typography variant="body2" textAlign="center">
            © 2025 BillSplit. Built with ❤️ for better expense sharing.
          </Typography>
        </Container>
      </Box>
    </Box>
  );
}
