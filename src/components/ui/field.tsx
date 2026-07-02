// src/components/ui/field.tsx
'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Label as HeadlessLabel } from '@/components/ui/label';

export const FieldSet = React.forwardRef<
  HTMLFieldSetElement,
  React.ComponentPropsWithoutRef<'fieldset'>
>(({ className, ...props }, ref) => {
  return (
    <fieldset
      ref={ref}
      className={cn('space-y-6', className)}
      suppressHydrationWarning={true}
      {...props}
    />
  );
});
FieldSet.displayName = 'FieldSet';

export const FieldGroup = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn('space-y-4', className)}
      suppressHydrationWarning={true}
      {...props}
    />
  );
});
FieldGroup.displayName = 'FieldGroup';

export const Field = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<'div'>
>(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('grid gap-2', className)} suppressHydrationWarning={true} {...props} />;
});
Field.displayName = 'Field';

export const FieldLabel = React.forwardRef<
  React.ElementRef<typeof HeadlessLabel>,
  React.ComponentPropsWithoutRef<typeof HeadlessLabel>
>(({ className, ...props }, ref) => {
  return <HeadlessLabel ref={ref} className={cn(className)} {...props} />;
});
FieldLabel.displayName = 'FieldLabel';

export const FieldDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<'p'>
>(({ className, ...props }, ref) => {
  return (
    <p
      ref={ref}
      className={cn('text-xs text-muted-foreground', className)}
      {...props}
    />
  );
});
FieldDescription.displayName = 'FieldDescription';
