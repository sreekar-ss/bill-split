import React from 'react';
import { Card, CardContent, Stack, Box, Typography, Chip, IconButton } from '@mui/material';
import { styled } from '@mui/material/styles';
import { MoreVert } from '@mui/icons-material';
import { formatCurrency, formatDate, formatSplitMethod } from '@/lib/utils';
import type { Expense } from '@/lib/types';

interface ExpenseLike {
  id: string;
  description: string;
  amount: number;
  date: string | Date;
  category?: string;
  splitMethod: string;
  createdBy: { name: string };
  createdById: string;
}

type MenuOpenHandler = (event: React.MouseEvent<HTMLElement>, item: ExpenseLike | Expense) => void | undefined;

interface ExpenseCardProps {
  item: ExpenseLike;
  currentUserId?: string;
  onMenuOpen?: MenuOpenHandler;
}

const MetaRow = styled(Stack)(({ theme }) => ({
  marginTop: theme.spacing(1),
}));

const Amount = styled(Typography)(({ theme }) => ({
  fontWeight: 700,
  color: theme.palette.primary.main,
}));

export default function ExpenseCard({ item, currentUserId, onMenuOpen }: ExpenseCardProps) {

  return (
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
            <MetaRow direction="row" spacing={1}>
              <Chip label={item.category} size="small" />
              <Chip label={formatSplitMethod(item.splitMethod)} size="small" variant="outlined" />
            </MetaRow>
          </Box>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Amount variant="h5">{formatCurrency(item.amount)}</Amount>
            {onMenuOpen && item.createdById === currentUserId && (
              <IconButton size="small" onClick={(e) => onMenuOpen(e, item)}>
                <MoreVert />
              </IconButton>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}


