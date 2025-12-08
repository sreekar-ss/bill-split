import React from 'react';
import { Card, CardContent, Typography, Button } from '@mui/material';
import { Receipt, Add } from '@mui/icons-material';

interface ActivityEmptyStateProps {
  onAddExpense: () => void;
}

export default function ActivityEmptyState({ onAddExpense }: ActivityEmptyStateProps) {
  return (
    <Card>
      <CardContent sx={{ textAlign: 'center', py: 6 }}>
        <Receipt sx={{ fontSize: 60, color: 'text.secondary', mb: 2 }} />
        <Typography variant="h6" gutterBottom>
          No activity yet
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Add your first expense to start splitting costs
        </Typography>
        <Button variant="contained" startIcon={<Add />} onClick={onAddExpense}>
          Add Expense
        </Button>
      </CardContent>
    </Card>
  );
}


