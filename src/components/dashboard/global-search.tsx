'use client';

import * as React from "react"
import {
    Calculator,
    Calendar,
    CreditCard,
    Settings,
    Smile,
    User,
    Search,
    Loader2,
    Users,
    Building2,
    Pencil,
    Eye
} from "lucide-react"

import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
    CommandShortcut,
} from "@/components/ui/command"
import { Button } from "@/components/ui/button";
import { searchGlobal, type SearchResult } from "@/app/actions/global";
import { useRouter } from "next/navigation";

import { useAuth } from "@/hooks/use-auth";

export function GlobalSearch() {
    const [open, setOpen] = React.useState(false);
    const [query, setQuery] = React.useState("");
    const [results, setResults] = React.useState<SearchResult[]>([]);
    const [isLoading, setIsLoading] = React.useState(false);
    const [filterType, setFilterType] = React.useState<'all' | 'Customer' | 'Company'>('all');
    const router = useRouter();
    const { user, userProfile } = useAuth();

    React.useEffect(() => {
        const down = (e: KeyboardEvent) => {
            if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                setOpen((open) => !open)
            }
        }

        document.addEventListener("keydown", down)
        return () => document.removeEventListener("keydown", down)
    }, [])

    // Debounce search
    React.useEffect(() => {
        const timer = setTimeout(async () => {
            if (query.length >= 2 && user && userProfile) {
                setIsLoading(true);
                try {
                    const data = await searchGlobal(query, {
                        role: userProfile.role,
                        team: userProfile.team,
                        uid: user.uid
                    });
                    setResults(data);
                } catch (error) {
                    console.error(error);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setResults([]);
            }
        }, 300);

        return () => clearTimeout(timer);
    }, [query, user, userProfile]);

    const handleSelect = (result: SearchResult) => {
        setOpen(false);
        if (result.url) {
            // If URL is query param based, we might need to handle it carefully to force re-render if already on page
            // But router.push usually works fine.
            router.push(result.url);
        }
    }

    return (
        <>
            <Button
                variant="outline"
                className="relative h-9 w-full justify-start rounded-[0.5rem] bg-background text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-40 lg:w-64"
                onClick={() => setOpen(true)}
            >
                <span className="hidden lg:inline-flex">Cari pelanggan...</span>
                <span className="inline-flex lg:hidden">Cari...</span>
                <kbd className="pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
                    <span className="text-xs">⌘</span>K
                </kbd>
            </Button>
            <CommandDialog open={open} onOpenChange={setOpen}>
                <CommandInput placeholder="Cari nama, perusahaan, email, tim, atau no. hp..." value={query} onValueChange={setQuery} />
                <CommandList>
                    <div className="flex items-center gap-2 p-2 border-b">
                        <Button
                            variant={filterType === 'all' ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs rounded-full"
                            onClick={() => setFilterType('all')}
                        >
                            Semua
                        </Button>
                        <Button
                            variant={filterType === 'Customer' ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs rounded-full"
                            onClick={() => setFilterType('Customer')}
                        >
                            Pelanggan
                        </Button>
                        <Button
                            variant={filterType === 'Company' ? "secondary" : "ghost"}
                            size="sm"
                            className="h-7 text-xs rounded-full"
                            onClick={() => setFilterType('Company')}
                        >
                            Perusahaan
                        </Button>
                    </div>

                    <CommandEmpty>
                        {isLoading ? (
                            <div className="flex items-center justify-center p-4">
                                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Mencari...
                            </div>
                        ) : (
                            "Tidak ada hasil ditemukan."
                        )}
                    </CommandEmpty>

                    {results.length > 0 && (
                        <>
                            {/* Company Results */}
                            {(filterType === 'all' || filterType === 'Company') && results.filter(r => r.type === 'Company').length > 0 && (
                                <CommandGroup heading="Perusahaan">
                                    {results.filter(r => r.type === 'Company').map((result) => (
                                        <CommandItem
                                            key={result.id}
                                            value={`${result.title} ${result.subtitle}`}
                                            onSelect={() => {
                                                setOpen(false); // Close dialog
                                                // Navigate to Company View with search param
                                                // result.url is currently /dashboard?view=customer-manager&search=...
                                                // We want /dashboard?view=company&search=...
                                                // We can parse result.url or just construct it here using title
                                                router.push(`/dashboard?view=company&search=${encodeURIComponent(result.title)}`);
                                            }}
                                            className="group flex justify-between items-center cursor-pointer"
                                        >
                                            <div className="flex items-center">
                                                <Building2 className="mr-2 h-4 w-4" />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{result.title}</span>
                                                    <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                                                </div>
                                            </div>
                                            {/* Action Shortcuts Removed as per request */}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {/* Customer Results */}
                            {(filterType === 'all' || filterType === 'Customer') && results.filter(r => r.type === 'Customer').length > 0 && (
                                <CommandGroup heading="Pelanggan & Leads">
                                    {results.filter(r => r.type === 'Customer').map((result) => (
                                        <CommandItem
                                            key={result.id}
                                            value={`${result.title} ${result.subtitle}`}
                                            onSelect={() => {
                                                setOpen(false);
                                                router.push(`/dashboard?view=customer-manager&search=${encodeURIComponent(result.title)}`);
                                            }}
                                            className="group flex justify-between items-center cursor-pointer"
                                        >
                                            <div className="flex items-center">
                                                <User className="mr-2 h-4 w-4" />
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{result.title}</span>
                                                    <span className="text-xs text-muted-foreground">{result.subtitle}</span>
                                                </div>
                                            </div>
                                            {/* Action Shortcuts Removed as per request */}
                                        </CommandItem>
                                    ))}
                                </CommandGroup>
                            )}

                            {/* Navigation Results (Fallback/Always present if needed, but not in search results from server usually) */}
                            {/* We keep the separator if results exist, but logic below handles 'No Results' */}
                        </>
                    )}

                    <CommandSeparator />
                    <CommandGroup heading="Navigasi Cepat">
                        <CommandItem onSelect={() => { router.push('/dashboard?view=customers'); setOpen(false); }}>
                            <Users className="mr-2 h-4 w-4" />
                            <span>Semua Pelanggan</span>
                        </CommandItem>
                        <CommandItem onSelect={() => { router.push('/dashboard?view=report'); setOpen(false); }}>
                            <Calculator className="mr-2 h-4 w-4" />
                            <span>Laporan</span>
                        </CommandItem>
                    </CommandGroup>
                </CommandList>
            </CommandDialog>
        </>
    )
}
