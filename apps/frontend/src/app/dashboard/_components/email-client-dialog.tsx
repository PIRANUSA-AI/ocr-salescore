'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ExternalLink } from 'lucide-react';

interface EmailClientDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  email: string;
}

export function EmailClientDialog({ isOpen, onOpenChange, email }: EmailClientDialogProps) {

  const handleOpenClient = (client: 'gmail' | 'outlook') => {
    let mailUrl = '';
    
    if (client === 'gmail') {
      const encodedEmail = encodeURIComponent(email);
      mailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodedEmail}`;
    } else {
      mailUrl = `mailto:${email}`;
    }
    
    window.open(mailUrl, '_blank');
    onOpenChange(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Buka Klien Email</DialogTitle>
          <DialogDescription>
            Pilih aplikasi yang ingin Anda gunakan untuk mengirim email ke <span className="font-semibold text-primary">{email}</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <Button
            onClick={() => handleOpenClient('gmail')}
            className='bg-red-600 hover:bg-red-700 text-white'
          >
            <ExternalLink className="mr-2 h-4 w-4" /> Lanjutkan ke Gmail
          </Button>
          <Button
            onClick={() => handleOpenClient('outlook')}
            className='bg-blue-600 hover:bg-blue-700 text-white'
          >
            <ExternalLink className="mr-2 h-4 w-4" /> Buka Aplikasi Email Default
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
