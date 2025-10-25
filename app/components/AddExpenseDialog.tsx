'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Alert,
  Box,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  Stack,
  IconButton,
  Chip,
  Divider,
} from '@mui/material';
import { Add, Delete } from '@mui/icons-material';

interface Member {
  userId: string;
  name: string;
}

interface AddExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  members: Member[];
  onSubmit: (expenseData: any) => Promise<void>;
  groupId?: string;
  friendId?: string;
}

export default function AddExpenseDialog({
  open,
  onClose,
  members,
  onSubmit,
  groupId,
  friendId,
}: AddExpenseDialogProps) {
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [splitMethod, setSplitMethod] = useState<'equal' | 'percentage' | 'exact' | 'itemized'>('equal');
  const [customSplits, setCustomSplits] = useState<Array<{ userId: string; value: number }>>([]);
  const [items, setItems] = useState<Array<{ name: string; amount: number; sharedBy: string[] }>>([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      // Initialize custom splits with members
      setCustomSplits(members.map(m => ({ userId: m.userId, value: 0 })));
    }
  }, [open, members]);

  const handleClose = () => {
    setDescription('');
    setAmount('');
    setSplitMethod('equal');
    setCustomSplits([]);
    setItems([]);
    setError('');
    onClose();
  };

  const handleSubmit = async () => {
    setError('');
    
    if (!description.trim()) {
      setError('Description is required');
      return;
    }

    const totalAmount = parseFloat(amount);
    if (!totalAmount || totalAmount <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    // Validate based on split method
    if (splitMethod === 'percentage') {
      const total = customSplits.reduce((sum, s) => sum + s.value, 0);
      if (Math.abs(total - 100) > 0.01) {
        setError('Percentages must sum to 100%');
        return;
      }
    } else if (splitMethod === 'exact') {
      const total = customSplits.reduce((sum, s) => sum + s.value, 0);
      if (Math.abs(total - totalAmount) > 0.01) {
        setError(`Amounts must sum to $${totalAmount.toFixed(2)}`);
        return;
      }
    } else if (splitMethod === 'itemized') {
      if (items.length === 0) {
        setError('Add at least one item');
        return;
      }
      const itemsTotal = items.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(itemsTotal - totalAmount) > 0.01) {
        setError(`Items total must equal $${totalAmount.toFixed(2)}`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const data: any = {
        description,
        amount: totalAmount,
        splitMethod,
        ...(groupId && { groupId }),
        ...(friendId && { friendId }),
      };

      if (splitMethod === 'percentage') {
        data.customSplits = customSplits.map(s => ({ userId: s.userId, percentage: s.value }));
      } else if (splitMethod === 'exact') {
        data.customSplits = customSplits.map(s => ({ userId: s.userId, amount: s.value }));
      } else if (splitMethod === 'itemized') {
        data.items = items;
      }

      await onSubmit(data);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to add expense');
    } finally {
      setSubmitting(false);
    }
  };

  const addItem = () => {
    setItems([...items, { name: '', amount: 0, sharedBy: [] }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const updateItem = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const toggleItemMember = (itemIndex: number, userId: string) => {
    const updated = [...items];
    const sharedBy = updated[itemIndex].sharedBy;
    if (sharedBy.includes(userId)) {
      updated[itemIndex].sharedBy = sharedBy.filter(id => id !== userId);
    } else {
      updated[itemIndex].sharedBy = [...sharedBy, userId];
    }
    setItems(updated);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Add Expense</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        
        <TextField
          autoFocus
          margin="dense"
          label="Description"
          fullWidth
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g., Dinner at restaurant"
          sx={{ mb: 2 }}
        />
        
        <TextField
          margin="dense"
          label="Total Amount"
          type="number"
          fullWidth
          required
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          inputProps={{ min: 0, step: 0.01 }}
          sx={{ mb: 3 }}
        />

        <Typography variant="subtitle2" gutterBottom>Split Method</Typography>
        <ToggleButtonGroup
          value={splitMethod}
          exclusive
          onChange={(_, val) => val && setSplitMethod(val)}
          fullWidth
          sx={{ mb: 3 }}
        >
          <ToggleButton value="equal">Equal</ToggleButton>
          <ToggleButton value="percentage">Percentage</ToggleButton>
          <ToggleButton value="exact">Exact</ToggleButton>
          <ToggleButton value="itemized">Itemized</ToggleButton>
        </ToggleButtonGroup>

        {splitMethod === 'equal' && (
          <Typography variant="body2" color="text.secondary">
            Split equally among {members.length} {members.length === 1 ? 'person' : 'people'}
          </Typography>
        )}

        {splitMethod === 'percentage' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Specify percentage for each person (must sum to 100%)
            </Typography>
            {members.map((member, idx) => (
              <Stack key={member.userId} direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ minWidth: 120 }}>{member.name}</Typography>
                <TextField
                  type="number"
                  size="small"
                  value={customSplits[idx]?.value || 0}
                  onChange={(e) => {
                    const updated = [...customSplits];
                    updated[idx] = { userId: member.userId, value: parseFloat(e.target.value) || 0 };
                    setCustomSplits(updated);
                  }}
                  inputProps={{ min: 0, max: 100, step: 0.1 }}
                  sx={{ width: 100 }}
                />
                <Typography>%</Typography>
              </Stack>
            ))}
            <Typography variant="caption" color={customSplits.reduce((s, c) => s + c.value, 0) === 100 ? 'success.main' : 'error'}>
              Total: {customSplits.reduce((s, c) => s + c.value, 0).toFixed(1)}%
            </Typography>
          </Box>
        )}

        {splitMethod === 'exact' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Specify exact amount for each person
            </Typography>
            {members.map((member, idx) => (
              <Stack key={member.userId} direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
                <Typography sx={{ minWidth: 120 }}>{member.name}</Typography>
                <TextField
                  type="number"
                  size="small"
                  value={customSplits[idx]?.value || 0}
                  onChange={(e) => {
                    const updated = [...customSplits];
                    updated[idx] = { userId: member.userId, value: parseFloat(e.target.value) || 0 };
                    setCustomSplits(updated);
                  }}
                  inputProps={{ min: 0, step: 0.01 }}
                  sx={{ width: 120 }}
                />
              </Stack>
            ))}
            <Typography variant="caption" color={Math.abs(customSplits.reduce((s, c) => s + c.value, 0) - parseFloat(amount || '0')) < 0.01 ? 'success.main' : 'error'}>
              Total: ${customSplits.reduce((s, c) => s + c.value, 0).toFixed(2)}
            </Typography>
          </Box>
        )}

        {splitMethod === 'itemized' && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Add items and select who shares each
            </Typography>
            {items.map((item, idx) => (
              <Box key={idx} sx={{ mb: 2, p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Stack direction="row" spacing={2} sx={{ mb: 2 }}>
                  <TextField
                    size="small"
                    label="Item name"
                    value={item.name}
                    onChange={(e) => updateItem(idx, 'name', e.target.value)}
                    sx={{ flex: 1 }}
                  />
                  <TextField
                    size="small"
                    label="Amount"
                    type="number"
                    value={item.amount}
                    onChange={(e) => updateItem(idx, 'amount', parseFloat(e.target.value) || 0)}
                    inputProps={{ min: 0, step: 0.01 }}
                    sx={{ width: 120 }}
                  />
                  <IconButton onClick={() => removeItem(idx)} color="error" size="small">
                    <Delete />
                  </IconButton>
                </Stack>
                <Typography variant="caption" sx={{ mb: 1, display: 'block' }}>Shared by:</Typography>
                <Stack direction="row" spacing={1} flexWrap="wrap">
                  {members.map((member) => (
                    <Chip
                      key={member.userId}
                      label={member.name}
                      onClick={() => toggleItemMember(idx, member.userId)}
                      color={item.sharedBy.includes(member.userId) ? 'primary' : 'default'}
                      variant={item.sharedBy.includes(member.userId) ? 'filled' : 'outlined'}
                      size="small"
                    />
                  ))}
                </Stack>
              </Box>
            ))}
            <Button startIcon={<Add />} onClick={addItem} variant="outlined" size="small">
              Add Item
            </Button>
            <Typography variant="caption" display="block" sx={{ mt: 1 }} color={Math.abs(items.reduce((s, i) => s + i.amount, 0) - parseFloat(amount || '0')) < 0.01 ? 'success.main' : 'error'}>
              Items total: ${items.reduce((s, i) => s + i.amount, 0).toFixed(2)}
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} disabled={submitting}>Cancel</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={submitting}>
          {submitting ? 'Adding...' : 'Add Expense'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

