import { cn } from '@/lib/cn'

export function DevelopedBy({ className }: { className?: string }) {
  return <p className={cn('text-[11px] text-gray-400', className)}>Developed by BizDock</p>
}
