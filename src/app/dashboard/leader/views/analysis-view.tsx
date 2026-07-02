'use client';

import { AnalysisManager } from '../components/analysis-manager';
import { ProspectManager } from '../components/prospect-manager';
import { FadeIn } from '@/components/ui/fade-in';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, History } from "lucide-react";

export default function AnalysisView() {
  return (
    <FadeIn>
      <Card className="min-h-[85vh] flex flex-col border-0 shadow-none">
        <CardHeader className="border-b pb-0 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="font-headline text-3xl font-bold">Pusat Analisis</CardTitle>
              <CardDescription>Jalankan analisis AI baru atau kelola hasil analisis sebelumnya.</CardDescription>
            </div>
          </div>
          <Tabs defaultValue="new" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="new"
                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                <Bot className="mr-2 h-4 w-4" />
                Analisis Baru
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="relative h-10 rounded-none border-b-2 border-transparent bg-transparent px-4 pb-3 pt-2 font-medium text-muted-foreground shadow-none transition-none data-[state=active]:border-primary data-[state=active]:text-primary data-[state=active]:shadow-none"
              >
                <History className="mr-2 h-4 w-4" />
                Riwayat & Prospek
              </TabsTrigger>
            </TabsList>
            <CardContent className="flex-1 p-6">
              <TabsContent value="new" className="mt-0 border-0 p-0 outline-none">
                <AnalysisManager embedded />
              </TabsContent>
              <TabsContent value="history" className="mt-0 border-0 p-0 outline-none">
                <ProspectManager embedded />
              </TabsContent>
            </CardContent>
          </Tabs>
        </CardHeader>
      </Card>
    </FadeIn>
  );
}
