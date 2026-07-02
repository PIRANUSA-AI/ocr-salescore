

'use client';

import { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Smartphone, Mail, Send, History, Sparkles, Copy } from 'lucide-react';
import { type Customer, type UserProfile, type GenerationHistoryItem } from '@/types';
import { generateCommunicationForCustomer, type CommunicationGenerationInput } from '@/ai/flows/generate-communication-flow';
import { addGenerationToHistory } from '@/app/actions/sales';
import { formatDistanceToNow } from 'date-fns';
import { id } from 'date-fns/locale';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipProvider, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';


interface CommunicationGeneratorProps {
  customer: Customer;
  salesPerson: UserProfile;
  onHookGenerated: (customerId: string, newHistoryItem: GenerationHistoryItem) => void;
}

const suggestionChips = [
  "Follow-up partisipasi webinar",
  "Tawarkan jadwal demo produk",
  "Kirim penawaran harga (quotation)",
  "Tanyakan kebutuhan lebih detail",
  "Ingatkan renewal lisensi",
];


export function CommunicationGenerator({ customer, salesPerson, onHookGenerated }: CommunicationGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [generatedSubject, setGeneratedSubject] = useState('');
  const [communicationType, setCommunicationType] = useState<'whatsapp' | 'email' | null>(null);

  // State untuk form baru
  const [communicationIntent, setCommunicationIntent] = useState('');
  const [additionalContext, setAdditionalContext] = useState('');
  const [useCustomerContext, setUseCustomerContext] = useState(true);

  const { toast } = useToast();

  const handleGenerateHook = async (type: 'whatsapp' | 'email') => {
    if (!communicationIntent.trim()) {
      toast({
        variant: 'destructive',
        title: 'Tujuan Pesan Kosong',
        description: 'Harap isi tujuan pesan Anda.',
      });
      return;
    }

    setIsGenerating(true);
    setGeneratedMessage('');
    setGeneratedSubject('');
    setCommunicationType(type);

    try {
      const inputPayload: CommunicationGenerationInput = {
        customerId: customer.id,
        communicationType: type,
        salesName: salesPerson.name,
        communicationIntent: communicationIntent,
        additionalContext: additionalContext,
        useCustomerContext,
      };

      const result = await generateCommunicationForCustomer(inputPayload);

      if (type === 'email' && result.generatedHook.includes('Subject:')) {
        const [subjectLine, ...bodyParts] = result.generatedHook.split('\n\n');
        setGeneratedSubject(subjectLine.replace('Subject: ', ''));
        setGeneratedMessage(bodyParts.join('\n\n'));
      } else {
        setGeneratedMessage(result.generatedHook);
      }

      const historyItem: Omit<GenerationHistoryItem, 'createdAt'> = {
        generationSource: 'AI Assistant',
        type: type,
        userInput: {
          mode: 'text',
          text: `Generate ${type} untuk: ${communicationIntent}`,
          context: additionalContext || 'Tidak ada konteks tambahan.',
        },
        conversationContext: `Pesan ${type} dibuat untuk: ${customer.name}`,
        recommendations: [result.generatedHook],
      };

      await addGenerationToHistory({
        customerId: customer.id,
        customerName: customer.name,
        historyItem,
        actorId: salesPerson.uid,
        actorName: salesPerson.name,
      });

      const newHistoryItemWithDate: GenerationHistoryItem = {
        ...historyItem,
        createdAt: new Date().toISOString()
      };

      onHookGenerated(customer.id, newHistoryItemWithDate);

      toast({ title: 'Pesan berhasil dibuat!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Gagal membuat pesan',
        description: (error as Error).message,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendToWhatsapp = () => {
    if (!customer?.phone || !generatedMessage) return;
    let cleanedPhone = customer.phone.replace(/[^0-9]/g, '');
    if (cleanedPhone.startsWith('0')) {
      cleanedPhone = '62' + cleanedPhone.substring(1);
    }
    const waUrl = `https://wa.me/${cleanedPhone}?text=${encodeURIComponent(generatedMessage)}`;
    window.open(waUrl, '_blank');
  };

  const useHistoryItem = (item: GenerationHistoryItem) => {
    if (!item.recommendations || item.recommendations.length === 0) {
      toast({ variant: 'destructive', title: 'Error', description: 'Riwayat pesan ini tidak memiliki konten.' });
      return;
    }
    const fullMessage = item.recommendations[0];
    const type = fullMessage.toLowerCase().startsWith('subject:') ? 'email' : 'whatsapp';

    setCommunicationType(type);
    setCommunicationIntent(item.userInput.text.replace(/Generate (whatsapp|email) untuk: /i, ''));
    setAdditionalContext(item.userInput.context);

    if (type === 'email') {
      const [subjectLine, ...bodyParts] = fullMessage.split('\n\n');
      setGeneratedSubject(subjectLine.replace('Subject: ', ''));
      setGeneratedMessage(bodyParts.join('\n\n'));
    } else {
      setGeneratedSubject('');
      setGeneratedMessage(fullMessage);
    }
    toast({ title: 'Pesan dari riwayat telah dimuat.' });
  };

  const sortedGenerationHistory = useMemo(() => {
    if (!customer?.generationHistory) return [];
    return [...customer.generationHistory]
      .filter(item => item.generationSource === 'AI Assistant' || !item.generationSource)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [customer?.generationHistory]);

  const whatsappHistory = useMemo(() => sortedGenerationHistory.filter(item => item.type === 'whatsapp').slice(0, 5), [sortedGenerationHistory]);
  const emailHistory = useMemo(() => sortedGenerationHistory.filter(item => item.type === 'email').slice(0, 5), [sortedGenerationHistory]);


  const HistoryTabContent = ({ items }: { items: GenerationHistoryItem[] }) => (
    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
      {items.length > 0 ? (
        items.map((item, index) => (
          <div key={index} className="text-sm p-3 border rounded-md bg-muted/20 relative group">
            <p className="text-xs text-muted-foreground mb-1">
              {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: id })}
            </p>
            <p className="text-foreground line-clamp-2">
              {item.recommendations[0].replace(/Subject:.*\n\n/, '')}
            </p>
            <Button type="button" size="sm" variant="secondary" className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => useHistoryItem(item)}>
              Gunakan Ini
            </Button>
          </div>
        ))
      ) : (
        <p className="text-center text-sm text-muted-foreground py-4">Belum ada riwayat.</p>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-2xl font-bold flex items-center gap-2">
            <Sparkles className="text-primary" />
            <span>AI Assistant untuk {customer.name.split(' ')[0]}</span>
          </CardTitle>
          <CardDescription>Generate pesan pembuka (hook) untuk WhatsApp atau Email berdasarkan data pelanggan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="communicationIntent">Apa tujuan pesan ini?</Label>
            <Input
              id="communicationIntent"
              placeholder="Contoh: Ajak ngopi, Tagih invoice, Tawarkan demo..."
              value={communicationIntent}
              onChange={(e) => setCommunicationIntent(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              {suggestionChips.map(suggestion => (
                <Button key={suggestion} type="button" size="sm" variant="outline" className="text-xs h-7" onClick={() => setCommunicationIntent(suggestion)}>
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="additionalContext">Konteks / Catatan Tambahan (Opsional)</Label>
            <Input
              id="additionalContext"
              placeholder="Contoh: Orangnya sedang sibuk, buat pesan lebih santai"
              value={additionalContext}
              onChange={(e) => setAdditionalContext(e.target.value)}
            />
          </div>

          <div className="flex items-center space-x-2 pt-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="use-customer-context"
                      checked={useCustomerContext}
                      onCheckedChange={(checked) => setUseCustomerContext(!!checked)}
                    />
                    <Label htmlFor="use-customer-context" className="cursor-pointer">
                      Gunakan Data Pelanggan
                    </Label>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Jika aktif, AI akan memakai riwayat produk/webinar pelanggan.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>


          <div className="border-t pt-4 space-y-4">
            <Textarea
              placeholder={isGenerating ? 'AI sedang membuat pesan...' : 'Hasil generate AI akan muncul di sini. Klik tombol di bawah untuk memulai.'}
              value={communicationType === 'email' ? `Subject: ${generatedSubject}\n\n${generatedMessage}` : generatedMessage}
              readOnly={isGenerating}
              onChange={(e) => setGeneratedMessage(e.target.value)}
              rows={8}
              className="bg-muted/30"
            />
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" onClick={() => handleGenerateHook('whatsapp')} disabled={isGenerating}>
                {isGenerating && communicationType === 'whatsapp' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Smartphone className="mr-2 h-4 w-4" />}
                Generate WA
              </Button>
              <Button type="button" onClick={() => handleGenerateHook('email')} disabled={isGenerating}>
                {isGenerating && communicationType === 'email' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                Generate Email
              </Button>
            </div>
            {communicationType === 'whatsapp' && (
              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={!generatedMessage}
                onClick={handleSendToWhatsapp}
              >
                <Send className="mr-2 h-4 w-4" />
                Kirim via WhatsApp
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-headline text-lg font-bold flex items-center gap-2">
            <History className="h-5 w-5" />
            Riwayat Pesan Dibuat
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="whatsapp">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="whatsapp">WhatsApp ({whatsappHistory.length})</TabsTrigger>
              <TabsTrigger value="email">Email ({emailHistory.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="whatsapp" className="mt-4">
              <HistoryTabContent items={whatsappHistory} />
            </TabsContent>
            <TabsContent value="email" className="mt-4">
              <HistoryTabContent items={emailHistory} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
