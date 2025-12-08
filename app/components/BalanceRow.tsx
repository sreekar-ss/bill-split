import React from 'react';
import { Box, Typography, Chip, Button } from '@mui/material';
import { styled } from '@mui/material/styles';
import { CheckCircle } from '@mui/icons-material';
import { formatCurrency } from '@/lib/utils';

export interface BalanceRowProps {
  from: string;
  to: string;
  amount: number;
  onSettle: () => void;
}

export default function BalanceRow({ from, to, amount, onSettle }: BalanceRowProps) {
  const Row = styled(Box)(({ theme }) => ({
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(2),
    alignItems: 'stretch',
    justifyContent: 'space-between',
    paddingTop: theme.spacing(1),
    paddingBottom: theme.spacing(1),
    [theme.breakpoints.up('sm')]: {
      flexDirection: 'row',
      alignItems: 'center',
    },
  }));

  return (
    <Row>
      <Typography sx={{ flex: 1 }}>
        <strong>{from}</strong> owes <strong>{to}</strong>{' '}
        <Chip label={formatCurrency(amount)} size="small" color="success" sx={{ ml: 1 }} />
      </Typography>
      <Button
        variant="contained"
        size="small"
        color="success"
        startIcon={<CheckCircle />}
        onClick={onSettle}
        sx={{ minWidth: { sm: 120 }, width: { xs: '100%', sm: 'auto' } }}
      >
        Settle Up
      </Button>
    </Row>
  );
}
