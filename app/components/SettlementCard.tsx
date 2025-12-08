import React from 'react';
import { Card, CardContent, Stack, Box, Typography, Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { CheckCircle } from '@mui/icons-material';
import { formatCurrency, formatDate } from '@/lib/utils';

interface SettlementLike {
  id: string;
  amount: number;
  date: string | Date;
  fromUser?: { name: string };
  toUser?: { name: string };
}

interface SettlementCardProps {
  item: SettlementLike;
}

export default function SettlementCard({ item }: SettlementCardProps) {
  const Container = styled(Card)(({ theme }) => ({
    backgroundColor: theme.palette.success[50] as any,
    borderLeft: 4,
    borderColor: theme.palette.success.main,
  }));

  const Amount = styled(Typography)(({ theme }) => ({
    fontWeight: 700,
    color: theme.palette.success.main,
  }));

  return (
    <Container key={`settlement-${item.id}`}>
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
              {(item.fromUser?.name || 'Someone')} paid {(item.toUser?.name || 'someone')} • {formatDate(item.date)}
            </Typography>
            <Chip label="Settlement" size="small" color="success" sx={{ mt: 1 }} />
          </Box>
          <Amount variant="h5">{formatCurrency(item.amount)}</Amount>
        </Stack>
      </CardContent>
    </Container>
  );
}


