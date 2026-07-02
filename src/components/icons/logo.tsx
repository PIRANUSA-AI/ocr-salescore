import Image from 'next/image';
import { cn } from '@/lib/utils';
import type { SVGProps } from 'react';

export function Logo(props: SVGProps<SVGSVGElement> & { width?: number, height?: number }) {
  const { width = 32, height = 32, ...rest } = props;
  return (
    <Image
      src="/Logo.svg"
      alt="SalesCore Logo"
      width={width}
      height={height}
      className={cn(rest.className)}
      priority
    />
  );
}
