"use client"

import * as React from "react"
import { format, addDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subMonths } from "date-fns"
import { Calendar as CalendarIcon } from "lucide-react"
import { DateRange } from "react-day-picker"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Separator } from "./separator"

type Preset = {
    label: string
    range: DateRange
}

export function DateRangePicker({
  className,
  range,
  onRangeChange,
}: React.HTMLAttributes<HTMLDivElement> & { range: DateRange | undefined, onRangeChange: (range: DateRange | undefined) => void }) {
  const [preset, setPreset] = React.useState<string | undefined>();

  const presets: Preset[] = React.useMemo(() => {
    const now = new Date();
    return [
      { label: "Hari ini", range: { from: now, to: now } },
      { label: "Kemarin", range: { from: addDays(now, -1), to: addDays(now, -1) } },
      { label: "Minggu ini", range: { from: startOfWeek(now), to: endOfWeek(now) } },
      { label: "7 hari terakhir", range: { from: addDays(now, -6), to: now } },
      { label: "30 hari terakhir", range: { from: addDays(now, -29), to: now } },
      { label: "Bulan ini", range: { from: startOfMonth(now), to: endOfMonth(now) } },
      { label: "Bulan lalu", range: { from: startOfMonth(subMonths(now, 1)), to: endOfMonth(subMonths(now, 1)) } },
    ];
  }, []);
  
  const handlePresetClick = (selectedPreset: Preset) => {
    setPreset(selectedPreset.label);
    onRangeChange(selectedPreset.range);
  };
  
  const handleAllTimeClick = () => {
    setPreset("Semua waktu");
    onRangeChange(undefined); // Set to undefined for "All Time"
  };

  const handleManualDateChange = (newRange: DateRange | undefined) => {
    setPreset("Custom");
    onRangeChange(newRange);
  }

  React.useEffect(() => {
    if (!range) {
        setPreset("Semua waktu");
    } else {
        // If the selected range matches a preset, highlight that preset.
        const matchingPreset = presets.find(p => 
            p.range.from?.toDateString() === range.from?.toDateString() &&
            p.range.to?.toDateString() === range.to?.toDateString()
        );
        if (matchingPreset) {
            setPreset(matchingPreset.label);
        } else {
            setPreset("Custom");
        }
    }
}, [range, presets]);


  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-[300px] justify-start text-left font-normal",
              !range && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {range?.from ? (
              range.to ? (
                <>
                  {format(range.from, "LLL dd, y")} -{" "}
                  {format(range.to, "LLL dd, y")}
                </>
              ) : (
                format(range.from, "LLL dd, y")
              )
            ) : (
              <span>Pilih rentang tanggal</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="flex w-auto p-0" align="start">
            <div className="flex w-full">
                <div className="w-48 border-r">
                    <div className="p-2">
                        <Button
                            onClick={() => setPreset("Custom")}
                            variant={preset === 'Custom' ? 'secondary' : 'ghost'}
                            className="w-full justify-start px-2 py-1.5 text-sm"
                        >
                            Custom
                        </Button>
                    </div>
                    <Separator />
                    <div className="p-2">
                        {presets.map(p => (
                            <Button
                                key={p.label}
                                onClick={() => handlePresetClick(p)}
                                variant={preset === p.label ? 'secondary' : 'ghost'}
                                className="w-full justify-start px-2 py-1.5 text-sm"
                            >
                                {p.label}
                            </Button>
                        ))}
                    </div>
                     <Separator />
                     <div className="p-2">
                         <Button
                            onClick={handleAllTimeClick}
                            variant={preset === 'Semua waktu' ? 'secondary' : 'ghost'}
                            className="w-full justify-start px-2 py-1.5 text-sm"
                         >
                            Semua waktu
                         </Button>
                    </div>
                </div>
                 <Calendar
                    initialFocus
                    mode="range"
                    defaultMonth={range?.from}
                    selected={range}
                    onSelect={handleManualDateChange}
                    numberOfMonths={2}
                />
            </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
