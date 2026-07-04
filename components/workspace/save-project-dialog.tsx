"use client";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

export function SaveProjectDialog({
  open,
  onOpenChange,
  onConfirm,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (name: string, description?: string) => void;
  saving?: boolean;
}) {
  const [name, setName] = useState("My network");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save project</DialogTitle>
          <DialogDescription>
            Save this topology so you can reopen it later from your dashboard.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="proj-name">Name</Label>
            <Input id="proj-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My network" autoFocus />
          </div>
          <div className="space-y-2">
            <Label htmlFor="proj-desc">Description (optional)</Label>
            <Input id="proj-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Campus edge, VLANs..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button
            onClick={() => name.trim() && onConfirm(name.trim(), description.trim() || undefined)}
            disabled={saving || !name.trim()}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}