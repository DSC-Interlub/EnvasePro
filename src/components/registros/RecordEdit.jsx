import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { X, Save } from "lucide-react";

import EnvaseForm from "../registro/EnvaseForm";

export default function RecordEdit({ record, products, embalagens, operators, onClose }) {
  const queryClient = useQueryClient();

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.EnvaseRecord.update(record.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['envase-records'] });
      onClose();
    },
  });

  const handleSubmit = (formData) => {
    updateMutation.mutate(formData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex justify-between items-center">
            <DialogTitle className="text-2xl font-bold text-slate-900">
              Editar Registro
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="py-4">
          <EnvaseForm
            products={products}
            embalagens={embalagens}
            operators={operators}
            onSubmit={handleSubmit}
            isLoading={updateMutation.isPending}
            initialData={record}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}