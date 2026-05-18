import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', {
  variants: {
    variant: {
      default: 'bg-vijayanth-green text-white',
      secondary: 'bg-vijayanth-gold text-vijayanth-green',
      success: 'bg-vijayanth-success text-white',
      warning: 'bg-vijayanth-warning text-white',
      danger: 'bg-vijayanth-danger text-white',
      outline: 'border border-vijayanth-border text-vijayanth-green',
    },
  },
  defaultVariants: { variant: 'default' },
});

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
