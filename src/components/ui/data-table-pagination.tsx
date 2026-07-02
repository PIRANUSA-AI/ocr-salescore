
'use client';

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';

interface DataTablePaginationProps {
  totalItems: number;
  itemsPerPage: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (value: number) => void;
}

export function DataTablePagination({
  totalItems,
  itemsPerPage,
  currentPage,
  onPageChange,
  onItemsPerPageChange,
}: DataTablePaginationProps) {
  const pageCount = Math.ceil(totalItems / itemsPerPage);
  const [goToPage, setGoToPage] = useState('');

  const handleGoToPage = () => {
    const pageNumber = parseInt(goToPage, 10);
    if (pageNumber >= 1 && pageNumber <= pageCount) {
      onPageChange(pageNumber);
      setGoToPage('');
    }
  };
  
  const getPaginationGroup = () => {
    const SIBLING_COUNT = 1;
    const totalPageNumbers = SIBLING_COUNT + 5;

    if (pageCount <= totalPageNumbers) {
      return Array.from({ length: pageCount }, (_, i) => i + 1);
    }

    const leftSiblingIndex = Math.max(currentPage - SIBLING_COUNT, 1);
    const rightSiblingIndex = Math.min(
      currentPage + SIBLING_COUNT,
      pageCount
    );

    const shouldShowLeftDots = leftSiblingIndex > 2;
    const shouldShowRightDots = rightSiblingIndex < pageCount - 2;

    const firstPageIndex = 1;
    const lastPageIndex = pageCount;

    if (!shouldShowLeftDots && shouldShowRightDots) {
      let leftItemCount = 3 + 2 * SIBLING_COUNT;
      let leftRange = Array.from({ length: leftItemCount }, (_, i) => i + 1);
      return [...leftRange, '...', pageCount];
    }

    if (shouldShowLeftDots && !shouldShowRightDots) {
      let rightItemCount = 3 + 2 * SIBLING_COUNT;
      let rightRange = Array.from({ length: rightItemCount }, (_, i) => pageCount - rightItemCount + 1 + i);
      return [firstPageIndex, '...', ...rightRange];
    }

    if (shouldShowLeftDots && shouldShowRightDots) {
      let middleRange = Array.from({ length: rightSiblingIndex - leftSiblingIndex + 1 }, (_, i) => leftSiblingIndex + i);
      return [firstPageIndex, '...', ...middleRange, '...', lastPageIndex];
    }
    
    return []; // Should not happen
  };

  const paginationRange = useMemo(getPaginationGroup, [currentPage, pageCount]);


  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 py-4 text-sm text-muted-foreground">
        <div className="flex items-center space-x-2">
            <p className="whitespace-nowrap">Data per halaman</p>
            <Select
              value={`${itemsPerPage}`}
              onValueChange={(value) => {
                onItemsPerPageChange(Number(value));
              }}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={itemsPerPage} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 40, 50].map((pageSize) => (
                  <SelectItem key={pageSize} value={`${pageSize}`}>
                    {pageSize}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
        </div>
      <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 lg:gap-8">
        <div className="flex items-center space-x-2">
            <p className="whitespace-nowrap">Halaman {currentPage} dari {pageCount || 1}</p>
            <div className="flex items-center space-x-1">
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
              >
                <span className="sr-only">Halaman pertama</span>
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
              >
                <span className="sr-only">Halaman sebelumnya</span>
                <ChevronLeftIcon className="h-4 w-4" />
              </Button>

                {paginationRange.map((pageNumber, index) => {
                    if (pageNumber === '...') {
                        return <span key={`dots-${index}`} className="px-2">...</span>;
                    }
                    return (
                        <Button
                            key={pageNumber}
                            variant={currentPage === pageNumber ? 'default' : 'outline'}
                            className="h-8 w-8 p-0"
                            onClick={() => onPageChange(pageNumber as number)}
                        >
                            {pageNumber}
                        </Button>
                    )
                })}
              
              <Button
                variant="outline"
                className="h-8 w-8 p-0"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === pageCount}
              >
                <span className="sr-only">Halaman selanjutnya</span>
                <ChevronRightIcon className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                className="hidden h-8 w-8 p-0 lg:flex"
                onClick={() => onPageChange(pageCount)}
                disabled={currentPage === pageCount}
              >
                <span className="sr-only">Halaman terakhir</span>
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
        </div>
        <div className="flex items-center space-x-2">
            <Input
              type="number"
              className="h-8 w-16"
              placeholder="Halaman"
              value={goToPage}
              onChange={(e) => setGoToPage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleGoToPage();
                }
              }}
            />
            <Button variant="outline" size="sm" onClick={handleGoToPage}>
              Go
            </Button>
        </div>
      </div>
    </div>
  );
}
