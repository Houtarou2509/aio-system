import { useState } from 'react';
import { LookupTabProps } from '@/types/lookup';
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Plus, Pencil, PowerOff, Power } from 'lucide-react';

export default function LookupTab({
  category: _category,
  values,
  isLoading,
  onAdd,
  onEdit,
  onToggle
}: LookupTabProps) {

  // --- local state ---
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [editTarget, setEditTarget] = useState<{ id: number; value: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // --- handlers ---
  function openAdd() {
    setInputValue('');
    setError('');
    setShowAddDialog(true);
  }

  function openEdit(id: number, value: string) {
    setEditTarget({ id, value });
    setInputValue(value);
    setError('');
    setShowEditDialog(true);
  }

  async function handleAdd() {
    if (!inputValue.trim()) {
      setError('Value cannot be empty.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onAdd(inputValue.trim());
      setShowAddDialog(false);
    } catch (e: any) {
      setError(e.message || 'Failed to add value.');
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit() {
    if (!inputValue.trim()) {
      setError('Value cannot be empty.');
      return;
    }
    if (!editTarget) return;
    setSaving(true);
    setError('');
    try {
      await onEdit(editTarget.id, inputValue.trim());
      setShowEditDialog(false);
    } catch (e: any) {
      setError(e.message || 'Failed to update value.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(id: number, isActive: boolean) {
    try {
      await onToggle(id, !isActive);
    } catch (e: any) {
      console.error('Toggle failed:', e.message);
    }
  }

  // --- render ---
  return (
    <div className="w-full">

      {/* Header row */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          Inactive values are hidden from dropdowns but never deleted.
        </p>
        <Button size="sm" onClick={openAdd}>
          <Plus className="w-4 h-4 mr-1" />
          Add New
        </Button>
      </div>

      {/* Table - FULL WIDTH */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground py-4">
          Loading...
        </p>
      ) : values.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">
          No values found. Add one to get started.
        </p>
      ) : (
        <div className="rounded-md border w-full">
          <Table className="w-full">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Value</TableHead>
                <TableHead className="w-[20%]">Status</TableHead>
                <TableHead className="w-[40%] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {values.map((item) => (
                <TableRow
                  key={item.id}
                  className={!item.isActive ? 'opacity-50' : ''}
                >
                  <TableCell className="font-medium">
                    {item.value}
                  </TableCell>
                  <TableCell>
                    {item.isActive ? (
                      <Badge variant="default">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openEdit(item.id, item.value)}
                    >
                      <Pencil className="w-3 h-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant={item.isActive ? 'destructive' : 'outline'}
                      onClick={() => handleToggle(item.id, item.isActive)}
                    >
                      {item.isActive ? (
                        <>
                          <PowerOff className="w-3 h-3 mr-1" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <Power className="w-3 h-3 mr-1" />
                          Activate
                        </>
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Value</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder="Enter value..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Add'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Value</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Input
              placeholder="Enter value..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleEdit();
              }}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
